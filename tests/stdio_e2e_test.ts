import { assert, assertEquals, assertExists } from "@std/assert";

const FIXTURE = new URL("./fixtures/stdio_server.ts", import.meta.url).pathname;
const REPOSITORY = new URL("..", import.meta.url).pathname;
const PROTOCOL_VERSION = "2026-07-28";
const PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_INFO_KEY = "io.modelcontextprotocol/clientInfo";
const CLIENT_CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities";
const VIEWER_URI = "ui://mcp-syson/model-explorer-viewer";

type JsonRpc = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

Deno.test("stdio serves modern discovery, contracts and UI resources", async () => {
  const process = startFixture();
  try {
    const discovered = await process.request(
      modernRequest(1, "server/discover"),
    );
    assertEquals(discovered.error, undefined);
    assertEquals(discovered.result?.supportedVersions, [PROTOCOL_VERSION]);
    assertEquals(discovered.result?.resultType, "complete");
    assert(
      String(discovered.result?.instructions).includes("syson_project_list"),
    );

    const listed = await process.request(modernRequest(2, "tools/list"));
    assertEquals(listed.error, undefined);
    assertEquals(listed.result?.resultType, "complete");
    const tools = listed.result?.tools as Array<Record<string, unknown>>;
    const projectList = tools.find((tool) =>
      tool.name === "syson_project_list"
    );
    assertExists(projectList);
    assertEquals(projectList.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
    assertEquals(
      (projectList.outputSchema as { type?: unknown }).type,
      "object",
    );
    for (
      const toolName of [
        "syson_element_rename",
        "syson_diagram_arrange",
        "syson_value_set",
      ]
    ) {
      const overwritingMutation = tools.find((tool) => tool.name === toolName);
      assertExists(overwritingMutation);
      assertEquals(overwritingMutation.annotations, {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      });
    }

    const viewer = await process.request(
      modernRequest(3, "resources/read", { uri: VIEWER_URI }),
    );
    assertEquals(viewer.error, undefined);
    const viewerText = (viewer.result?.contents as Array<{ text: string }>)[0]
      .text;
    assert(viewerText.includes("Model Explorer"));
  } finally {
    await process.close();
  }
});

function startFixture(): StdioProcess {
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--cached-only",
      `--allow-read=${REPOSITORY}`,
      FIXTURE,
    ],
    cwd: REPOSITORY,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  return new StdioProcess(child);
}

class StdioProcess {
  readonly #child: Deno.ChildProcess;
  readonly #writer: WritableStreamDefaultWriter<Uint8Array>;
  readonly #reader: ReadableStreamDefaultReader<string>;
  readonly #stderr: Promise<string>;
  #buffer = "";
  #pending: JsonRpc[] = [];

  constructor(child: Deno.ChildProcess) {
    this.#child = child;
    this.#writer = child.stdin.getWriter();
    this.#reader = child.stdout.pipeThrough(new TextDecoderStream())
      .getReader();
    this.#stderr = new Response(child.stderr).text();
  }

  async request(message: JsonRpc): Promise<JsonRpc> {
    assertExists(message.id);
    await this.#send(message);
    while (true) {
      const response = await this.#readNext();
      if (response.id === message.id) return response;
    }
  }

  async close(): Promise<void> {
    await this.#writer.close();
    const status = await this.#child.status;
    const stderr = await this.#stderr;
    await this.#reader.cancel();
    assertEquals(status.success, true, `stdio fixture failed:\n${stderr}`);
    assert(
      !stderr.includes("Tools available:"),
      `stdio must not emit a tool counter:\n${stderr}`,
    );
  }

  async #send(message: JsonRpc): Promise<void> {
    await this.#writer.write(
      new TextEncoder().encode(`${JSON.stringify(message)}\n`),
    );
  }

  async #readNext(): Promise<JsonRpc> {
    while (this.#pending.length === 0) {
      const { done, value } = await this.#reader.read();
      if (done) {
        const stderr = await this.#stderr;
        throw new Error(`stdio fixture exited before replying:\n${stderr}`);
      }
      this.#buffer += value;
      const lines = this.#buffer.split("\n");
      this.#buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim().length > 0) {
          this.#pending.push(JSON.parse(line) as JsonRpc);
        }
      }
    }
    return this.#pending.shift()!;
  }
}

function modernRequest(
  id: number,
  method: string,
  params: Record<string, unknown> = {},
): JsonRpc {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: {
      ...params,
      _meta: {
        [PROTOCOL_VERSION_KEY]: PROTOCOL_VERSION,
        [CLIENT_INFO_KEY]: { name: "mcp-syson-stdio-test", version: "1.0.0" },
        [CLIENT_CAPABILITIES_KEY]: {},
      },
    },
  } as JsonRpc;
}

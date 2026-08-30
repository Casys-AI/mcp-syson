/**
 * Exercise an already-started HTTP image and a fresh stdio image process.
 * It produces a release attestation with stable fingerprints rather than
 * treating a mutable tag or a source checkout as runtime evidence.
 */

const PROTOCOL_VERSION = "2026-07-28";
const PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities";
const UI_URI = "ui://mcp-syson/model-explorer-viewer";
const AQL_ESCAPE_HATCHES = new Set(["syson_query_aql", "syson_query_eval"]);

type JsonRecord = Record<string, unknown>;
type JsonRpc = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: JsonRecord;
};

interface McpClient {
  request(method: string, params?: JsonRecord): Promise<JsonRecord>;
}

class HttpMcpClient implements McpClient {
  #id = 0;

  constructor(private readonly url: string) {}

  async request(method: string, params: JsonRecord = {}): Promise<JsonRecord> {
    const body = modernRequest(++this.#id, method, params);
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": PROTOCOL_VERSION,
        "Mcp-Method": method,
        ...(typeof params.name === "string"
          ? { "Mcp-Name": params.name }
          : typeof params.uri === "string"
          ? { "Mcp-Name": params.uri }
          : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} for ${method}: ${await response.text()}`,
      );
    }
    const payload = await response.json() as {
      result?: JsonRecord;
      error?: unknown;
    };
    if (!payload.result) {
      throw new Error(
        `MCP HTTP ${method} failed: ${JSON.stringify(payload.error)}`,
      );
    }
    return payload.result;
  }
}

class StdioMcpClient implements McpClient {
  #id = 0;
  #buffer = "";
  #pending: Array<{ id?: number; result?: JsonRecord; error?: unknown }> = [];
  #writer: WritableStreamDefaultWriter<Uint8Array>;
  #reader: ReadableStreamDefaultReader<string>;
  #stderr: Promise<string>;

  constructor(private readonly child: Deno.ChildProcess) {
    this.#writer = child.stdin.getWriter();
    this.#reader = child.stdout.pipeThrough(new TextDecoderStream())
      .getReader();
    this.#stderr = new Response(child.stderr).text();
  }

  static start(image: string): StdioMcpClient {
    return new StdioMcpClient(new Deno.Command("docker", {
      args: ["run", "--rm", "-i", image, "--stdio"],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn());
  }

  async request(method: string, params: JsonRecord = {}): Promise<JsonRecord> {
    const request = modernRequest(++this.#id, method, params);
    await this.#writer.write(
      new TextEncoder().encode(`${JSON.stringify(request)}\n`),
    );
    while (true) {
      const next = await this.next();
      if (next.id !== request.id) continue;
      if (!next.result) {
        throw new Error(
          `MCP stdio ${method} failed: ${JSON.stringify(next.error)}`,
        );
      }
      return next.result;
    }
  }

  async close(): Promise<void> {
    await this.#writer.close();
    const status = await this.child.status;
    const stderr = await this.#stderr;
    await this.#reader.cancel();
    if (!status.success) {
      throw new Error(`stdio image exited unsuccessfully:\n${stderr}`);
    }
  }

  private async next(): Promise<
    { id?: number; result?: JsonRecord; error?: unknown }
  > {
    while (this.#pending.length === 0) {
      const { done, value } = await this.#reader.read();
      if (done) {
        throw new Error(
          `stdio image exited before replying:\n${await this.#stderr}`,
        );
      }
      this.#buffer += value;
      const lines = this.#buffer.split("\n");
      this.#buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) this.#pending.push(JSON.parse(line));
      }
    }
    return this.#pending.shift()!;
  }
}

async function inspectStdio(
  image: string,
  version: string,
): Promise<JsonRecord> {
  const client = StdioMcpClient.start(image);
  try {
    return await inspectTransport(client, "stdio", version);
  } finally {
    await client.close();
  }
}

async function inspectTransport(
  client: McpClient,
  transport: "http" | "stdio",
  version: string,
): Promise<JsonRecord> {
  const discovered = await client.request("server/discover");
  if (transport === "http") {
    const serverInfo = discovered.serverInfo as JsonRecord | undefined;
    assertEqual(serverInfo?.name, "mcp-syson", "HTTP server name");
    assertEqual(serverInfo?.version, version, "HTTP server version");
  } else {
    assertEqual(
      discovered.supportedVersions,
      [PROTOCOL_VERSION],
      "stdio supported protocol version",
    );
    assertEqual(
      discovered.resultType,
      "complete",
      "stdio discovery result type",
    );
  }

  const listed = await client.request("tools/list");
  const tools = listed.tools as JsonRecord[];
  if (!Array.isArray(tools)) {
    throw new Error(`${transport} tools/list did not return a tools array`);
  }
  for (const tool of tools) {
    const name = tool.name;
    const inputSchema = tool.inputSchema as JsonRecord;
    if (typeof name !== "string" || !inputSchema) {
      throw new Error(`${transport} malformed tool`);
    }
    if (!AQL_ESCAPE_HATCHES.has(name)) {
      assertEqual(
        inputSchema.additionalProperties,
        false,
        `${transport} ${name} input closure`,
      );
    }
  }
  for (const name of ["syson_diagram_snapshot", "syson_constraint_validate"]) {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool?.outputSchema) {
      throw new Error(`${transport} ${name} has no output schema`);
    }
  }
  for (const name of ["syson_project_create", "syson_element_get"]) {
    if (!tools.some((tool) => tool.name === name)) {
      throw new Error(`${transport} is missing required ${name}`);
    }
  }

  const resource = await client.request("resources/read", { uri: UI_URI });
  const contents = resource.contents as Array<{ text?: unknown }>;
  if (
    !Array.isArray(contents) ||
    !String(contents[0]?.text).includes("Model Explorer")
  ) {
    throw new Error(`${transport} did not serve ${UI_URI}`);
  }

  const evaluated = await client.request("tools/call", {
    name: "syson_constraint_evaluate",
    arguments: { constraints: [], values: {} },
  });
  const structured = evaluated.structuredContent as JsonRecord | undefined;
  assertEqual(structured?.summary, {
    total: 0,
    pass: 0,
    fail: 0,
    error: 0,
    unresolved: 0,
  }, `${transport} tool call`);

  return {
    serverDiscoverFingerprint: await fingerprint(discovered),
    toolContractsFingerprint: await fingerprint(tools),
    uiResourcesFingerprint: await fingerprint(resource),
  };
}

function modernRequest(
  id: number,
  method: string,
  params: JsonRecord = {},
): JsonRpc {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: {
      ...params,
      _meta: {
        [PROTOCOL_VERSION_KEY]: PROTOCOL_VERSION,
        [CLIENT_CAPABILITIES_KEY]: {},
      },
    },
  };
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

async function fingerprint(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${
    Array.from(new Uint8Array(digest)).map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
  }`;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function parseArgs(args: readonly string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(
        "Usage: --image IMAGE --http-url URL --version VERSION --revision REVISION --image-digest DIGEST [--output PATH]",
      );
    }
    values.set(key, value);
  }
  const required = (key: string) => {
    const value = values.get(key);
    if (!value) throw new Error(`Missing ${key}`);
    return value;
  };
  return {
    image: required("--image"),
    httpUrl: required("--http-url"),
    version: required("--version"),
    revision: required("--revision"),
    imageDigest: required("--image-digest"),
    output: values.get("--output"),
  };
}

const options = parseArgs(Deno.args);
const http = new HttpMcpClient(options.httpUrl);
const httpEvidence = await inspectTransport(http, "http", options.version);
const stdioEvidence = await inspectStdio(options.image, options.version);

assertEqual(
  httpEvidence.toolContractsFingerprint,
  stdioEvidence.toolContractsFingerprint,
  "HTTP and stdio tools/contracts differ",
);
assertEqual(
  httpEvidence.uiResourcesFingerprint,
  stdioEvidence.uiResourcesFingerprint,
  "HTTP and stdio UI resources differ",
);
const manifest = {
  schemaVersion: "mcp-syson-runtime-contract/1.0",
  packageVersion: options.version,
  sourceRevision: options.revision,
  image: options.image,
  imageDigest: options.imageDigest,
  generatedAt: new Date().toISOString(),
  transports: {
    http: httpEvidence,
    stdio: stdioEvidence,
  },
};

const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
if (options.output) await Deno.writeTextFile(options.output, encoded);
console.log(encoded);

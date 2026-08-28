/** Real SysON stdio bootstrap used by the subprocess protocol test. */

import { main } from "../../server.ts";

await main(["--stdio"]);

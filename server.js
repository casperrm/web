import http from "node:http";
import { createApp, readConfig } from "./lib/app.js";

const config = readConfig();
const port = Number(process.env.PORT) || 3000;

if (!config.resendApiKey && !config.dryRun) {
  console.warn("[intake] RESEND_API_KEY is not set — submissions will fail until it is configured.");
}

http.createServer(createApp(config)).listen(port, () => {
  console.log(`[intake] Cedar Point Media intake running on http://localhost:${port}`);
});

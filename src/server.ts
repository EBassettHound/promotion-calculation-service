import "dotenv/config";
import { createApp } from "./http/app";

const port = Number(process.env.PORT || 3000);
const app = createApp();

const server = app.listen(port, () => {
  console.log(JSON.stringify({ level: "info", event: "server_started", port }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", event: "shutdown_started", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

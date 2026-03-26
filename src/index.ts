import { serve } from "@hono/node-server";
import { createApp, validateEnv } from "./app.js";
import { log } from "./logger.js";

const config = validateEnv();
const { app } = createApp(config);

const port = Number(process.env.PORT || 4200);

serve({ fetch: app.fetch, port }, (info) => {
  log({ event: "startup", port: info.port });
});

import { Hono } from "hono";
import { correlationMiddleware } from "./middleware/correlation.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createScenarioMiddleware } from "./middleware/scenarios.js";
import { profileRoutes } from "./routes/profile.js";
import { labelRoutes } from "./routes/labels.js";
import { messageRoutes } from "./routes/messages.js";
import { threadRoutes } from "./routes/threads.js";
import { draftRoutes } from "./routes/drafts.js";
import { adminRoutes } from "./routes/admin.js";
import { EmailStore } from "./store.js";
import { createScenarioState } from "./scenarios.js";
import { DEFAULT_SEED } from "./seed.js";
import { log } from "./logger.js";

export type AppConfig = {
  /** Bearer token the broker uses to authenticate. */
  brokerToken: string;
};

export function createApp(config: AppConfig) {
  const store = new EmailStore(DEFAULT_SEED);
  const scenarioState = createScenarioState();
  const app = new Hono();

  // Correlation ID on all requests
  app.use("*", correlationMiddleware);

  // Health check (no auth required)
  app.get("/health", (c) => c.json({ status: "ok" }));

  // Admin routes (no auth — only reachable on internal network)
  app.route("/admin", adminRoutes(store, scenarioState));

  // Auth required for Gmail routes
  app.use("/gmail/*", createAuthMiddleware(config.brokerToken));

  // Failure scenario injection on Gmail routes
  app.use("/gmail/*", createScenarioMiddleware(scenarioState));

  // Gmail API routes
  const gmail = new Hono();
  gmail.route("/v1/users/me/profile", profileRoutes(store));
  gmail.route("/v1/users/me/labels", labelRoutes(store));
  gmail.route("/v1/users/me/messages", messageRoutes(store));
  gmail.route("/v1/users/me/threads", threadRoutes(store));
  gmail.route("/v1/users/me/drafts", draftRoutes(store));

  app.route("/gmail", gmail);

  log({ event: "app_created", messagesTotal: store.getProfile().messagesTotal });

  return { app, store };
}

/**
 * Validates required env vars at startup. Fails hard — fail-closed.
 */
export function validateEnv(): AppConfig {
  const brokerToken = process.env.BROKER_TOKEN;
  if (!brokerToken) {
    throw new Error(
      "BROKER_TOKEN env var is required. Mock email service cannot start without it.",
    );
  }

  log({ event: "config_validated" });

  return { brokerToken };
}

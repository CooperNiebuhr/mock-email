import { createMiddleware } from "hono/factory";
import type { ScenarioState } from "../types.js";

/**
 * Failure scenario injection middleware.
 *
 * Checks the scenario state before each request and short-circuits
 * with the appropriate error response. The state is per-app-instance
 * (not a module singleton) to avoid leaking between tests.
 */
export function createScenarioMiddleware(state: ScenarioState) {
  return createMiddleware(async (c, next) => {
    const scenario = state.active;
    if (!scenario) {
      await next();
      return;
    }

    const correlationId = c.get("correlationId") ?? "unknown";

    switch (scenario) {
      case "auth_failure":
        return c.json(
          { error: { code: 401, message: "Simulated auth failure", status: "UNAUTHENTICATED" }, correlationId },
          401,
        );

      case "timeout":
        // Delay 30s — should trigger client-side timeout
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        return c.json({ error: { code: 504, message: "Simulated timeout", status: "DEADLINE_EXCEEDED" }, correlationId }, 504);

      case "malformed_response":
        return c.text("{malformed json!!! <<< broken", 200);

      case "server_error":
        return c.json(
          { error: { code: 500, message: "Simulated internal server error", status: "INTERNAL" }, correlationId },
          500,
        );

      case "rate_limit":
        c.header("Retry-After", "60");
        return c.json(
          { error: { code: 429, message: "Simulated rate limit exceeded", status: "RESOURCE_EXHAUSTED" }, correlationId },
          429,
        );

      case "not_found":
        return c.json(
          { error: { code: 404, message: "Simulated not found", status: "NOT_FOUND" }, correlationId },
          404,
        );
    }
  });
}

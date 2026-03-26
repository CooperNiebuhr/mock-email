import { createMiddleware } from "hono/factory";
import crypto from "node:crypto";

const HEADER = "x-correlation-id";

/**
 * Extracts or generates a correlation ID for every request.
 *
 * Same pattern as ai-proxy and broker.
 */
export const correlationMiddleware = createMiddleware(async (c, next) => {
  const id = c.req.header(HEADER) || crypto.randomUUID();
  c.set("correlationId", id);
  await next();
  c.header(HEADER, id);
});

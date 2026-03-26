import { createMiddleware } from "hono/factory";
import crypto from "node:crypto";

/**
 * Bearer token auth middleware — constant-time comparison.
 *
 * Follows the same pattern as ai-proxy. The token is the broker-owned
 * credential, NOT Operator's token.
 */
export function createAuthMiddleware(expectedToken: string) {
  const expectedBuf = Buffer.from(expectedToken, "utf-8");

  return createMiddleware(async (c, next) => {
    const correlationId = c.get("correlationId") ?? "unknown";
    const authHeader = c.req.header("authorization");

    if (!authHeader) {
      return c.json({ error: { code: 401, message: "Missing authorization header", status: "UNAUTHENTICATED" }, correlationId }, 401);
    }

    if (!authHeader.startsWith("Bearer ")) {
      return c.json({ error: { code: 401, message: "Invalid authorization scheme", status: "UNAUTHENTICATED" }, correlationId }, 401);
    }

    const token = authHeader.slice("Bearer ".length);
    const tokenBuf = Buffer.from(token, "utf-8");

    const valid =
      tokenBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(tokenBuf, expectedBuf);

    if (!valid) {
      return c.json({ error: { code: 401, message: "Invalid token", status: "UNAUTHENTICATED" }, correlationId }, 401);
    }

    await next();
  });
}

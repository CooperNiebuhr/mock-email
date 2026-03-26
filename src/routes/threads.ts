import { Hono } from "hono";
import type { EmailStore } from "../store.js";
import type { MessageFormat, ModifyThreadRequest } from "../types.js";

export function threadRoutes(store: EmailStore) {
  const router = new Hono();

  // GET /gmail/v1/users/me/threads
  router.get("/", (c) => {
    const labelIdsRaw = c.req.queries("labelIds") ?? [];
    const maxResultsRaw = c.req.query("maxResults");
    const maxResults = maxResultsRaw !== undefined ? Math.max(1, Number(maxResultsRaw) || 1) : undefined;
    const pageToken = c.req.query("pageToken") ?? undefined;

    const result = store.listThreads({ labelIds: labelIdsRaw.length ? labelIdsRaw : undefined, maxResults, pageToken });
    return c.json(result);
  });

  // GET /gmail/v1/users/me/threads/:id
  router.get("/:id", (c) => {
    const format = (c.req.query("format") ?? "full") as MessageFormat;

    if (format === "raw" || format === "metadata") {
      return c.json(
        { error: { code: 400, message: `format=${format} is not implemented in Phase 1`, status: "UNIMPLEMENTED" } },
        400,
      );
    }

    const thread = store.getThread(c.req.param("id"), format);
    if (!thread) {
      return c.json(
        { error: { code: 404, message: "Thread not found", status: "NOT_FOUND" } },
        404,
      );
    }
    return c.json(thread);
  });

  // POST /gmail/v1/users/me/threads/:id/modify
  router.post("/:id/modify", async (c) => {
    const body = await c.req.json<ModifyThreadRequest>();
    const thread = store.modifyThread(c.req.param("id"), body.addLabelIds, body.removeLabelIds);
    if (!thread) {
      return c.json(
        { error: { code: 404, message: "Thread not found", status: "NOT_FOUND" } },
        404,
      );
    }
    return c.json(thread);
  });

  return router;
}

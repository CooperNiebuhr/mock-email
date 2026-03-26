import { Hono } from "hono";
import type { EmailStore } from "../store.js";
import type { MessageFormat, ModifyMessageRequest } from "../types.js";

export function messageRoutes(store: EmailStore) {
  const router = new Hono();

  // GET /gmail/v1/users/me/messages
  router.get("/", (c) => {
    const labelIdsRaw = c.req.queries("labelIds") ?? [];
    const maxResultsRaw = c.req.query("maxResults");
    const maxResults = maxResultsRaw !== undefined ? Math.max(1, Number(maxResultsRaw) || 1) : undefined;
    const pageToken = c.req.query("pageToken") ?? undefined;

    const result = store.listMessages({ labelIds: labelIdsRaw.length ? labelIdsRaw : undefined, maxResults, pageToken });
    return c.json(result);
  });

  // GET /gmail/v1/users/me/messages/:id
  router.get("/:id", (c) => {
    const format = (c.req.query("format") ?? "full") as MessageFormat;

    if (format === "raw" || format === "metadata") {
      return c.json(
        { error: { code: 400, message: `format=${format} is not implemented in Phase 1`, status: "UNIMPLEMENTED" } },
        400,
      );
    }

    const msg = store.getMessage(c.req.param("id"), format);
    if (!msg) {
      return c.json(
        { error: { code: 404, message: "Message not found", status: "NOT_FOUND" } },
        404,
      );
    }
    return c.json(msg);
  });

  // POST /gmail/v1/users/me/messages/:id/trash
  router.post("/:id/trash", (c) => {
    const msg = store.trashMessage(c.req.param("id"));
    if (!msg) {
      return c.json(
        { error: { code: 404, message: "Message not found", status: "NOT_FOUND" } },
        404,
      );
    }
    return c.json(msg);
  });

  // POST /gmail/v1/users/me/messages/:id/untrash
  router.post("/:id/untrash", (c) => {
    const msg = store.untrashMessage(c.req.param("id"));
    if (!msg) {
      return c.json(
        { error: { code: 404, message: "Message not found", status: "NOT_FOUND" } },
        404,
      );
    }
    return c.json(msg);
  });

  // POST /gmail/v1/users/me/messages/:id/modify
  router.post("/:id/modify", async (c) => {
    const body = await c.req.json<ModifyMessageRequest>();
    const msg = store.modifyMessage(c.req.param("id"), body.addLabelIds, body.removeLabelIds);
    if (!msg) {
      return c.json(
        { error: { code: 404, message: "Message not found", status: "NOT_FOUND" } },
        404,
      );
    }
    return c.json(msg);
  });

  return router;
}

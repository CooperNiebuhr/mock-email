import { Hono } from "hono";
import type { EmailStore } from "../store.js";

export function draftRoutes(store: EmailStore) {
  const router = new Hono();

  // GET /gmail/v1/users/me/drafts
  router.get("/", (c) => {
    const maxResultsRaw = c.req.query("maxResults");
    const maxResults = maxResultsRaw !== undefined ? Math.max(1, Number(maxResultsRaw) || 1) : undefined;
    const pageToken = c.req.query("pageToken") ?? undefined;

    const result = store.listDrafts({ maxResults, pageToken });
    return c.json(result);
  });

  // POST /gmail/v1/users/me/drafts/send  (must be before /:id)
  router.post("/send", async (c) => {
    const body = await c.req.json<{ id: string }>();
    if (!body.id) {
      return c.json(
        { error: { code: 400, message: "Missing draft id", status: "INVALID_ARGUMENT" } },
        400,
      );
    }

    const msg = store.sendDraft(body.id);
    if (!msg) {
      return c.json(
        { error: { code: 404, message: "Draft not found", status: "NOT_FOUND" } },
        404,
      );
    }
    return c.json(msg);
  });

  // POST /gmail/v1/users/me/drafts  (create)
  router.post("/", async (c) => {
    const body = await c.req.json<{
      message?: {
        payload?: {
          headers?: Array<{ name: string; value: string }>;
          body?: { data?: string };
        };
      };
      to?: string;
      subject?: string;
      body?: string;
      threadId?: string;
    }>();

    // Support both Gmail-style envelope and simplified params
    let to: string | undefined;
    let subject: string | undefined;
    let bodyText: string | undefined;
    let threadId: string | undefined = body.threadId;

    if (body.message?.payload) {
      // Gmail-style: extract from headers + body
      const headers = body.message.payload.headers ?? [];
      to = headers.find((h) => h.name.toLowerCase() === "to")?.value;
      subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value;
      if (body.message.payload.body?.data) {
        bodyText = Buffer.from(body.message.payload.body.data, "base64url").toString("utf-8");
      }
    } else {
      // Simplified params from broker adapter
      to = body.to;
      subject = body.subject;
      bodyText = body.body;
    }

    if (!to || !subject || !bodyText) {
      return c.json(
        { error: { code: 400, message: "Missing required fields: to, subject, body", status: "INVALID_ARGUMENT" } },
        400,
      );
    }

    const draft = store.createDraft({ to, subject, body: bodyText, threadId });
    return c.json(draft, 201);
  });

  // GET /gmail/v1/users/me/drafts/:id
  router.get("/:id", (c) => {
    const draft = store.getDraft(c.req.param("id"));
    if (!draft) {
      return c.json(
        { error: { code: 404, message: "Draft not found", status: "NOT_FOUND" } },
        404,
      );
    }
    return c.json(draft);
  });

  return router;
}

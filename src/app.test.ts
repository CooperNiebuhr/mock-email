import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "./app.js";

const TOKEN = "test-broker-token";

function makeApp() {
  const { app, store } = createApp({ brokerToken: TOKEN });
  return { app, store };
}

function authHeaders() {
  return { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
}

async function req(app: ReturnType<typeof makeApp>["app"], path: string, init?: RequestInit) {
  const res = await app.request(path, {
    headers: authHeaders(),
    ...init,
  });
  return res;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

// ── Health ──────────────────────────────────────────────────────────

describe("health", () => {
  it("returns ok without auth", async () => {
    const { app } = makeApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ status: "ok" });
  });
});

// ── Auth ────────────────────────────────────────────────────────────

describe("auth", () => {
  it("rejects missing auth header", async () => {
    const { app } = makeApp();
    const res = await app.request("/gmail/v1/users/me/profile");
    expect(res.status).toBe(401);
  });

  it("rejects invalid token", async () => {
    const { app } = makeApp();
    const res = await app.request("/gmail/v1/users/me/profile", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts valid token", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/profile");
    expect(res.status).toBe(200);
  });
});

// ── Correlation ID ──────────────────────────────────────────────────

describe("correlation", () => {
  it("echoes provided correlation ID", async () => {
    const { app } = makeApp();
    const res = await app.request("/health", {
      headers: { "x-correlation-id": "test-123" },
    });
    expect(res.headers.get("x-correlation-id")).toBe("test-123");
  });

  it("generates correlation ID when not provided", async () => {
    const { app } = makeApp();
    const res = await app.request("/health");
    expect(res.headers.get("x-correlation-id")).toBeTruthy();
  });
});

// ── Profile ─────────────────────────────────────────────────────────

describe("profile", () => {
  it("returns profile with counts", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/profile");
    const data = await json(res);
    expect(data.emailAddress).toBe("operator@example.com");
    expect(data.messagesTotal).toBeGreaterThan(0);
    expect(data.threadsTotal).toBeGreaterThan(0);
    expect(data.historyId).toBeTruthy();
  });
});

// ── Labels ──────────────────────────────────────────────────────────

describe("labels", () => {
  it("lists system labels", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/labels");
    const data = await json(res);
    expect(data.labels.length).toBeGreaterThanOrEqual(9);
    const ids = data.labels.map((l: { id: string }) => l.id);
    expect(ids).toContain("INBOX");
    expect(ids).toContain("SENT");
    expect(ids).toContain("DRAFT");
    expect(ids).toContain("TRASH");
  });

  it("gets a single label with counts", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/labels/INBOX");
    const data = await json(res);
    expect(data.id).toBe("INBOX");
    expect(data.type).toBe("system");
    expect(data.messagesTotal).toBeGreaterThan(0);
  });

  it("returns 404 for unknown label", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/labels/NONEXISTENT");
    expect(res.status).toBe(404);
  });

  it("DRAFT label counts include seeded drafts", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/labels/DRAFT");
    const data = await json(res);
    expect(data.messagesTotal).toBe(2); // 2 seeded drafts
  });
});

// ── Messages ────────────────────────────────────────────────────────

describe("messages", () => {
  it("lists all messages", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/messages");
    const data = await json(res);
    expect(data.messages.length).toBeGreaterThan(0);
    expect(data.resultSizeEstimate).toBeGreaterThan(0);
    // Minimal format: each has id, threadId, labelIds
    for (const m of data.messages) {
      expect(m.id).toBeTruthy();
      expect(m.threadId).toBeTruthy();
      expect(Array.isArray(m.labelIds)).toBe(true);
    }
  });

  it("filters by labelIds", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/messages?labelIds=INBOX&labelIds=UNREAD");
    const data = await json(res);
    // All returned messages must have both INBOX and UNREAD
    for (const m of data.messages) {
      expect(m.labelIds).toContain("INBOX");
      expect(m.labelIds).toContain("UNREAD");
    }
    expect(data.messages.length).toBeGreaterThan(0);
  });

  it("paginates with maxResults and pageToken", async () => {
    const { app } = makeApp();
    const res1 = await req(app, "/gmail/v1/users/me/messages?maxResults=2");
    const data1 = await json(res1);
    expect(data1.messages.length).toBe(2);
    expect(data1.nextPageToken).toBeTruthy();

    const res2 = await req(app, `/gmail/v1/users/me/messages?maxResults=2&pageToken=${data1.nextPageToken}`);
    const data2 = await json(res2);
    expect(data2.messages.length).toBe(2);
    // No overlap
    expect(data2.messages[0].id).not.toBe(data1.messages[0].id);
  });

  it("gets a message in full format", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/messages/msg-001");
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.id).toBe("msg-001");
    expect(data.threadId).toBe("thread-001");
    expect(data.payload).toBeTruthy();
    expect(data.payload.mimeType).toBe("text/plain");
    expect(data.payload.headers.length).toBeGreaterThan(0);
    expect(data.payload.body.data).toBeTruthy();
    expect(data.snippet).toBeTruthy();
  });

  it("gets a message in minimal format", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/messages/msg-001?format=minimal");
    const data = await json(res);
    expect(data.id).toBe("msg-001");
    expect(data.threadId).toBe("thread-001");
    expect(data.labelIds).toBeTruthy();
    expect(data.payload).toBeUndefined();
  });

  it("rejects format=raw", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/messages/msg-001?format=raw");
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown message", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/messages/nonexistent");
    expect(res.status).toBe(404);
  });

  it("trashes a message", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/messages/msg-001/trash", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.labelIds).toContain("TRASH");
    expect(data.labelIds).not.toContain("INBOX");
  });

  it("untrashes a message", async () => {
    const { app } = makeApp();
    // Trash first, then untrash
    await req(app, "/gmail/v1/users/me/messages/msg-001/trash", { method: "POST" });
    const res = await req(app, "/gmail/v1/users/me/messages/msg-001/untrash", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.labelIds).toContain("INBOX");
    expect(data.labelIds).not.toContain("TRASH");
  });

  it("modifies message labels", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/messages/msg-004/modify", {
      method: "POST",
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.labelIds).not.toContain("UNREAD");
    expect(data.labelIds).toContain("INBOX"); // still in inbox
  });

  it("returns 404 when untrashing a non-trashed message", async () => {
    const { app } = makeApp();
    // msg-001 is in INBOX, not TRASH
    const res = await req(app, "/gmail/v1/users/me/messages/msg-001/untrash", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

// ── Threads ─────────────────────────────────────────────────────────

describe("threads", () => {
  it("lists threads", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/threads");
    const data = await json(res);
    expect(data.threads.length).toBeGreaterThan(0);
    for (const t of data.threads) {
      expect(t.id).toBeTruthy();
      expect(t.snippet).toBeTruthy();
    }
  });

  it("filters threads by labelIds", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/threads?labelIds=IMPORTANT");
    const data = await json(res);
    expect(data.threads.length).toBeGreaterThan(0);
  });

  it("gets a thread with messages", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/threads/thread-001");
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.id).toBe("thread-001");
    expect(data.messages.length).toBe(3);
    expect(data.messages[0].payload).toBeTruthy();
  });

  it("returns 404 for unknown thread", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/threads/nonexistent");
    expect(res.status).toBe(404);
  });

  it("modifies thread labels (applies to all messages)", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/threads/thread-001/modify", {
      method: "POST",
      body: JSON.stringify({ addLabelIds: ["STARRED"] }),
    });
    expect(res.status).toBe(200);
    const data = await json(res);
    // All messages in the thread should now have STARRED
    for (const msg of data.messages) {
      expect(msg.labelIds).toContain("STARRED");
    }
  });
});

// ── Drafts ──────────────────────────────────────────────────────────

describe("drafts", () => {
  it("lists drafts", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/drafts");
    const data = await json(res);
    expect(data.drafts.length).toBe(2);
    expect(data.drafts[0].id).toBeTruthy();
    expect(data.drafts[0].message.id).toBeTruthy();
  });

  it("gets a draft by ID", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/drafts/draft-001");
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.id).toBe("draft-001");
    expect(data.message.payload).toBeTruthy();
  });

  it("creates a draft with simplified params", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/drafts", {
      method: "POST",
      body: JSON.stringify({
        to: "test@example.com",
        subject: "Test draft",
        body: "This is a test draft",
      }),
    });
    expect(res.status).toBe(201);
    const data = await json(res);
    expect(data.id).toBeTruthy();
    expect(data.message.payload.headers).toBeTruthy();
  });

  it("creates a draft with Gmail-style envelope", async () => {
    const { app } = makeApp();
    const bodyEncoded = Buffer.from("Gmail-style body", "utf-8").toString("base64url");
    const res = await req(app, "/gmail/v1/users/me/drafts", {
      method: "POST",
      body: JSON.stringify({
        message: {
          payload: {
            headers: [
              { name: "To", value: "alice@example.com" },
              { name: "Subject", value: "Gmail-style draft" },
            ],
            body: { data: bodyEncoded },
          },
        },
      }),
    });
    expect(res.status).toBe(201);
    const data = await json(res);
    expect(data.id).toBeTruthy();
  });

  it("rejects draft with missing fields", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/drafts", {
      method: "POST",
      body: JSON.stringify({ to: "test@example.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("sends a draft", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/drafts/send", {
      method: "POST",
      body: JSON.stringify({ id: "draft-001" }),
    });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.labelIds).toContain("SENT");

    // Draft should be gone
    const check = await req(app, "/gmail/v1/users/me/drafts/draft-001");
    expect(check.status).toBe(404);
  });

  it("returns 404 when sending nonexistent draft", async () => {
    const { app } = makeApp();
    const res = await req(app, "/gmail/v1/users/me/drafts/send", {
      method: "POST",
      body: JSON.stringify({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });
});

// ── Failure Scenarios ───────────────────────────────────────────────

describe("scenarios", () => {
  it("activates auth_failure scenario", async () => {
    const { app } = makeApp();

    // Set scenario (admin routes are not behind scenario middleware)
    const setRes = await app.request("/admin/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: "auth_failure" }),
    });
    expect(setRes.status).toBe(200);

    // Gmail routes should now fail with 401
    const res = await req(app, "/gmail/v1/users/me/profile");
    expect(res.status).toBe(401);
  });

  it("activates server_error scenario", async () => {
    const { app } = makeApp();

    await app.request("/admin/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: "server_error" }),
    });

    const res = await req(app, "/gmail/v1/users/me/messages");
    expect(res.status).toBe(500);
  });

  it("activates rate_limit scenario", async () => {
    const { app } = makeApp();

    await app.request("/admin/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: "rate_limit" }),
    });

    const res = await req(app, "/gmail/v1/users/me/messages");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("activates malformed_response scenario", async () => {
    const { app } = makeApp();

    await app.request("/admin/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: "malformed_response" }),
    });

    const res = await req(app, "/gmail/v1/users/me/messages");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(() => JSON.parse(text)).toThrow(); // not valid JSON
  });

  it("activates not_found scenario", async () => {
    const { app } = makeApp();

    await app.request("/admin/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: "not_found" }),
    });

    const res = await req(app, "/gmail/v1/users/me/messages/msg-001");
    expect(res.status).toBe(404);
  });

  it("clears scenario", async () => {
    const { app } = makeApp();

    // Set then clear
    await app.request("/admin/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: "server_error" }),
    });
    await app.request("/admin/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: null }),
    });

    // Should work now
    const res = await req(app, "/gmail/v1/users/me/profile");
    expect(res.status).toBe(200);
  });

  it("rejects invalid scenario name", async () => {
    const { app } = makeApp();
    const res = await app.request("/admin/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: "invalid_scenario" }),
    });
    expect(res.status).toBe(400);
  });

  it("gets current scenario state", async () => {
    const { app } = makeApp();
    const res = await app.request("/admin/scenarios");
    const data = await json(res);
    expect(data.active).toBeNull();
  });
});

// ── Admin Reset ─────────────────────────────────────────────────────

describe("admin reset", () => {
  it("resets store to default seed", async () => {
    const { app } = makeApp();

    // Trash a message first
    await req(app, "/gmail/v1/users/me/messages/msg-001/trash", { method: "POST" });

    // Reset
    const resetRes = await app.request("/admin/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(resetRes.status).toBe(200);

    // msg-001 should be back in inbox
    const msgRes = await req(app, "/gmail/v1/users/me/messages/msg-001");
    const data = await json(msgRes);
    expect(data.labelIds).toContain("INBOX");
    expect(data.labelIds).not.toContain("TRASH");
  });
});

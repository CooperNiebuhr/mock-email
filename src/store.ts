/**
 * In-memory Gmail-shaped data store.
 *
 * Holds Messages, Threads, Drafts, and Labels in Maps.
 * All mutations increment historyId for change tracking.
 * The store is resettable via the /admin/reset endpoint.
 */

import type {
  Message,
  MessageMinimal,
  Thread,
  ThreadMinimal,
  Draft,
  Label,
  Profile,
  MessageFormat,
  MessagePart,
  MessagePartHeader,
} from "./types.js";

// ── System labels (matching Gmail) ──────────────────────────────────

const SYSTEM_LABELS: Label[] = [
  { id: "INBOX", name: "INBOX", type: "system", messageListVisibility: "show", labelListVisibility: "labelShow", messagesTotal: 0, messagesUnread: 0, threadsTotal: 0, threadsUnread: 0 },
  { id: "SENT", name: "SENT", type: "system", messageListVisibility: "hide", labelListVisibility: "labelShow", messagesTotal: 0, messagesUnread: 0, threadsTotal: 0, threadsUnread: 0 },
  { id: "DRAFT", name: "DRAFT", type: "system", messageListVisibility: "hide", labelListVisibility: "labelShow", messagesTotal: 0, messagesUnread: 0, threadsTotal: 0, threadsUnread: 0 },
  { id: "STARRED", name: "STARRED", type: "system", messageListVisibility: "show", labelListVisibility: "labelShow", messagesTotal: 0, messagesUnread: 0, threadsTotal: 0, threadsUnread: 0 },
  { id: "IMPORTANT", name: "IMPORTANT", type: "system", messageListVisibility: "hide", labelListVisibility: "labelShowIfUnread", messagesTotal: 0, messagesUnread: 0, threadsTotal: 0, threadsUnread: 0 },
  { id: "UNREAD", name: "UNREAD", type: "system", messageListVisibility: "show", labelListVisibility: "labelHide", messagesTotal: 0, messagesUnread: 0, threadsTotal: 0, threadsUnread: 0 },
  { id: "SPAM", name: "SPAM", type: "system", messageListVisibility: "hide", labelListVisibility: "labelShow", messagesTotal: 0, messagesUnread: 0, threadsTotal: 0, threadsUnread: 0 },
  { id: "TRASH", name: "TRASH", type: "system", messageListVisibility: "hide", labelListVisibility: "labelShow", messagesTotal: 0, messagesUnread: 0, threadsTotal: 0, threadsUnread: 0 },
  { id: "CATEGORY_PRIMARY", name: "CATEGORY_PRIMARY", type: "system", messageListVisibility: "hide", labelListVisibility: "labelHide", messagesTotal: 0, messagesUnread: 0, threadsTotal: 0, threadsUnread: 0 },
];

// ── Pagination helpers ──────────────────────────────────────────────

export function encodePageToken(offset: number): string {
  return Buffer.from(String(offset), "utf-8").toString("base64url");
}

export function decodePageToken(token: string): number {
  const decoded = Buffer.from(token, "base64url").toString("utf-8");
  const num = Number(decoded);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
}

// ── Message builder helpers ─────────────────────────────────────────

function toBase64Url(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64url");
}

function getHeader(msg: Message, name: string): string | undefined {
  return msg.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  )?.value;
}

function toMinimal(msg: Message): MessageMinimal {
  return { id: msg.id, threadId: msg.threadId, labelIds: msg.labelIds };
}

function toThreadMinimal(thread: Thread): ThreadMinimal {
  return { id: thread.id, snippet: thread.snippet, historyId: thread.historyId };
}

export function buildMessage(opts: {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  labelIds: string[];
  historyId: number;
}): Message {
  const bodyEncoded = toBase64Url(opts.body);
  const headers: MessagePartHeader[] = [
    { name: "From", value: opts.from },
    { name: "To", value: opts.to },
    { name: "Subject", value: opts.subject },
    { name: "Date", value: opts.date },
  ];
  const payload: MessagePart = {
    partId: "0",
    mimeType: "text/plain",
    headers,
    body: {
      size: Buffer.byteLength(opts.body, "utf-8"),
      data: bodyEncoded,
    },
  };
  return {
    id: opts.id,
    threadId: opts.threadId,
    labelIds: [...opts.labelIds],
    snippet: opts.body.slice(0, 100),
    historyId: String(opts.historyId),
    internalDate: String(new Date(opts.date).getTime()),
    payload,
    sizeEstimate: Buffer.byteLength(opts.body, "utf-8") + 200, // headers overhead
  };
}

// ── Store class ─────────────────────────────────────────────────────

export type SeedMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  labelIds: string[];
};

export type SeedDraft = {
  id: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
};

export type SeedData = {
  emailAddress: string;
  messages: SeedMessage[];
  drafts: SeedDraft[];
};

export class EmailStore {
  private messages = new Map<string, Message>();
  private threads = new Map<string, Thread>();
  private drafts = new Map<string, Draft>();
  private labels = new Map<string, Label>();
  private _historyId = 1;
  private emailAddress: string;

  constructor(seed: SeedData) {
    this.emailAddress = seed.emailAddress;
    this.loadSeed(seed);
  }

  private nextHistoryId(): number {
    return this._historyId++;
  }

  private loadSeed(seed: SeedData): void {
    // Reset maps
    this.messages.clear();
    this.threads.clear();
    this.drafts.clear();
    this.labels.clear();
    this._historyId = 1;

    // Load system labels
    for (const label of SYSTEM_LABELS) {
      this.labels.set(label.id, { ...label, messagesTotal: 0, messagesUnread: 0, threadsTotal: 0, threadsUnread: 0 });
    }

    // Load messages (sorted by date ascending so historyId increases chronologically)
    const sortedMessages = [...seed.messages].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    for (const sm of sortedMessages) {
      const msg = buildMessage({ ...sm, historyId: this.nextHistoryId() });
      this.messages.set(msg.id, msg);

      // Build/update thread
      let thread = this.threads.get(msg.threadId);
      if (!thread) {
        thread = {
          id: msg.threadId,
          snippet: msg.snippet,
          historyId: msg.historyId,
          messages: [],
        };
        this.threads.set(thread.id, thread);
      }
      thread.messages.push(msg);
      thread.snippet = msg.snippet; // last message's snippet
      thread.historyId = msg.historyId;
    }

    // Load drafts
    for (const sd of seed.drafts) {
      const hid = this.nextHistoryId();
      const draftMsg = buildMessage({
        id: `${sd.id}-msg`,
        threadId: sd.threadId ?? `${sd.id}-thread`,
        from: seed.emailAddress,
        to: sd.to,
        subject: sd.subject,
        body: sd.body,
        date: new Date().toISOString(),
        labelIds: ["DRAFT"],
        historyId: hid,
      });
      this.drafts.set(sd.id, { id: sd.id, message: draftMsg });
    }

    // Recompute label counts
    this.recomputeLabelCounts();
  }

  private recomputeLabelCounts(): void {
    // Reset all counts
    for (const label of this.labels.values()) {
      label.messagesTotal = 0;
      label.messagesUnread = 0;
      label.threadsTotal = 0;
      label.threadsUnread = 0;
    }

    // Helper to count a message's labels
    const countMessage = (msg: Message) => {
      for (const labelId of msg.labelIds) {
        const label = this.labels.get(labelId);
        if (label) {
          label.messagesTotal++;
          if (msg.labelIds.includes("UNREAD")) {
            label.messagesUnread++;
          }
        }
      }
    };

    // Count messages per label (includes both regular messages and draft messages)
    for (const msg of this.messages.values()) {
      countMessage(msg);
    }
    for (const draft of this.drafts.values()) {
      countMessage(draft.message);
    }

    // Count threads per label
    for (const thread of this.threads.values()) {
      const threadLabels = new Set<string>();
      let hasUnread = false;
      for (const msg of thread.messages) {
        for (const labelId of msg.labelIds) {
          threadLabels.add(labelId);
        }
        if (msg.labelIds.includes("UNREAD")) {
          hasUnread = true;
        }
      }
      for (const labelId of threadLabels) {
        const label = this.labels.get(labelId);
        if (label) {
          label.threadsTotal++;
          if (hasUnread) {
            label.threadsUnread++;
          }
        }
      }
    }
  }

  // ── Query methods ───────────────────────────────────────────────

  getProfile(): Profile {
    return {
      emailAddress: this.emailAddress,
      messagesTotal: this.messages.size,
      threadsTotal: this.threads.size,
      historyId: String(this._historyId),
    };
  }

  listMessages(opts: {
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
  }): { messages: MessageMinimal[]; nextPageToken?: string; resultSizeEstimate: number } {
    let msgs = [...this.messages.values()];

    // Filter by labelIds (AND logic — message must have ALL specified labels)
    if (opts.labelIds && opts.labelIds.length > 0) {
      msgs = msgs.filter((m) =>
        opts.labelIds!.every((lid) => m.labelIds.includes(lid)),
      );
    }

    // Sort by internalDate descending (newest first)
    msgs.sort((a, b) => Number(b.internalDate) - Number(a.internalDate));

    const total = msgs.length;
    const offset = opts.pageToken ? decodePageToken(opts.pageToken) : 0;
    const limit = Math.min(opts.maxResults ?? 20, 100);
    const page = msgs.slice(offset, offset + limit);
    const nextOffset = offset + limit;

    return {
      messages: page.map(toMinimal),
      nextPageToken: nextOffset < total ? encodePageToken(nextOffset) : undefined,
      resultSizeEstimate: total,
    };
  }

  getMessage(id: string, format: MessageFormat = "full"): Message | MessageMinimal | null {
    const msg = this.messages.get(id);
    if (!msg) return null;
    if (format === "minimal") return toMinimal(msg);
    return msg;
  }

  listThreads(opts: {
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
  }): { threads: ThreadMinimal[]; nextPageToken?: string; resultSizeEstimate: number } {
    let threads = [...this.threads.values()];

    // Filter by labelIds — thread matches if ANY message has ALL specified labels
    if (opts.labelIds && opts.labelIds.length > 0) {
      threads = threads.filter((t) =>
        t.messages.some((m) =>
          opts.labelIds!.every((lid) => m.labelIds.includes(lid)),
        ),
      );
    }

    // Sort by most recent message descending
    threads.sort((a, b) => {
      const aMax = Math.max(...a.messages.map((m) => Number(m.internalDate)));
      const bMax = Math.max(...b.messages.map((m) => Number(m.internalDate)));
      return bMax - aMax;
    });

    const total = threads.length;
    const offset = opts.pageToken ? decodePageToken(opts.pageToken) : 0;
    const limit = Math.min(opts.maxResults ?? 20, 100);
    const page = threads.slice(offset, offset + limit);
    const nextOffset = offset + limit;

    return {
      threads: page.map(toThreadMinimal),
      nextPageToken: nextOffset < total ? encodePageToken(nextOffset) : undefined,
      resultSizeEstimate: total,
    };
  }

  getThread(id: string, format: MessageFormat = "full"): { id: string; snippet: string; historyId: string; messages: (Message | MessageMinimal)[] } | null {
    const thread = this.threads.get(id);
    if (!thread) return null;
    if (format === "minimal") {
      return {
        id: thread.id,
        snippet: thread.snippet,
        historyId: thread.historyId,
        messages: thread.messages.map(toMinimal),
      };
    }
    return thread;
  }

  listDrafts(opts?: {
    maxResults?: number;
    pageToken?: string;
  }): { drafts: Array<{ id: string; message: MessageMinimal }>; nextPageToken?: string; resultSizeEstimate: number } {
    const all = [...this.drafts.values()];
    const total = all.length;
    const offset = opts?.pageToken ? decodePageToken(opts.pageToken) : 0;
    const limit = Math.min(opts?.maxResults ?? 20, 100);
    const page = all.slice(offset, offset + limit);
    const nextOffset = offset + limit;

    return {
      drafts: page.map((d) => ({ id: d.id, message: toMinimal(d.message) })),
      nextPageToken: nextOffset < total ? encodePageToken(nextOffset) : undefined,
      resultSizeEstimate: total,
    };
  }

  getDraft(id: string): Draft | null {
    return this.drafts.get(id) ?? null;
  }

  listLabels(): Label[] {
    return [...this.labels.values()];
  }

  getLabel(id: string): Label | null {
    return this.labels.get(id) ?? null;
  }

  // ── Mutation methods ────────────────────────────────────────────

  createDraft(opts: {
    to: string;
    subject: string;
    body: string;
    threadId?: string;
  }): Draft {
    const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const msgId = `${draftId}-msg`;
    const threadId = opts.threadId ?? `${draftId}-thread`;
    const hid = this.nextHistoryId();

    const msg = buildMessage({
      id: msgId,
      threadId,
      from: this.emailAddress,
      to: opts.to,
      subject: opts.subject,
      body: opts.body,
      date: new Date().toISOString(),
      labelIds: ["DRAFT"],
      historyId: hid,
    });

    const draft: Draft = { id: draftId, message: msg };
    this.drafts.set(draftId, draft);
    this.recomputeLabelCounts();
    return draft;
  }

  sendDraft(draftId: string): Message | null {
    const draft = this.drafts.get(draftId);
    if (!draft) return null;

    // Remove from drafts
    this.drafts.delete(draftId);

    // Create a sent message
    const hid = this.nextHistoryId();
    const sentMsg: Message = {
      ...draft.message,
      labelIds: ["SENT"],
      historyId: String(hid),
    };
    this.messages.set(sentMsg.id, sentMsg);

    // Add to thread
    let thread = this.threads.get(sentMsg.threadId);
    if (!thread) {
      thread = {
        id: sentMsg.threadId,
        snippet: sentMsg.snippet,
        historyId: sentMsg.historyId,
        messages: [],
      };
      this.threads.set(thread.id, thread);
    }
    thread.messages.push(sentMsg);
    thread.snippet = sentMsg.snippet;
    thread.historyId = sentMsg.historyId;

    this.recomputeLabelCounts();
    return sentMsg;
  }

  /** Apply label changes to a message without recomputing counts. */
  private applyLabelChanges(msg: Message, addLabelIds?: string[], removeLabelIds?: string[]): void {
    const hid = this.nextHistoryId();

    if (addLabelIds) {
      for (const lid of addLabelIds) {
        if (!msg.labelIds.includes(lid)) {
          msg.labelIds.push(lid);
        }
      }
    }
    if (removeLabelIds) {
      msg.labelIds = msg.labelIds.filter((lid) => !removeLabelIds.includes(lid));
    }

    msg.historyId = String(hid);

    // Update parent thread historyId
    const thread = this.threads.get(msg.threadId);
    if (thread) {
      thread.historyId = String(hid);
    }
  }

  modifyMessage(id: string, addLabelIds?: string[], removeLabelIds?: string[]): Message | null {
    const msg = this.messages.get(id);
    if (!msg) return null;

    this.applyLabelChanges(msg, addLabelIds, removeLabelIds);
    this.recomputeLabelCounts();
    return msg;
  }

  trashMessage(id: string): Message | null {
    return this.modifyMessage(id, ["TRASH"], ["INBOX", "UNREAD", "STARRED", "IMPORTANT", "CATEGORY_PRIMARY"]);
  }

  untrashMessage(id: string): Message | null {
    const msg = this.messages.get(id);
    if (!msg || !msg.labelIds.includes("TRASH")) return null;
    return this.modifyMessage(id, ["INBOX"], ["TRASH"]);
  }

  modifyThread(id: string, addLabelIds?: string[], removeLabelIds?: string[]): Thread | null {
    const thread = this.threads.get(id);
    if (!thread) return null;

    // Apply label changes to all messages, recompute once at the end
    for (const msg of thread.messages) {
      this.applyLabelChanges(msg, addLabelIds, removeLabelIds);
    }
    this.recomputeLabelCounts();

    return this.threads.get(id) ?? null;
  }

  // ── Admin ───────────────────────────────────────────────────────

  reset(seed: SeedData): void {
    this.emailAddress = seed.emailAddress;
    this.loadSeed(seed);
  }
}

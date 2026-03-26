/**
 * Gmail-faithful TypeScript types.
 *
 * These mirror the Gmail REST API discovery doc schemas (rest.json).
 * Phase 1 uses text/plain bodies only — no recursive multipart MIME trees.
 */

// ── Core message types ──────────────────────────────────────────────

export type MessagePartHeader = {
  name: string;
  value: string;
};

export type MessagePartBody = {
  /** When present, an external attachment ID. */
  attachmentId?: string;
  /** Byte count of the body data. */
  size: number;
  /** Base64url-encoded body content. */
  data?: string;
};

export type MessagePart = {
  partId: string;
  mimeType: string;
  filename?: string;
  headers: MessagePartHeader[];
  body: MessagePartBody;
  /** Child parts (multipart). Empty array for leaf parts in Phase 1. */
  parts?: MessagePart[];
};

export type Message = {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: MessagePart;
  sizeEstimate: number;
  /** RFC 2822 base64url (only in format=raw, Phase 1: not implemented). */
  raw?: string;
};

/** Minimal format: only id + threadId + labelIds. */
export type MessageMinimal = Pick<Message, "id" | "threadId" | "labelIds">;

// ── Thread ──────────────────────────────────────────────────────────

export type Thread = {
  id: string;
  snippet: string;
  historyId: string;
  messages: Message[];
};

export type ThreadMinimal = {
  id: string;
  snippet: string;
  historyId: string;
};

// ── Draft ───────────────────────────────────────────────────────────

export type Draft = {
  id: string;
  message: Message;
};

// ── Label ───────────────────────────────────────────────────────────

export type LabelType = "system" | "user";
export type LabelVisibility = "show" | "hide";
export type LabelListVisibility = "labelShow" | "labelShowIfUnread" | "labelHide";

export type Label = {
  id: string;
  name: string;
  messageListVisibility: LabelVisibility;
  labelListVisibility: LabelListVisibility;
  type: LabelType;
  messagesTotal: number;
  messagesUnread: number;
  threadsTotal: number;
  threadsUnread: number;
};

// ── Profile ─────────────────────────────────────────────────────────

export type Profile = {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
};

// ── List responses ──────────────────────────────────────────────────

export type ListMessagesResponse = {
  messages: MessageMinimal[];
  nextPageToken?: string;
  resultSizeEstimate: number;
};

export type ListThreadsResponse = {
  threads: ThreadMinimal[];
  nextPageToken?: string;
  resultSizeEstimate: number;
};

export type ListDraftsResponse = {
  drafts: Array<{ id: string; message: MessageMinimal }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
};

export type ListLabelsResponse = {
  labels: Label[];
};

// ── Mutation requests ───────────────────────────────────────────────

export type ModifyMessageRequest = {
  addLabelIds?: string[];
  removeLabelIds?: string[];
};

export type ModifyThreadRequest = {
  addLabelIds?: string[];
  removeLabelIds?: string[];
};

// ── Format parameter ────────────────────────────────────────────────

export type MessageFormat = "minimal" | "full" | "raw" | "metadata";

// ── Failure scenarios ───────────────────────────────────────────────

export type ScenarioName =
  | "auth_failure"
  | "timeout"
  | "malformed_response"
  | "server_error"
  | "rate_limit"
  | "not_found";

export type ScenarioState = {
  active: ScenarioName | null;
};

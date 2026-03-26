# Mock Email Service — Design Summary

## Problem

The broker's email adapter needs a backend to test against. Hitting real Gmail in CI/dev is flaky, requires OAuth tokens, and introduces non-determinism. A mock must be **faithful enough** to real Gmail that adapters built against it work against the real API with zero translation changes — same paths, same response shapes, same error format, same pagination model.

The mock email service is a **deterministic, hermetic Gmail substitute** for Phase 1. It holds no state between restarts and can be reset to a known seed between tests, making broker integration tests fully reproducible.

## Architecture

```
Broker                       Mock Email (port 4200)
(integration boundary)       (Gmail substitute)
   |                             |
   |  Gmail-path request         |
   |  Auth: Bearer brokerToken   |
   |  X-Correlation-Id: uuid     |
   |---------------------------->|
   |                             |  1. Propagate/generate correlation ID
   |                             |  2. Validate Bearer token
   |                             |  3. Check active failure scenario
   |                             |  4. Route handler (in-memory store)
   |<--- Gmail-shaped JSON ------|
   |                             |
                                 |   Admin control plane (no auth)
   Test / CI                     |   POST /admin/scenarios
   |---------------------------->|   POST /admin/reset
```

All Gmail routes live under `/gmail/v1/users/me/*` — identical to the real Gmail base path.

### File Structure

```
mock-email/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── docs/
│   └── mock-email-design.md     ← this file
├── src/
│   ├── index.ts                 Entrypoint — validateEnv → createApp → serve
│   ├── app.ts                   Hono app factory + startup validation
│   ├── types.ts                 Gmail-faithful TypeScript types (from discovery doc)
│   ├── store.ts                 EmailStore — in-memory Maps, CRUD, pagination, label counts
│   ├── seed.ts                  Default seed data (12 messages, 2 drafts)
│   ├── scenarios.ts             Failure scenario validation + factory
│   ├── logger.ts                Structured JSON logger (stdout)
│   ├── middleware/
│   │   ├── auth.ts              Bearer token validation (constant-time)
│   │   ├── correlation.ts       X-Correlation-Id propagation
│   │   └── scenarios.ts         Failure scenario injection
│   └── routes/
│       ├── profile.ts           GET profile
│       ├── labels.ts            List / get labels
│       ├── messages.ts          Message CRUD + label mutations
│       ├── threads.ts           Thread queries + label mutations
│       ├── drafts.ts            Draft CRUD + send
│       └── admin.ts             Scenario control + state reset
```

## Discovery Doc Design Philosophy

The repo root contains `rest.json` — a Gmail API Discovery Document (`kind: "discovery#restDescription"`). This is the **machine-readable source of truth** for Gmail's data shapes, endpoints, and parameters.

The mock service deliberately mirrors this discovery doc:

- **Types** — `types.ts` mirrors the discovery doc schemas exactly (`Message`, `MessagePart`, `MessagePartBody`, `MessagePartHeader`, `Thread`, `Draft`, `Label`, `Profile`, and all list response wrappers). The file header states: *"These mirror the Gmail REST API discovery doc schemas (rest.json)."*
- **Routes** — endpoint paths mirror the discovery doc's `resources.users.*.methods` (e.g., `gmail.users.messages.list` → `GET /gmail/v1/users/me/messages`).
- **Error format** — uses Gmail's `{ error: { code, message, status } }` envelope.

This design enables **adapter generation from discovery docs** rather than manual documentation reading. When building the broker's email adapter, the discovery doc defines the contract; the mock validates that contract. The same pattern scales to future integration families (calendar, drive, etc.) — download the discovery doc, build the mock, build the adapter.

**Phase 1 scope**: `text/plain` bodies only (no recursive multipart MIME). `format=raw` and `format=metadata` return `400 UNIMPLEMENTED`.

## Credential Flow

```
Broker holds:       BROKER_TOKEN (to authenticate TO mock-email)
Mock Email holds:    BROKER_TOKEN (to verify Broker's identity)
Operator holds:     nothing (never talks to mock-email directly)
```

Admin routes have no auth — they are only reachable on the internal Docker network.

## Request Flow (Gmail routes)

1. **Correlation** — extract `X-Correlation-Id` header or generate a UUID; attach to response
2. **Auth** — extract `Authorization: Bearer <token>`, constant-time compare against `BROKER_TOKEN`; deny with `401 UNAUTHENTICATED` if missing/invalid
3. **Scenario check** — if an active failure scenario is set, short-circuit with the scenario's error response
4. **Route handler** — read from or mutate the in-memory store
5. **Response** — Gmail-shaped JSON body + `X-Correlation-Id` header

Admin routes skip steps 2–3 (no auth, no scenario injection).

## API Contract

### Gmail Routes (auth required)

**Common request headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <brokerToken>` |
| `Content-Type` | For POST | `application/json` |
| `X-Correlation-Id` | No | Trace ID; generated if absent |

**Profile & Labels**

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/gmail/v1/users/me/profile` | `Profile` — emailAddress, messagesTotal, threadsTotal, historyId |
| `GET` | `/gmail/v1/users/me/labels` | `{ labels: Label[] }` |
| `GET` | `/gmail/v1/users/me/labels/:id` | `Label` (404 if not found) |

**Messages**

| Method | Path | Query / Body | Response |
|--------|------|-------------|----------|
| `GET` | `/gmail/v1/users/me/messages` | `labelIds[]`, `maxResults` (1-100, default 20), `pageToken` | `ListMessagesResponse` (minimal format + pagination) |
| `GET` | `/gmail/v1/users/me/messages/:id` | `format` (`full`\|`minimal`; `raw`\|`metadata` → 400) | `Message` or `MessageMinimal` |
| `POST` | `/gmail/v1/users/me/messages/:id/trash` | — | `Message` (TRASH added; INBOX, UNREAD, STARRED, IMPORTANT, CATEGORY_PRIMARY removed) |
| `POST` | `/gmail/v1/users/me/messages/:id/untrash` | — | `Message` (INBOX added; TRASH removed). 404 if not trashed |
| `POST` | `/gmail/v1/users/me/messages/:id/modify` | `{ addLabelIds?, removeLabelIds? }` | `Message` |

**Threads**

| Method | Path | Query / Body | Response |
|--------|------|-------------|----------|
| `GET` | `/gmail/v1/users/me/threads` | `labelIds[]`, `maxResults`, `pageToken` | `ListThreadsResponse` (thread matches if ANY message has ALL specified labels) |
| `GET` | `/gmail/v1/users/me/threads/:id` | `format` (`full`\|`minimal`) | `Thread` with nested messages |
| `POST` | `/gmail/v1/users/me/threads/:id/modify` | `{ addLabelIds?, removeLabelIds? }` | `Thread` (label changes applied to ALL messages in thread) |

**Drafts**

| Method | Path | Query / Body | Response |
|--------|------|-------------|----------|
| `GET` | `/gmail/v1/users/me/drafts` | `maxResults`, `pageToken` | `ListDraftsResponse` |
| `GET` | `/gmail/v1/users/me/drafts/:id` | — | `Draft` ({ id, message }) |
| `POST` | `/gmail/v1/users/me/drafts` | Simplified `{ to, subject, body, threadId? }` **or** Gmail-style `{ message: { payload: { headers[], body: { data } } } }` | `Draft` (201) |
| `POST` | `/gmail/v1/users/me/drafts/send` | `{ id }` | Sent `Message` (DRAFT → SENT label; draft removed from store) |

### Admin Routes (no auth)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/admin/scenarios` | `{ active: "<scenario>" \| null }` | `{ active }` (400 for invalid scenario name) |
| `GET` | `/admin/scenarios` | — | `{ active }` |
| `POST` | `/admin/reset` | Optional custom `SeedData` JSON | `{ status: "reset", messagesTotal }` |
| `GET` | `/health` | — | `{ status: "ok" }` |

### Error Response Format

Gmail-style error envelope with correlation ID:

```json
{
  "error": {
    "code": 401,
    "message": "Invalid or missing authentication token",
    "status": "UNAUTHENTICATED"
  },
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Error Codes

| HTTP | Status | Trigger |
|------|--------|---------|
| 401 | `UNAUTHENTICATED` | Missing or invalid Authorization header |
| 400 | `INVALID_ARGUMENT` | Missing required fields (draft create/send), invalid scenario name |
| 400 | `UNIMPLEMENTED` | `format=raw` or `format=metadata` (Phase 1) |
| 404 | `NOT_FOUND` | Message, thread, draft, or label not found |
| 500 | `INTERNAL` | Simulated via `server_error` scenario |
| 504 | `DEADLINE_EXCEEDED` | Simulated via `timeout` scenario |
| 429 | `RESOURCE_EXHAUSTED` | Simulated via `rate_limit` scenario (includes `Retry-After: 60`) |

## Failure Scenarios

Six injectable failure modes activated via `POST /admin/scenarios`. Applied as middleware on all Gmail routes — admin routes are exempt.

| Scenario | HTTP | Behavior |
|----------|------|----------|
| `auth_failure` | 401 | Simulates credential validation failure |
| `timeout` | 504 | 30-second delay before responding (triggers client timeout) |
| `malformed_response` | 200 | Returns broken JSON (`{malformed json!!! <<< broken`) |
| `server_error` | 500 | Simulates backend failure |
| `rate_limit` | 429 | Returns `Retry-After: 60` header |
| `not_found` | 404 | Simulates missing resource for any request |

Scenarios remain active until cleared (`{ "active": null }`) or the store is reset via `/admin/reset`.

## Key Design Decisions

- **Gmail-faithful paths and shapes** — routes and types mirror the discovery doc exactly so broker adapters work against both mock and real Gmail without translation changes.

- **In-memory store with deterministic seed** — 12 messages, 8 threads, 2 drafts, 9 system labels. Resettable between tests via `/admin/reset`. No database, no persistence.

- **`createApp()` factory pattern** — each test gets an isolated app instance with its own store and scenario state. No module-level singletons that leak between tests.

- **Constant-time auth** — `crypto.timingSafeEqual` prevents timing attacks on the broker token. Same pattern as ai-proxy.

- **Scenario injection as middleware** — scenarios short-circuit before route handlers, simulating real failure modes without modifying route logic.

- **Dual draft creation format** — accepts both Gmail-style envelope (headers + base64url body) and simplified params (`to`/`subject`/`body`). The broker adapter uses simplified; direct Gmail clients use envelope style.

- **Hono framework** — same choice as ai-proxy. ~14KB, TypeScript-first, middleware-native.

- **Fail-closed startup** — missing `BROKER_TOKEN` causes hard throw. No degraded mode.

## Seed Data

Default seed (`DEFAULT_SEED` in `src/seed.ts`):

| Content | Count | Details |
|---------|-------|---------|
| Messages | 12 | Across 8 threads, varied label states |
| Drafts | 2 | One linked to thread-002, one standalone |
| System labels | 9 | INBOX, SENT, DRAFT, STARRED, IMPORTANT, UNREAD, SPAM, TRASH, CATEGORY_PRIMARY |

Email address: `operator@example.com`. Threads cover: read (3 msgs), unread (2 msgs), starred (1 msg), important (2 msgs), sent-only (1 msg), PR notification, social, billing.

## Test Coverage

All tests in `src/app.test.ts`:

| Describe Block | Tests | Scope |
|----------------|-------|-------|
| health | 1 | No-auth health check |
| auth | 3 | Missing, invalid, valid token |
| correlation | 2 | Passthrough, generation |
| profile | 1 | Profile with counts |
| labels | 4 | List, get, 404, draft label counts |
| messages | 11 | List, filter, paginate, full/minimal format, raw reject, 404, trash, untrash, modify, untrash-non-trashed |
| threads | 5 | List, filter, get with messages, 404, modify all messages |
| drafts | 7 | List, get, create simplified, create Gmail-style, reject missing fields, send, send 404 |
| scenarios | 8 | All 6 failure modes, clear, invalid name, get state |
| admin reset | 1 | Reset to default seed |
| **Total** | **43** | |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BROKER_TOKEN` | Yes | Token the broker uses to authenticate to this service |
| `PORT` | No | Listen port (default: 4200) |

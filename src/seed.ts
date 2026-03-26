import type { SeedData } from "./store.js";

/**
 * Default seed data for the mock email service.
 *
 * 12 messages across 5 threads, covering varied label states:
 * - Unread thread (2 msgs, INBOX + UNREAD)
 * - Read thread (3 msgs, INBOX only)
 * - Starred message (INBOX + STARRED)
 * - Important thread (2 msgs, INBOX + IMPORTANT)
 * - Sent message (SENT only, not in INBOX)
 * Plus 2 drafts.
 */
export const DEFAULT_SEED: SeedData = {
  emailAddress: "operator@example.com",
  messages: [
    // Thread 1: Project kickoff (read, 3 messages)
    {
      id: "msg-001",
      threadId: "thread-001",
      from: "alice@example.com",
      to: "operator@example.com",
      subject: "Project kickoff meeting",
      body: "Hi team, let's schedule a kickoff meeting for the new project. I'm thinking next Tuesday at 2pm. Does that work for everyone?",
      date: "2026-03-20T09:00:00Z",
      labelIds: ["INBOX", "CATEGORY_PRIMARY"],
    },
    {
      id: "msg-002",
      threadId: "thread-001",
      from: "bob@example.com",
      to: "operator@example.com",
      subject: "Re: Project kickoff meeting",
      body: "Tuesday at 2pm works for me. I'll prepare the requirements doc beforehand.",
      date: "2026-03-20T09:30:00Z",
      labelIds: ["INBOX", "CATEGORY_PRIMARY"],
    },
    {
      id: "msg-003",
      threadId: "thread-001",
      from: "alice@example.com",
      to: "operator@example.com",
      subject: "Re: Project kickoff meeting",
      body: "Great, Tuesday it is. I've sent calendar invites. See you there!",
      date: "2026-03-20T10:00:00Z",
      labelIds: ["INBOX", "CATEGORY_PRIMARY"],
    },

    // Thread 2: Unread (2 messages)
    {
      id: "msg-004",
      threadId: "thread-002",
      from: "carol@example.com",
      to: "operator@example.com",
      subject: "Q1 report review needed",
      body: "Hey, I've attached the Q1 report for your review. The revenue numbers look strong but we need to discuss the churn metrics.",
      date: "2026-03-22T14:00:00Z",
      labelIds: ["INBOX", "UNREAD", "CATEGORY_PRIMARY"],
    },
    {
      id: "msg-005",
      threadId: "thread-002",
      from: "carol@example.com",
      to: "operator@example.com",
      subject: "Re: Q1 report review needed",
      body: "Just a follow-up — the board meeting is Friday so I need your feedback by Thursday EOD. Thanks!",
      date: "2026-03-23T08:15:00Z",
      labelIds: ["INBOX", "UNREAD", "CATEGORY_PRIMARY"],
    },

    // Thread 3: Starred message (single)
    {
      id: "msg-006",
      threadId: "thread-003",
      from: "dave@example.com",
      to: "operator@example.com",
      subject: "API credentials for staging",
      body: "Here are the staging API credentials you requested. Handle with care — they expire in 30 days.\n\nEndpoint: https://staging.api.example.com\nKey: stg_k3y_placeholder",
      date: "2026-03-21T11:30:00Z",
      labelIds: ["INBOX", "STARRED", "CATEGORY_PRIMARY"],
    },

    // Thread 4: Important thread (2 messages)
    {
      id: "msg-007",
      threadId: "thread-004",
      from: "eve@example.com",
      to: "operator@example.com",
      subject: "Security incident — action required",
      body: "We detected unusual login attempts on the production auth service between 02:00-04:00 UTC. Please review the attached logs and confirm if any of these were expected.",
      date: "2026-03-24T06:00:00Z",
      labelIds: ["INBOX", "UNREAD", "IMPORTANT", "CATEGORY_PRIMARY"],
    },
    {
      id: "msg-008",
      threadId: "thread-004",
      from: "frank@example.com",
      to: "operator@example.com",
      subject: "Re: Security incident — action required",
      body: "I've rotated the affected credentials and enabled enhanced monitoring. We should schedule a post-mortem for tomorrow.",
      date: "2026-03-24T07:30:00Z",
      labelIds: ["INBOX", "UNREAD", "IMPORTANT", "CATEGORY_PRIMARY"],
    },

    // Thread 5: Sent message (not in inbox)
    {
      id: "msg-009",
      threadId: "thread-005",
      from: "operator@example.com",
      to: "alice@example.com",
      subject: "Updated deployment schedule",
      body: "Hi Alice, here's the updated deployment schedule for next week. I've moved the database migration to Wednesday to avoid the traffic spike on Tuesday.",
      date: "2026-03-23T16:00:00Z",
      labelIds: ["SENT"],
    },

    // Standalone inbox messages
    {
      id: "msg-010",
      threadId: "thread-006",
      from: "notifications@github.example.com",
      to: "operator@example.com",
      subject: "[operator/runtime] PR #142: Fix cloud mode tool assembly",
      body: "alice requested your review on PR #142.\n\nChanges: 3 files changed, 47 insertions(+), 12 deletions(-)\n\nView: https://github.example.com/operator/runtime/pull/142",
      date: "2026-03-24T10:00:00Z",
      labelIds: ["INBOX", "UNREAD", "CATEGORY_PRIMARY"],
    },
    {
      id: "msg-011",
      threadId: "thread-007",
      from: "bob@example.com",
      to: "operator@example.com",
      subject: "Lunch tomorrow?",
      body: "Hey, want to grab lunch tomorrow? There's a new ramen place that opened on 5th Street.",
      date: "2026-03-24T12:30:00Z",
      labelIds: ["INBOX", "CATEGORY_PRIMARY"],
    },
    {
      id: "msg-012",
      threadId: "thread-008",
      from: "billing@cloud.example.com",
      to: "operator@example.com",
      subject: "Your March invoice is ready",
      body: "Your cloud infrastructure invoice for March 2026 is ready. Total: $847.23. View your invoice at https://cloud.example.com/billing/invoices/2026-03",
      date: "2026-03-25T00:00:00Z",
      labelIds: ["INBOX", "UNREAD", "CATEGORY_PRIMARY"],
    },
  ],
  drafts: [
    {
      id: "draft-001",
      to: "carol@example.com",
      subject: "Re: Q1 report review needed",
      body: "Hi Carol, I've reviewed the Q1 report. The revenue numbers look good. Regarding churn — I think we should",
      threadId: "thread-002",
    },
    {
      id: "draft-002",
      to: "team@example.com",
      subject: "Weekly standup notes",
      body: "Team standup notes for this week:\n\n1. Deployment pipeline improvements\n2. Cloud mode testing progress\n3. ",
    },
  ],
};

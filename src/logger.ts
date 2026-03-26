export type LogEntry = {
  ts: string;
  service: "mock-email";
  event: string;
  correlationId?: string;
  status?: string;
  durationMs?: number;
  [key: string]: unknown;
};

/**
 * Structured JSON logger for the mock email service.
 *
 * Writes to stdout as single-line JSON — consumed by the log collector.
 */
export function log(entry: Omit<LogEntry, "ts" | "service"> & { event: string }): void {
  const line = {
    ts: new Date().toISOString(),
    service: "mock-email" as const,
    ...entry,
  };
  process.stdout.write(JSON.stringify(line) + "\n");
}

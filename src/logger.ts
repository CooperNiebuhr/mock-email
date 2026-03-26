import type { LogEntry, LogShipper } from "@operator/protocol";
import { createLogShipper } from "@operator/protocol";

export type { LogEntry };

let shipper: LogShipper | null = null;

const collectorUrl = process.env["LOG_COLLECTOR_URL"];
const collectorToken = process.env["COLLECTOR_TOKEN"];
if (collectorUrl && collectorToken) {
  shipper = createLogShipper({ collectorUrl, token: collectorToken });
}

/**
 * Structured JSON logger for the mock email service.
 *
 * Writes to stdout as single-line JSON — consumed by the log collector.
 * If LOG_COLLECTOR_URL is set, also ships entries to the collector.
 */
export function log(entry: Omit<LogEntry, "ts" | "service"> & { event: string }): void {
  const line: LogEntry = {
    ts: new Date().toISOString(),
    service: "mock-email",
    ...entry,
  };
  process.stdout.write(JSON.stringify(line) + "\n");
  shipper?.ship(line);
}

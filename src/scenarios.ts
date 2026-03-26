import type { ScenarioName, ScenarioState } from "./types.js";

export const VALID_SCENARIOS: readonly ScenarioName[] = [
  "auth_failure",
  "timeout",
  "malformed_response",
  "server_error",
  "rate_limit",
  "not_found",
];

export function isValidScenario(name: string): name is ScenarioName {
  return (VALID_SCENARIOS as readonly string[]).includes(name);
}

/**
 * Create a fresh, isolated scenario state.
 *
 * Each app instance gets its own state — no module-level singleton
 * that could leak between tests or app instances.
 */
export function createScenarioState(): ScenarioState {
  return { active: null };
}

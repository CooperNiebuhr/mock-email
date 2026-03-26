import { Hono } from "hono";
import type { EmailStore } from "../store.js";
import type { SeedData } from "../store.js";
import type { ScenarioState } from "../types.js";
import { isValidScenario, VALID_SCENARIOS } from "../scenarios.js";
import { DEFAULT_SEED } from "../seed.js";

export function adminRoutes(store: EmailStore, scenarioState: ScenarioState) {
  const router = new Hono();

  // POST /admin/scenarios — set or clear the active failure scenario
  router.post("/scenarios", async (c) => {
    const body = await c.req.json<{ active: string | null }>();

    if (body.active === null || body.active === undefined) {
      scenarioState.active = null;
      return c.json({ active: null });
    }

    if (!isValidScenario(body.active)) {
      return c.json(
        {
          error: `Invalid scenario "${body.active}". Valid: ${VALID_SCENARIOS.join(", ")}`,
        },
        400,
      );
    }

    scenarioState.active = body.active;
    return c.json({ active: body.active });
  });

  // GET /admin/scenarios — get current scenario state
  router.get("/scenarios", (c) => {
    return c.json({ active: scenarioState.active });
  });

  // POST /admin/reset — reset store to seed data and clear scenarios
  router.post("/reset", async (c) => {
    let seed: SeedData;
    try {
      const body = await c.req.text();
      seed = body ? JSON.parse(body) : DEFAULT_SEED;
    } catch {
      seed = DEFAULT_SEED;
    }

    store.reset(seed);
    scenarioState.active = null;
    return c.json({ status: "reset", messagesTotal: store.getProfile().messagesTotal });
  });

  return router;
}

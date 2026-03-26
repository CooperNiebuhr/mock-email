import { Hono } from "hono";
import type { EmailStore } from "../store.js";

export function labelRoutes(store: EmailStore) {
  const router = new Hono();

  // GET /gmail/v1/users/me/labels
  router.get("/", (c) => {
    return c.json({ labels: store.listLabels() });
  });

  // GET /gmail/v1/users/me/labels/:id
  router.get("/:id", (c) => {
    const label = store.getLabel(c.req.param("id"));
    if (!label) {
      return c.json(
        { error: { code: 404, message: "Label not found", status: "NOT_FOUND" } },
        404,
      );
    }
    return c.json(label);
  });

  return router;
}

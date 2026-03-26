import { Hono } from "hono";
import type { EmailStore } from "../store.js";

export function profileRoutes(store: EmailStore) {
  const router = new Hono();

  // GET /gmail/v1/users/me/profile
  router.get("/", (c) => {
    return c.json(store.getProfile());
  });

  return router;
}

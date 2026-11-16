import type { Express } from "express";

export function registerHealthRoutes(app: Pick<Express, "get">, isReady: () => boolean): void {
  app.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/health/ready", (_req, res) => {
    const ready = isReady();
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  });
}

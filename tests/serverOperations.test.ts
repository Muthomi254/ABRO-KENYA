import assert from "node:assert/strict";
import { once } from "node:events";
import { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { getServerPort } from "../src/serverConfig";
import { registerHealthRoutes } from "../src/serverHealth";

test("getServerPort defaults to 3000 when PORT is unset", () => {
  assert.equal(getServerPort(undefined), 3000);
});

test("getServerPort accepts valid configured ports", () => {
  assert.equal(getServerPort("8080"), 8080);
});

test("getServerPort rejects invalid configured ports", () => {
  for (const value of ["", "3000abc", "0", "-1", "65536", "1.5"]) {
    assert.throws(() => getServerPort(value), /PORT must be an integer/);
  }
});

test("health endpoints report liveness and readiness", async () => {
  const app = express();
  let ready = false;
  registerHealthRoutes(app, () => ready);

  const server = app.listen(0);
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const liveResponse = await fetch(`${baseUrl}/health/live`);
    assert.equal(liveResponse.status, 200);
    assert.deepEqual(await liveResponse.json(), { status: "ok" });

    const notReadyResponse = await fetch(`${baseUrl}/health/ready`);
    assert.equal(notReadyResponse.status, 503);
    assert.deepEqual(await notReadyResponse.json(), { status: "not_ready" });

    ready = true;
    const readyResponse = await fetch(`${baseUrl}/health/ready`);
    assert.equal(readyResponse.status, 200);
    assert.deepEqual(await readyResponse.json(), { status: "ready" });
  } finally {
    server.close();
    await once(server, "close");
  }
});

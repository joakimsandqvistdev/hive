import assert from "node:assert/strict";
process.env.RUNNER_API_TOKEN ??= "test-runner-token";
import { createServer } from "node:http";
import { test } from "node:test";
import { FormData } from "undici";
import { createModelRunnerClient } from "../src/modelRunnerClient.js";

test("runner client waits for delayed headers and body and preserves multipart references", async () => {
  let received = "";
  let generationId = "";
  const server = createServer(async (req, res) => {
    assert.match(req.headers["content-type"] ?? "", /multipart\/form-data; boundary=/);
    generationId = String(req.headers["x-hive-generation-id"] ?? "");
    for await (const chunk of req) received += chunk.toString();
    setTimeout(() => {
      res.writeHead(200, { "content-type": "image/png" });
      res.flushHeaders();
      setTimeout(() => res.end("test output"), 100);
    }, 100);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = createModelRunnerClient(`http://127.0.0.1:${address.port}`, 2000);
  try {
    const form = new FormData();
    form.set("width", "512");
    form.append("images", new Blob(["reference one"], { type: "image/png" }), "one.png");
    form.append("images", new Blob(["reference two"], { type: "image/png" }), "two.png");
    const response = await client.generate("image", form, new AbortController().signal);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "test output");
    assert.match(generationId, /^[0-9a-f-]{36}$/i);
    assert.match(received, /name="width"\r\n\r\n512/);
    assert.ok(received.indexOf("reference one") < received.indexOf("reference two"));
  } finally {
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("runner client enforces its deadline and caller cancellation while waiting for headers", async () => {
  const cancelled: string[] = [];
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/cancel-generation/")) {
      cancelled.push(decodeURIComponent(req.url.slice("/cancel-generation/".length)));
      req.resume();
      res.writeHead(202);
      res.end();
      return;
    }
    req.resume();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const timedClient = createModelRunnerClient(url, 100);
  const cancellableClient = createModelRunnerClient(url, 2000);
  try {
    await assert.rejects(timedClient.generate("image", new FormData(), new AbortController().signal), /timed out/);
    const controller = new AbortController();
    const pending = cancellableClient.generate("image", new FormData(), controller.signal);
    controller.abort();
    await assert.rejects(pending, /interrupted/);
    assert.equal(cancelled.length, 2);
    assert.match(cancelled[0], /^[0-9a-f-]{36}$/i);
  } finally {
    await Promise.all([timedClient.close(), cancellableClient.close()]);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

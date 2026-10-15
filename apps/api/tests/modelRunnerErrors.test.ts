import assert from "node:assert/strict";
import { test } from "node:test";
import { modelRunnerRejection, modelRunnerTransportFailure } from "../src/modelRunnerErrors.js";

test("transport errors distinguish timeout, unavailable runner, and closed connection safely", () => {
  for (const [code, pattern] of [
    ["UND_ERR_HEADERS_TIMEOUT", /timed out/],
    ["ECONNREFUSED", /Cannot connect/],
    ["UND_ERR_SOCKET", /connection closed/],
  ] as const) {
    const message = modelRunnerTransportFailure(new TypeError("private input", { cause: { code, message: "private input" } }));
    assert.match(message, pattern);
    assert.doesNotMatch(message, /private input/);
  }
  assert.equal(modelRunnerTransportFailure("private input"), "Image runner connection failed. Check the local runner status and logs.");
});

test("reports memory failure with actionable guidance", async () => {
  const response = Response.json({ detail: { code: "out_of_memory" } }, { status: 500 });
  assert.match(await modelRunnerRejection(response), /ran out of GPU or system memory/);
});

test("reports the runner deadline and process cleanup", async () => {
  assert.match(await modelRunnerRejection(Response.json({ detail: { code: "generation_timeout" } }, { status: 504 })), /released the generation process/);
});

test("reports a recognized generic failure without echoing private data", async () => {
  const response = Response.json({ detail: { code: "generation_failed", message: "private prompt" } }, { status: 500 });
  const message = await modelRunnerRejection(response);
  assert.match(message, /runner logs/);
  assert.doesNotMatch(message, /private prompt/);
});

test("keeps unknown and malformed server errors generic", async () => {
  for (const body of ['{"detail":"private prompt"}', 'null', 'Internal Server Error', '{"detail":{"code":"private prompt"}}']) {
    assert.equal(await modelRunnerRejection(new Response(body, { status: 500 })), "Image runner rejected the request with HTTP 500.");
  }
});

test("retains safe validation summaries without submitted inputs", async () => {
  const response = Response.json({ detail: [{ loc: ["body", "width"], msg: "Invalid dimension", input: "private prompt" }] }, { status: 422 });
  assert.equal(await modelRunnerRejection(response), "Image runner validation failed: width: Invalid dimension");
});

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import { createArtifactUploadAdmission } from "../src/artifactUploadAdmission.js";

class SharedAdvisoryLockPool {
  readonly locks = new Set<number>();

  async connect(): Promise<PoolClient> {
    return {
      query: async <Row>(statement: string, values?: number[]) => {
        const slot = values?.[1];
        if (statement.includes("pg_try_advisory_lock") && slot !== undefined) {
          const acquired = !this.locks.has(slot);
          if (acquired) this.locks.add(slot);
          return { rows: [{ locked: acquired } as Row] };
        }
        if (statement.includes("pg_advisory_unlock") && slot !== undefined) {
          this.locks.delete(slot);
          return { rows: [{ unlocked: true } as Row] };
        }
        throw new Error(`Unexpected query in test fake: ${statement}`);
      },
      release: () => undefined,
    } as unknown as PoolClient;
  }
}

function invoke(middleware: ReturnType<typeof createArtifactUploadAdmission>, userId: string) {
  const request = Object.assign(new EventEmitter(), { complete: false, aborted: false }) as Request;
  const response = Object.assign(new EventEmitter(), {
    locals: { userId },
    statusCode: 200,
    headers: {} as Record<string, string>,
    set(name: string, value: string) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(_body: unknown) { return this; },
  }) as unknown as Response & { statusCode: number; headers: Record<string, string> };
  let nextCalls = 0;
  let nextError: unknown;
  middleware(request, response, (error?: unknown) => { nextCalls += 1; nextError = error; });
  return { request, response, get nextCalls() { return nextCalls; }, get nextError() { return nextError; } };
}

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

test("shares the two upload slots across separate API-process admission gates", async () => {
  const database = new SharedAdvisoryLockPool();
  const processA = createArtifactUploadAdmission(() => database.connect());
  const processB = createArtifactUploadAdmission(() => database.connect());

  const first = invoke(processA, "user-a");
  const second = invoke(processB, "user-b");
  await turn();
  assert.equal(first.nextCalls, 1);
  assert.equal(second.nextCalls, 1);
  assert.equal(database.locks.size, 2);

  const rejected = invoke(processA, "user-c");
  await turn();
  assert.equal(rejected.nextCalls, 0);
  assert.equal(rejected.response.statusCode, 429);
  assert.equal(rejected.response.headers["Retry-After"], "1");

  first.request.complete = true;
  first.response.emit("finish");
  await turn();
  const admittedAfterRelease = invoke(processA, "user-c");
  await turn();
  assert.equal(admittedAfterRelease.nextCalls, 1);

  second.request.complete = true;
  second.response.emit("finish");
  admittedAfterRelease.request.complete = true;
  admittedAfterRelease.response.emit("finish");
  await turn();
  assert.equal(database.locks.size, 0);
});

test("keeps the per-user limit and releases a slot when the request aborts", async () => {
  const database = new SharedAdvisoryLockPool();
  const gate = createArtifactUploadAdmission(() => database.connect());
  const first = invoke(gate, "same-user");
  await turn();
  assert.equal(first.nextCalls, 1);

  const rejected = invoke(gate, "same-user");
  await turn();
  assert.equal(rejected.response.statusCode, 429);
  assert.equal(rejected.nextCalls, 0);

  first.request.aborted = true;
  first.request.emit("aborted");
  await turn();
  const next = invoke(gate, "same-user");
  await turn();
  assert.equal(next.nextCalls, 1);
  next.request.complete = true;
  next.response.emit("finish");
  await turn();
  assert.equal(database.locks.size, 0);
});

test("fails closed when the shared admission store is unavailable", async () => {
  const gate = createArtifactUploadAdmission(async () => { throw new Error("database unavailable"); });
  const request = invoke(gate, "user-a");
  await turn();
  assert.equal(request.nextCalls, 1);
  assert.equal(request.nextError instanceof Error, true);

  const retry = invoke(gate, "user-a");
  await turn();
  assert.equal(retry.nextError instanceof Error, true);
});

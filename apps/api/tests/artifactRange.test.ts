import assert from "node:assert/strict";
import test from "node:test";
import { parseArtifactByteRange } from "../src/artifactRange.js";

test("parses explicit, open-ended, and suffix byte ranges", () => {
  assert.deepEqual(parseArtifactByteRange("bytes=2-5", 10), { start: 2, end: 5 });
  assert.deepEqual(parseArtifactByteRange("bytes=8-", 10), { start: 8, end: 9 });
  assert.deepEqual(parseArtifactByteRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.deepEqual(parseArtifactByteRange("bytes=-30", 10), { start: 0, end: 9 });
  assert.deepEqual(parseArtifactByteRange("bytes=4-99", 10), { start: 4, end: 9 });
});

test("rejects malformed, multi-part, and unsatisfiable byte ranges", () => {
  for (const range of ["bytes=", "items=0-1", "bytes=10-", "bytes=5-2", "bytes=-0", "bytes=0-1,3-4"]) {
    assert.equal(parseArtifactByteRange(range, 10), null, range);
  }
  assert.equal(parseArtifactByteRange("bytes=0-", 0), null);
  assert.equal(parseArtifactByteRange("bytes=9007199254740992-", 10), null);
});

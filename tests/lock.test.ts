import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquireLock } from "../lib/server/lock";
test("only one concurrent generator holds the file lock and release permits retry", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "game-daily-test-"));
  try {
    const file = path.join(dir, "job.lock");
    const first = await acquireLock(file);
    assert.ok(first);
    assert.equal(await acquireLock(file), null);
    await first();
    const second = await acquireLock(file);
    assert.ok(second);
    await second();
  } finally {
    if (
      !path
        .resolve(dir)
        .startsWith(path.resolve(os.tmpdir()) + path.sep + "game-daily-test-")
    )
      throw Error("Unsafe test cleanup");
    await rm(dir, { recursive: true, force: true });
  }
});

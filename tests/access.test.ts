import test from "node:test";
import assert from "node:assert/strict";
import { localAccess } from "../lib/server/access";
test("Next internal localhost URL accepts original same-origin host", () => {
  assert.doesNotThrow(() =>
    localAccess(
      new Request("http://localhost:3000/api", {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    ),
  );
});
test("foreign origins and public hosts are rejected", () => {
  assert.throws(() =>
    localAccess(
      new Request("http://localhost:3000/api", {
        headers: { host: "127.0.0.1:3000", origin: "https://evil.example" },
      }),
    ),
  );
  assert.throws(() => localAccess(new Request("http://example.com/api")));
});

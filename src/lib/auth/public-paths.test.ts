import assert from "node:assert/strict";
import test from "node:test";
import { isPublicPath } from "./public-paths";

test("the landing page is public, but only as an exact path", () => {
  assert.equal(isPublicPath("/"), true);
  for (const path of ["/today", "/tcf", "//", "/x/"]) assert.equal(isPublicPath(path), false, path);
});

test("public prefixes cover the prefix and its children only", () => {
  for (const path of ["/login", "/login/x", "/assets/a.png", "/api/auth/session", "/api/cron/guests"]) {
    assert.equal(isPublicPath(path), true, path);
  }
  for (const path of ["/loginx", "/assetsx", "/api/other", "/media/a.mp3"]) assert.equal(isPublicPath(path), false, path);
});

test("/demo is no longer public: next.config redirects it before the proxy runs", () => {
  assert.equal(isPublicPath("/demo"), false);
});

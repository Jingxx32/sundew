import test from "node:test";
import assert from "node:assert/strict";
import { validateTarget } from "./safety.mjs";

const name = "sundew_review_test_fixture";
const url = `postgres://sundew_review_test@127.0.0.1:55439/${name}`;
test("requires an explicit isolated endpoint and refuses business aliases/overrides", () => {
  assert.equal(validateTarget(url, name).port, "55439");
  for (const raw of [undefined, url.replace("127.0.0.1", "localhost"), url.replace("127.0.0.1", "example.com"),
    url.replace("55439", "5432"), `${url}?host=example.com`, `${url}#secret`, url.replace(name, "business"),
    url.replace("sundew_review_test@", "postgres@")]) {
    assert.throws(() => validateTarget(raw, name));
  }
  assert.throws(() => validateTarget(url, name, "postgres://app@localhost:55439/business"));
  assert.throws(() => validateTarget(url, "business"));
});

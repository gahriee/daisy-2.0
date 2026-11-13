import assert from "node:assert/strict";

const base = "http://127.0.0.1:3000";
for (const [path, status] of [
  ["/", 200],
  ["/api/auth/get-session", 200],
  ["/api/system/status", 401],
]) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, status);
  if (path.startsWith("/api/"))
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  console.log(`PASS HTTP ${path}: ${status}`);
}
const signup = await fetch(`${base}/api/auth/sign-up/email`, {
  method: "POST",
});
assert.equal(signup.status, 404);
console.log("PASS HTTP public sign-up blocked: 404");
const foreign = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { origin: "https://foreign.example" },
});
assert.equal(foreign.status, 403);
console.log("PASS HTTP foreign-origin sign-in blocked: 403");

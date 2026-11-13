import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const email = process.env.NEON_CHECK_EMAIL;
const password = process.env.NEON_CHECK_PASSWORD;
const origin = process.env.APP_ORIGIN;
if (!email || !password || !origin || !process.env.OWNER_USER_ID) {
  console.error(
    "PENDING: configure Owner ID and temporary local verification credentials.",
  );
  process.exitCode = 1;
} else {
  const base = "http://127.0.0.1:3000";
  let cookies = "";
  try {
    const login = await fetch(`${base}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({ email, password }),
    });
    cookies = login.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    assert.equal(login.status, 200);
    assert.ok(cookies);
    console.log(
      "PASS Auth: Owner sign-in established HttpOnly session cookies",
    );
    assert.ok(
      login.headers.getSetCookie().every((cookie) => /HttpOnly/i.test(cookie)),
    );
    const session = await fetch(`${base}/api/auth/get-session`, {
      headers: { cookie: cookies },
    });
    assert.equal((await session.json()).authenticated, true);
    const status = await fetch(`${base}/api/system/status`, {
      headers: { cookie: cookies },
    });
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), {
      database: "connected",
      auth: "owner",
      storage: "connected",
    });
    console.log(
      "PASS Auth: live Owner session authorizes app database and storage checks",
    );
  } catch {
    console.error(
      "FAIL Auth: Owner sign-in or authorized service check failed; provider details redacted.",
    );
    process.exitCode = 1;
  } finally {
    try {
      if (cookies) {
        const logout = await fetch(`${base}/api/auth/sign-out`, {
          method: "POST",
          headers: { origin, cookie: cookies },
        });
        assert.equal(logout.status, 200);
        const stale = await fetch(`${base}/api/system/status`, {
          headers: { cookie: cookies },
        });
        assert.equal(stale.status, 401);
        console.log(
          "PASS Auth: sign-out revokes session; prior cookies denied",
        );
      }
    } catch {
      console.error(
        "FAIL Auth: session cleanup/revocation could not be verified.",
      );
      process.exitCode = 1;
    } finally {
      const env = readFileSync(".env.local", "utf8");
      writeFileSync(
        ".env.local",
        env.replace(/^NEON_CHECK_(EMAIL|PASSWORD)=.*(?:\r?\n|$)/gm, ""),
      );
      console.log("Temporary local verification credential fields removed");
    }
  }
}

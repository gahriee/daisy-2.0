import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const pubJwk = publicKey.export({ format: "jwk" }) as {
  x?: string;
  y?: string;
};
const privJwk = privateKey.export({ format: "jwk" }) as { d?: string };

if (!pubJwk.x || !pubJwk.y || !privJwk.d) {
  throw new Error("Could not generate P-256 VAPID keys.");
}

const rawPublic = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(pubJwk.x, "base64url"),
  Buffer.from(pubJwk.y, "base64url"),
]).toString("base64url");
const rawPrivate = Buffer.from(privJwk.d, "base64url").toString("base64url");

console.log(`VAPID_PUBLIC_KEY=${rawPublic}`);
console.log(`VAPID_PRIVATE_KEY=${rawPrivate}`);
console.log("VAPID_SUBJECT=mailto:owner@example.com");


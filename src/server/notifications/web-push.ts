import "server-only";
import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
} from "node:crypto";
import { getDatabase } from "@/server/db/client";

export type WebPushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/**
 * Generates an uncompressed P-256 VAPID key pair encoded as base64url strings
 * (`publicKey` = 65 bytes, `privateKey` = 32 bytes).
 */
export function generateVapidKeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const pubJwk = publicKey.export({ format: "jwk" }) as {
    x?: string;
    y?: string;
  };
  const privJwk = privateKey.export({ format: "jwk" }) as { d?: string };
  if (!pubJwk.x || !pubJwk.y || !privJwk.d) {
    throw new Error("Could not export P-256 VAPID key pair.");
  }
  const rawPublic = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(pubJwk.x, "base64url"),
    Buffer.from(pubJwk.y, "base64url"),
  ]);
  return {
    publicKey: rawPublic.toString("base64url"),
    privateKey: Buffer.from(privJwk.d, "base64url").toString("base64url"),
  };
}

export function getVapidConfig(
  environment: Record<string, string | undefined> = process.env,
): VapidConfig | null {
  const publicKey = environment.VAPID_PUBLIC_KEY?.trim();
  const privateKey = environment.VAPID_PRIVATE_KEY?.trim();
  const subject =
    environment.VAPID_SUBJECT?.trim() ||
    environment.APP_ORIGIN?.trim() ||
    "mailto:owner@daisy.local";

  if (!publicKey || !privateKey) {
    return null;
  }
  return { publicKey, privateKey, subject };
}

function hkdfExtract(salt: Buffer, ikm: Buffer): Buffer {
  return createHmac("sha256", salt).update(ikm).digest();
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
  const t = createHmac("sha256", prk)
    .update(Buffer.concat([info, Buffer.from([1])]))
    .digest();
  return t.subarray(0, length);
}

/**
 * Encrypts a UTF-8 Web Push payload according to RFC 8291 (`aes128gcm`).
 */
export function encryptWebPushPayload(params: {
  plaintext: string;
  userPublicKeyB64Url: string;
  userAuthB64Url: string;
}): Buffer {
  const uaPublic = Buffer.from(params.userPublicKeyB64Url, "base64url");
  const authSecret = Buffer.from(params.userAuthB64Url, "base64url");
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error("Invalid subscriber P-256 public key.");
  }
  if (authSecret.length !== 16) {
    throw new Error("Invalid subscriber auth secret.");
  }

  const localEcdh = createECDH("prime256v1");
  localEcdh.generateKeys();
  const asPublic = localEcdh.getPublicKey();
  const ecdhSecret = localEcdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    uaPublic,
    asPublic,
  ]);
  const prkKey = hkdfExtract(authSecret, ecdhSecret);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);

  const salt = randomBytes(16);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(
    prk,
    Buffer.from("Content-Encoding: aes128gcm\0", "utf8"),
    16,
  );
  const nonce = hkdfExpand(
    prk,
    Buffer.from("Content-Encoding: nonce\0", "utf8"),
    12,
  );

  const plaintextBuf = Buffer.concat([
    Buffer.from(params.plaintext, "utf8"),
    Buffer.from([0x02]),
  ]);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintextBuf),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const header = Buffer.concat([
    salt,
    rs,
    Buffer.from([asPublic.length]),
    asPublic,
  ]);

  return Buffer.concat([header, ciphertext]);
}

/**
 * Creates a VAPID `Authorization` header (RFC 8292) for the target push origin.
 */
export function buildVapidAuthorizationHeader(params: {
  endpoint: string;
  vapid: VapidConfig;
  nowSec?: number;
}): string {
  const audience = new URL(params.endpoint).origin;
  const exp = (params.nowSec ?? Math.floor(Date.now() / 1000)) + 12 * 60 * 60;

  const headerB64 = Buffer.from(
    JSON.stringify({ typ: "JWT", alg: "ES256" }),
  ).toString("base64url");
  const payloadB64 = Buffer.from(
    JSON.stringify({ aud: audience, exp, sub: params.vapid.subject }),
  ).toString("base64url");
  const signingInput = `${headerB64}.${payloadB64}`;

  const rawPub = Buffer.from(params.vapid.publicKey, "base64url");
  if (rawPub.length !== 65 || rawPub[0] !== 0x04) {
    throw new Error("Invalid VAPID_PUBLIC_KEY format.");
  }
  const keyObj = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: rawPub.subarray(1, 33).toString("base64url"),
      y: rawPub.subarray(33, 65).toString("base64url"),
      d: params.vapid.privateKey,
    },
    format: "jwk",
  });

  const sig = cryptoSign("sha256", Buffer.from(signingInput, "utf8"), {
    key: keyObj,
    dsaEncoding: "ieee-p1363",
  });
  const jwt = `${signingInput}.${sig.toString("base64url")}`;
  return `vapid t=${jwt}, k=${params.vapid.publicKey}`;
}

export async function sendWebPushMessage(params: {
  subscription: { endpoint: string; p256dh: string; auth: string };
  payload: WebPushPayload;
  vapid: VapidConfig;
  fetcher?: typeof fetch;
}): Promise<{ ok: boolean; status: number; expired: boolean }> {
  const encryptedBody = encryptWebPushPayload({
    plaintext: JSON.stringify({
      title: params.payload.title,
      body: params.payload.body,
      url: params.payload.url.startsWith("/") ? params.payload.url : "/",
      ...(params.payload.tag ? { tag: params.payload.tag } : {}),
    }),
    userPublicKeyB64Url: params.subscription.p256dh,
    userAuthB64Url: params.subscription.auth,
  });

  const authHeader = buildVapidAuthorizationHeader({
    endpoint: params.subscription.endpoint,
    vapid: params.vapid,
  });

  const fetchImpl = params.fetcher ?? fetch;
  const response = await fetchImpl(params.subscription.endpoint, {
    method: "POST",
    headers: {
      authorization: authHeader,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "86400",
      urgency: "high",
    },
    body: new Uint8Array(encryptedBody),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  return {
    ok: response.ok,
    status: response.status,
    expired: response.status === 404 || response.status === 410,
  };
}

/**
 * Sends a PII-free push notification to all registered devices for the Owner.
 * Cleans up expired endpoints (`404`/`410`) and runs outside domain transactions.
 */
export async function sendOwnerPushNotification(
  ownerUserId: string,
  payload: WebPushPayload,
  options?: {
    fetcher?: typeof fetch;
    environment?: Record<string, string | undefined>;
  },
): Promise<{ attempted: number; delivered: number; expiredRemoved: number }> {
  const vapid = getVapidConfig(options?.environment);
  if (!vapid) {
    return { attempted: 0, delivered: 0, expiredRemoved: 0 };
  }

  const db = getDatabase();
  const subscriptions = await db.pushSubscription.findMany({
    where: { ownerUserId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
    take: 25,
  });

  if (subscriptions.length === 0) {
    return { attempted: 0, delivered: 0, expiredRemoved: 0 };
  }

  let delivered = 0;
  const expiredIds: string[] = [];
  const deliveredIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        const res = await sendWebPushMessage({
          subscription: sub,
          payload,
          vapid,
          ...(options?.fetcher ? { fetcher: options.fetcher } : {}),
        });
        if (res.ok) {
          delivered += 1;
          deliveredIds.push(sub.id);
        } else if (res.expired) {
          expiredIds.push(sub.id);
        }
      } catch {
        // Never fail domain operations on push network errors.
      }
    }),
  );

  if (expiredIds.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { ownerUserId, id: { in: expiredIds } },
    });
  }
  if (deliveredIds.length > 0) {
    await db.pushSubscription.updateMany({
      where: { ownerUserId, id: { in: deliveredIds } },
      data: { lastUsedAt: new Date() },
    });
  }

  return {
    attempted: subscriptions.length,
    delivered,
    expiredRemoved: expiredIds.length,
  };
}

/**
 * Best-effort wrapper for domain routes/services after DB commit.
 */
export async function notifyOwnerPushSafe(
  ownerUserId: string,
  payload: WebPushPayload,
): Promise<void> {
  try {
    await sendOwnerPushNotification(ownerUserId, payload);
  } catch {
    // Deliberately non-fatal; never log secrets or PII.
  }
}


import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Per-visitor ownership for saved lectures.
 *
 * There is no account system yet, so "who owns this lecture" is answered by a
 * random device-scoped id held in a signed, HttpOnly cookie. The id is minted
 * by the server (`src/proxy.ts`) and every query filters on it, so one student
 * can never see or open another student's lecture.
 *
 * Properties that matter:
 *
 *   - The cookie is HttpOnly, so client JavaScript cannot read or forge it, and
 *     the owner id is never taken from a request header or body.
 *   - It is HMAC-signed with IDENTITY_SECRET, so a hand-edited cookie is
 *     rejected rather than trusted.
 *   - The secret must be stable across deploys. If it changes, every existing
 *     cookie fails verification and those lectures become unreachable — so a
 *     missing secret throws in production rather than silently falling back to
 *     a guessable default that would leak data across users.
 *
 * Tradeoff, accepted deliberately: this identifies a browser, not a person.
 * Clearing site data loses access to that library. The upgrade path is to keep
 * the `ownerId` field and repoint it at a real user id once accounts exist.
 */

export const OWNER_COOKIE = "ls_owner";

/** Bumped only if the token format changes, which invalidates old cookies. */
const TOKEN_VERSION = "v1";

/** 128 bits of entropy — unguessable even though the cookie is signed. */
const OWNER_ID_BYTES = 16;

const DEV_SECRET =
  "lecturescribe-development-secret-not-for-production-use";

let cachedSecret: string | undefined;

function getSecret(): string {
  if (cachedSecret !== undefined) return cachedSecret;

  const configured = process.env.IDENTITY_SECRET?.trim();
  if (configured) {
    cachedSecret = configured;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === "production") {
    // Failing closed: without a secret there is no isolation, and a guessable
    // default would let anyone mint a cookie for any owner id.
    throw new Error(
      "IDENTITY_SECRET is not configured. Set it to a long random string " +
        "(e.g. `openssl rand -hex 32`) and keep it stable — changing it " +
        "orphans every saved lecture."
    );
  }

  cachedSecret = DEV_SECRET;
  return cachedSecret;
}

/** Test seam: forget the memoised secret after changing the env. */
export function resetIdentitySecretCache(): void {
  cachedSecret = undefined;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

/** Mint a fresh owner id and its signed cookie value. */
export function createOwnerToken(): {
  ownerId: string;
  token: string;
} {
  const ownerId = randomBytes(OWNER_ID_BYTES).toString("base64url");
  const payload = `${TOKEN_VERSION}.${ownerId}`;
  return { ownerId, token: `${payload}.${sign(payload)}` };
}

/**
 * Verify a cookie value and return its owner id, or null if it is missing,
 * malformed, signed with a different secret, or from an older format.
 */
export function verifyOwnerToken(token: string | undefined): string | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [version, ownerId, mac] = parts as [string, string, string];
  if (version !== TOKEN_VERSION || !ownerId || !mac) return null;

  const expected = sign(`${version}.${ownerId}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so guard first.
  if (a.length !== b.length) return null;

  return timingSafeEqual(a, b) ? ownerId : null;
}

export interface ResolvedOwner {
  ownerId: string;
  /** Cookie value to send back to the browser. */
  token: string;
  /** True when a new identity was minted and must be persisted. */
  isNew: boolean;
}

/** Reuse a valid cookie, or mint a replacement for a missing/invalid one. */
export function resolveOwner(existingToken: string | undefined): ResolvedOwner {
  const ownerId = verifyOwnerToken(existingToken);
  if (ownerId && existingToken) {
    return { ownerId, token: existingToken, isNew: false };
  }
  const created = createOwnerToken();
  return { ...created, isNew: true };
}

export const OWNER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  // A year: losing the cookie means losing the library, so err long and let
  // the user clear it deliberately.
  maxAge: 60 * 60 * 24 * 365,
  path: "/",
  // Only send over TLS in production; localhost is exempt automatically.
  secure: process.env.NODE_ENV === "production",
} as const;

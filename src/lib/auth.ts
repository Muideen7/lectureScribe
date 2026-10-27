import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { ObjectId } from "mongodb";
import { connectDb } from "@/lib/db";

export const AUTH_COOKIE = "ls_auth";
const TOKEN_VERSION = "v1";
const USERS_COLLECTION = "users";
const LECTURES_COLLECTION = "lectures";

const DEV_SECRET = "lecturescribe-development-secret-not-for-production-use";

function getSecret(): string {
  const configured = process.env.IDENTITY_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("IDENTITY_SECRET is not configured.");
  }
  return DEV_SECRET;
}

export interface UserSession {
  id: string;
  email: string;
}

export interface UserDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: Date;
}

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 30, // 30 days
  path: "/",
  secure: process.env.NODE_ENV === "production",
} as const;

/** Hash a plain password using PBKDF2 with SHA-512 and a random salt. */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  return { hash, salt };
}

/** Verify a plain password against a stored hash and salt. */
export function verifyPassword(
  password: string,
  storedHash: string,
  salt: string
): boolean {
  try {
    const computed = pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
    const a = Buffer.from(computed);
    const b = Buffer.from(storedHash);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/** Generate a signed session token encoding userId and email. */
export function createAuthSessionToken(user: { id: string; email: string }): string {
  const emailB64 = Buffer.from(user.email.toLowerCase().trim()).toString("base64url");
  const timestamp = Date.now().toString(36);
  const payload = `${TOKEN_VERSION}.${user.id}.${emailB64}.${timestamp}`;
  return `${payload}.${sign(payload)}`;
}

/** Verify session token and decode userId and email. */
export function verifyAuthSessionToken(token: string | undefined): UserSession | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5) return null;

  const [version, id, emailB64, timestamp, mac] = parts as [
    string,
    string,
    string,
    string,
    string
  ];
  if (version !== TOKEN_VERSION || !id || !emailB64 || !timestamp || !mac) {
    return null;
  }

  const payload = `${version}.${id}.${emailB64}.${timestamp}`;
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const email = Buffer.from(emailB64, "base64url").toString("utf8");
    return { id, email };
  } catch {
    return null;
  }
}

/** Inspect incoming cookies to get the current authenticated user, or null. */
export function getUserFromSession(
  cookieStore: ReadonlyRequestCookies | { get(name: string): { value: string } | undefined }
): UserSession | null {
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  return verifyAuthSessionToken(token);
}

/** Register a new user with email and password. */
export async function registerUser({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<UserSession> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Please enter a valid email address.");
  }
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const { db } = await connectDb();
  const collection = db.collection<UserDoc>(USERS_COLLECTION);

  // Ensure index on email
  await collection.createIndex({ email: 1 }, { unique: true }).catch(() => {});

  const existing = await collection.findOne({ email: normalizedEmail });
  if (existing) {
    throw new Error("An account with this email already exists. Please log in.");
  }

  const { hash, salt } = hashPassword(password);
  const insertResult = await collection.insertOne({
    _id: new ObjectId(),
    email: normalizedEmail,
    passwordHash: hash,
    salt,
    createdAt: new Date(),
  });

  return {
    id: insertResult.insertedId.toHexString(),
    email: normalizedEmail,
  };
}

/** Authenticate an existing user with email and password. */
export async function authenticateUser({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<UserSession> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new Error("Email and password are required.");
  }

  const { db } = await connectDb();
  const collection = db.collection<UserDoc>(USERS_COLLECTION);

  const user = await collection.findOne({ email: normalizedEmail });
  if (!user) {
    throw new Error("Invalid email or password.");
  }

  const valid = verifyPassword(password, user.passwordHash, user.salt);
  if (!valid) {
    throw new Error("Invalid email or password.");
  }

  return {
    id: user._id.toHexString(),
    email: user.email,
  };
}

/** Migrate lectures recorded anonymously to a registered user account. */
export async function migrateOwnerLectures(
  anonymousOwnerId: string | null | undefined,
  userOwnerId: string
): Promise<number> {
  if (!anonymousOwnerId || anonymousOwnerId === userOwnerId) return 0;
  try {
    const { db } = await connectDb();
    const lectures = db.collection(LECTURES_COLLECTION);
    const result = await lectures.updateMany(
      { ownerId: anonymousOwnerId },
      { $set: { ownerId: userOwnerId } }
    );
    return result.modifiedCount;
  } catch (err) {
    console.warn("[auth] lecture migration failed:", err);
    return 0;
  }
}

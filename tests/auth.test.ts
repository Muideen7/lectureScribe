import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createAuthSessionToken,
  hashPassword,
  verifyAuthSessionToken,
  verifyPassword,
} from "../src/lib/auth";

describe("auth: password hashing", () => {
  it("hashes password with salt and verifies correctly", () => {
    const password = "mySecurePassword123!";
    const { hash, salt } = hashPassword(password);
    assert.ok(hash && hash.length > 20);
    assert.ok(salt && salt.length > 10);
    assert.ok(verifyPassword(password, hash, salt));
    assert.ok(!verifyPassword("wrongPassword", hash, salt));
  });

  it("produces different salts and hashes for identical passwords", () => {
    const password = "samePassword";
    const res1 = hashPassword(password);
    const res2 = hashPassword(password);
    assert.notEqual(res1.salt, res2.salt);
    assert.notEqual(res1.hash, res2.hash);
    assert.ok(verifyPassword(password, res1.hash, res1.salt));
    assert.ok(verifyPassword(password, res2.hash, res2.salt));
  });
});

describe("auth: session tokens", () => {
  it("mints and verifies session token successfully", () => {
    const user = { id: "user1234567890abcdef", email: "student@unilag.edu.ng" };
    const token = createAuthSessionToken(user);
    assert.ok(typeof token === "string");

    const verified = verifyAuthSessionToken(token);
    assert.ok(verified !== null);
    assert.equal(verified.id, user.id);
    assert.equal(verified.email, user.email);
  });

  it("rejects tampered session token", () => {
    const user = { id: "user1234567890abcdef", email: "student@unilag.edu.ng" };
    const token = createAuthSessionToken(user);
    const tampered = token.slice(0, -4) + "abcd";
    assert.equal(verifyAuthSessionToken(tampered), null);
    assert.equal(verifyAuthSessionToken("invalid.token.parts"), null);
    assert.equal(verifyAuthSessionToken(undefined), null);
  });
});

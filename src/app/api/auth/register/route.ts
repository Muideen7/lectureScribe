import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  AUTH_COOKIE,
  AUTH_COOKIE_OPTIONS,
  createAuthSessionToken,
  migrateOwnerLectures,
  registerUser,
} from "@/lib/auth";
import {
  OWNER_COOKIE,
  OWNER_COOKIE_OPTIONS,
  createOwnerTokenForId,
  verifyOwnerToken,
} from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RegisterSchema = z.object({
  email: z.string().trim().email("Please provide a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid credentials." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const existingAnonToken = cookieStore.get(OWNER_COOKIE)?.value;
    const anonOwnerId = verifyOwnerToken(existingAnonToken);

    const user = await registerUser(parsed.data);

    // If there were any lectures created while anonymous on this device, migrate them
    if (anonOwnerId && anonOwnerId !== user.id) {
      await migrateOwnerLectures(anonOwnerId, user.id);
    }

    const sessionToken = createAuthSessionToken(user);
    const ownerToken = createOwnerTokenForId(user.id);

    const response = NextResponse.json({
      success: true,
      user,
    });

    response.cookies.set(AUTH_COOKIE, sessionToken, AUTH_COOKIE_OPTIONS);
    response.cookies.set(OWNER_COOKIE, ownerToken.token, OWNER_COOKIE_OPTIONS);

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

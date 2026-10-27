import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";
import {
  OWNER_COOKIE,
  OWNER_COOKIE_OPTIONS,
  createOwnerToken,
} from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ success: true });

  // Clear auth session cookie
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  // Reset to a new anonymous visitor token
  const fresh = createOwnerToken();
  response.cookies.set(OWNER_COOKIE, fresh.token, OWNER_COOKIE_OPTIONS);

  return response;
}

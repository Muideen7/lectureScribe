import { NextResponse, type NextRequest } from "next/server";
import {
  OWNER_COOKIE,
  OWNER_COOKIE_OPTIONS,
  resolveOwner,
} from "@/lib/identity";

/**
 * Mints the per-visitor owner cookie that scopes every saved lecture.
 *
 * Runs on the Node runtime (the Next 16 default for `proxy`), so the HMAC in
 * `@/lib/identity` is available. Stateless by design — it reads and writes one
 * cookie and nothing else, which keeps it safe to run on every request.
 *
 * Idempotent: an existing valid cookie is passed through untouched, so this
 * does not re-sign on each navigation.
 */
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(OWNER_COOKIE)?.value;
  const owner = resolveOwner(existing);

  if (!owner.isNew) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(OWNER_COOKIE, owner.token, OWNER_COOKIE_OPTIONS);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimization. API routes must
     * be included so a first-time API call (e.g. posting a recording) is
     * already scoped — the route reads the cookie, and a missing one would
     * otherwise mean an unowned lecture.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest).*)",
  ],
};

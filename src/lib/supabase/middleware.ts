import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Cron API routes authenticate themselves via CRON_SECRET, so they must NOT be
// redirected to /login by the session check (that's why the scheduled sync and
// Lark jobs were silently bouncing to the login page).
const PUBLIC_PATHS = ["/login", "/auth", "/api/cron", "/api/ingest"];

// The 2-step verification page. Signed-in users who haven't passed the
// authenticator-code step yet (or haven't set it up) are kept here.
const MFA_PATH = "/mfa";

// 2-step verification is built but switched OFF for now. To turn it on later,
// set NEXT_PUBLIC_REQUIRE_2FA=true in Vercel and redeploy — every login will
// then be walked through authenticator setup on its next visit.
export const REQUIRE_2FA = process.env.NEXT_PUBLIC_REQUIRE_2FA === "true";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // Two-step verification: every account must use an authenticator-app code.
  //  - has an authenticator but hasn't entered the code this session → /mfa
  //  - hasn't set one up yet → /mfa (setup), so nobody gets in on password alone
  if (!REQUIRE_2FA && path.startsWith(MFA_PATH)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (REQUIRE_2FA && user && !path.startsWith("/api/cron") && !path.startsWith("/api/ingest")) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const verified = aal?.currentLevel === "aal2";
    if (!verified && !path.startsWith(MFA_PATH)) {
      const url = request.nextUrl.clone();
      url.pathname = MFA_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (verified && (path === "/login" || path.startsWith(MFA_PATH))) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

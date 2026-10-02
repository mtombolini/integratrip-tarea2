import { NextResponse } from "next/server";
import { coreEnv } from "@/config/env";
import { clearSession } from "@/lib/auth/session";

// Logout is intentionally POST-only. A GET endpoint would be unsafe because
// Next.js may prefetch links and execute it before the user clicks logout.
export async function POST() {
  await clearSession();
  // 303 converts the form POST into a GET when following the redirect.
  return NextResponse.redirect(coreEnv().APP_BASE_URL, { status: 303 });
}

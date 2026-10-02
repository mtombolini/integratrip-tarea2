import { NextRequest, NextResponse } from "next/server";
import { coreEnv, redirectUri } from "@/config/env";
import { decryptOptional } from "@/lib/crypto";
import { exchangeCode } from "@/lib/oauth/engine";
import { consumeFlow } from "@/lib/oauth/flows";
import { verifyToken } from "@/lib/auth/jwt";
import { getSession, setSession } from "@/lib/auth/session";
import { upsertUser, createConnection } from "@/lib/connections/repo";
import type { ClientCredentials, AuthType } from "@/lib/oauth/types";

/** Single OAuth callback for both app login and MCP connection flows. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const base = coreEnv().APP_BASE_URL;

  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${base}/?error=${encodeURIComponent(error)}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(`${base}/?error=missing_code_or_state`);
  }

  const flow = await consumeFlow(state);
  if (!flow) {
    return NextResponse.redirect(`${base}/?error=invalid_or_expired_state`);
  }

  const client: ClientCredentials = {
    clientId: flow.payload.clientId,
    clientSecret: decryptOptional(flow.payload.clientSecretEnc) ?? undefined,
    metadataDocumentUrl: flow.payload.metadataDocumentUrl ?? undefined,
  };

  try {
    const tokens = await exchangeCode({
      tokenEndpoint: flow.payload.tokenEndpoint,
      code,
      redirectUri: redirectUri(),
      codeVerifier: flow.codeVerifier,
      resource: flow.resource,
      client,
    });

    if (flow.kind === "login") {
      const claims = await verifyToken(tokens.accessToken, {
        issuer: flow.payload.issuer,
        audience: flow.resource,
      });
      const subject = String(claims.sub);
      const email = claims.email ?? subject;
      const user = await upsertUser({
        subject,
        email,
        studentId: claims.student_id ?? null,
      });
      await setSession({
        uid: user.id,
        sub: subject,
        email,
        studentId: claims.student_id,
      });
      return NextResponse.redirect(`${base}/chat`);
    }

    // connect flow
    const session = await getSession();
    if (!session || session.uid !== flow.userId) {
      return NextResponse.redirect(`${base}/?error=session_mismatch`);
    }
    const conn = await createConnection({
      userId: session.uid,
      name: flow.payload.name ?? "MCP",
      authType: flow.payload.authType as AuthType,
      resourceUrl: flow.resource,
      issuer: flow.payload.issuer,
      authorizationEndpoint: flow.payload.authorizationEndpoint!,
      tokenEndpoint: flow.payload.tokenEndpoint,
      scope: flow.payload.scope ?? "mcp:tools",
      client: { ...client, raw: flow.payload.raw },
      tokens,
    });
    return NextResponse.redirect(`${base}/dashboard/connections/${conn.id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "oauth_failed";
    return NextResponse.redirect(
      `${base}/dashboard?error=${encodeURIComponent(msg.slice(0, 200))}`,
    );
  }
}

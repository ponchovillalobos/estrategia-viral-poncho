import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { readSettings } from "@/lib/user-settings";
import {
  LI_AUTHORIZE_URL,
  LI_SCOPES,
  LI_ANALYTICS_SCOPE,
  getRedirectUri,
} from "@/lib/linkedin-client";

export const dynamic = "force-dynamic";

/**
 * Inicia el OAuth 2.0 flow de LinkedIn (Authorization Code).
 * Lee el client_id de settings (no env vars). Genera state CSRF y lo guarda en cookie HttpOnly.
 * Redirige a la pantalla de autorización de LinkedIn.
 */
export async function GET(_req: NextRequest) {
  const settings = await readSettings();
  const clientId = settings.linkedin.clientId;

  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "Falta Client ID de LinkedIn. Ve a Configuración → LinkedIn y completa Client ID + Secret de tu app.",
      },
      { status: 400 }
    );
  }

  // Scopes base (publicar) + analytics opt-in. El scope de analytics solo se pide si
  // el user lo habilitó Y su app está aprobada por LinkedIn — si no, LinkedIn rechaza el login.
  const scopes: string[] = [...LI_SCOPES];
  if (settings.linkedin.analyticsEnabled) scopes.push(LI_ANALYTICS_SCOPE);

  const state = crypto.randomBytes(24).toString("hex");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    state,
    scope: scopes.join(" "),
  });

  const authorizeUrl = `${LI_AUTHORIZE_URL}?${params.toString()}`;

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("linkedin_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600, // 10 min
    path: "/",
  });
  return response;
}

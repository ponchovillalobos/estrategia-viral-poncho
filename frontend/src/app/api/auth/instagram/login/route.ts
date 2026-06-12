import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { readSettings } from "@/lib/user-settings";
import { IG_AUTHORIZE_URL, IG_SCOPES, getRedirectUri } from "@/lib/instagram-client";

export const dynamic = "force-dynamic";

/**
 * Inicia el OAuth de Facebook Login para Instagram.
 * Lee el appId de settings. Genera state CSRF (cookie HttpOnly) y redirige al dialog.
 */
export async function GET(_req: NextRequest) {
  const settings = await readSettings();
  const appId = settings.instagram.appId;

  if (!appId) {
    return NextResponse.json(
      {
        error:
          "Falta App ID de Meta. Ve a Configuración → Instagram y completa App ID + App Secret de tu app.",
      },
      { status: 400 }
    );
  }

  const state = crypto.randomBytes(24).toString("hex");
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: getRedirectUri(),
    state,
    response_type: "code",
    scope: IG_SCOPES.join(","),
  });

  const authorizeUrl = `${IG_AUTHORIZE_URL}?${params.toString()}`;
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("instagram_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}

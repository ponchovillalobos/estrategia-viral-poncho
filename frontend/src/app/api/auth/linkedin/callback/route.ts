import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  personUrnFromSub,
} from "@/lib/linkedin-client";
import { readSettings, writeSettings } from "@/lib/user-settings";

export const dynamic = "force-dynamic";

/**
 * Callback OAuth de LinkedIn.
 * Recibe ?code=...&state=...; valida state contra la cookie, intercambia el code
 * por tokens, obtiene info de la persona, persiste todo y muestra success.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return makeErrorPage(
      `LinkedIn devolvió error: ${error}${errorDescription ? ` — ${errorDescription}` : ""}`
    );
  }
  if (!code || !state) {
    return makeErrorPage("Faltan parámetros code/state en el callback.");
  }

  const cookieState = req.cookies.get("linkedin_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return makeErrorPage(
      "State inválido (posible CSRF). Reintentá el login desde Settings."
    );
  }

  const settings = await readSettings();
  const { clientId, clientSecret } = settings.linkedin;
  if (!clientId || !clientSecret) {
    return makeErrorPage(
      "Faltan Client ID/Secret en Settings. Guardalos antes de conectar."
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code, clientId, clientSecret);

    let connectedName = "";
    let personUrn = "";
    try {
      const userInfo = await fetchUserInfo(tokens.access_token);
      connectedName = userInfo.name ?? userInfo.given_name ?? "";
      personUrn = personUrnFromSub(userInfo.sub);
    } catch (e) {
      console.warn("[linkedin/callback] fetchUserInfo falló:", e);
    }

    await writeSettings({
      linkedin: {
        ...settings.linkedin,
        accessToken: tokens.access_token,
        accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
        refreshToken: tokens.refresh_token ?? "",
        personUrn,
        connectedName,
      },
    });

    return makeSuccessPage(connectedName || personUrn || "(conectado)");
  } catch (err) {
    return makeErrorPage(err instanceof Error ? err.message : String(err));
  }
}

function makeSuccessPage(name: string) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>LinkedIn conectado</title>
  <style>
    body { background: #0a0a0a; color: #eee; font-family: ui-sans-serif, system-ui; display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .card { max-width: 420px; padding: 32px; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; text-align: center; }
    .check { width: 64px; height: 64px; border-radius: 50%; background: #38bdf822; color: #38bdf8; font-size: 32px; display: grid; place-items: center; margin: 0 auto 20px; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 8px 0; color: #aaa; font-size: 14px; }
    .acc { color: #38bdf8; font-family: ui-monospace, monospace; }
    a { display: inline-block; margin-top: 16px; padding: 8px 16px; background: #38bdf8; color: #000; text-decoration: none; border-radius: 8px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>LinkedIn conectado</h1>
    <p>Cuenta: <span class="acc">${escapeHtml(name)}</span></p>
    <p>Ya podés programar y publicar desde /produccion.</p>
    <a href="/produccion">Ir a Producción</a>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function makeErrorPage(message: string) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Error LinkedIn OAuth</title>
  <style>
    body { background: #0a0a0a; color: #eee; font-family: ui-sans-serif, system-ui; display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .card { max-width: 480px; padding: 32px; border: 1px solid #ef444444; border-radius: 16px; }
    h1 { color: #ef4444; margin: 0 0 12px; font-size: 18px; }
    pre { background: #1a1a1a; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; color: #fca5a5; white-space: pre-wrap; }
    a { display: inline-block; margin-top: 16px; padding: 8px 16px; background: #333; color: #eee; text-decoration: none; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>OAuth de LinkedIn falló</h1>
    <pre>${escapeHtml(message)}</pre>
    <a href="/">Volver al dashboard</a>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

import { NextRequest, NextResponse } from "next/server";
import { readSettings, writeSettings, type UserSettings } from "@/lib/user-settings";

export const dynamic = "force-dynamic";

/**
 * GET nunca devuelve secrets crudos al cliente (los reemplaza por flags hasX).
 * Si la dashboard se abre desde otra máquina de la red, evita filtrar tokens.
 */
function sanitize(s: UserSettings) {
  return {
    handles: s.handles,
    tiktok: {
      clientKey: s.tiktok.clientKey,
      hasClientSecret: Boolean(s.tiktok.clientSecret),
      hasAccessToken: Boolean(s.tiktok.accessToken),
      hasRefreshToken: Boolean(s.tiktok.refreshToken),
      accessTokenExpiresAt: s.tiktok.accessTokenExpiresAt,
      openId: s.tiktok.openId,
      connectedUsername: s.tiktok.connectedUsername,
    },
    linkedin: {
      clientId: s.linkedin.clientId,
      hasClientSecret: Boolean(s.linkedin.clientSecret),
      hasAccessToken: Boolean(s.linkedin.accessToken),
      hasRefreshToken: Boolean(s.linkedin.refreshToken),
      accessTokenExpiresAt: s.linkedin.accessTokenExpiresAt,
      personUrn: s.linkedin.personUrn,
      connectedName: s.linkedin.connectedName,
      analyticsEnabled: s.linkedin.analyticsEnabled,
    },
    instagram: {
      appId: s.instagram.appId,
      hasAppSecret: Boolean(s.instagram.appSecret),
      hasAccessToken: Boolean(s.instagram.accessToken),
      accessTokenExpiresAt: s.instagram.accessTokenExpiresAt,
      igUserId: s.instagram.igUserId,
      connectedUsername: s.instagram.connectedUsername,
      publicBaseUrl: s.instagram.publicBaseUrl,
    },
    pixabay: {
      // Nunca devolver la key cruda al cliente — solo el flag de existencia.
      hasApiKey: Boolean(s.pixabay?.apiKey),
    },
  };
}

export async function GET() {
  const settings = await readSettings();
  return NextResponse.json(sanitize(settings));
}

interface PutBody {
  handles?: UserSettings["handles"];
  tiktok?: {
    clientKey?: string;
    clientSecret?: string;
  };
  linkedin?: {
    clientId?: string;
    clientSecret?: string;
    analyticsEnabled?: boolean;
  };
  instagram?: {
    appId?: string;
    appSecret?: string;
    publicBaseUrl?: string;
  };
  pixabay?: {
    apiKey?: string;
  };
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as PutBody;
    const patch: Partial<UserSettings> = {};
    if (body.handles) patch.handles = body.handles;
    const current = await readSettings();
    if (body.tiktok) {
      patch.tiktok = {
        ...current.tiktok,
        clientKey: body.tiktok.clientKey ?? current.tiktok.clientKey,
        // Vacío = "no cambiar" (preserva el existing)
        clientSecret: body.tiktok.clientSecret
          ? body.tiktok.clientSecret
          : current.tiktok.clientSecret,
      };
    }
    if (body.linkedin) {
      patch.linkedin = {
        ...current.linkedin,
        clientId: body.linkedin.clientId ?? current.linkedin.clientId,
        clientSecret: body.linkedin.clientSecret
          ? body.linkedin.clientSecret
          : current.linkedin.clientSecret,
        analyticsEnabled:
          body.linkedin.analyticsEnabled ?? current.linkedin.analyticsEnabled,
      };
    }
    if (body.instagram) {
      patch.instagram = {
        ...current.instagram,
        appId: body.instagram.appId ?? current.instagram.appId,
        // Vacío = "no cambiar" (preserva el existing)
        appSecret: body.instagram.appSecret
          ? body.instagram.appSecret
          : current.instagram.appSecret,
        publicBaseUrl: body.instagram.publicBaseUrl ?? current.instagram.publicBaseUrl,
      };
    }
    if (body.pixabay) {
      patch.pixabay = {
        // Vacío = "no cambiar" (preserva el existing) — mismo patrón que los secrets
        // de tiktok/linkedin. Como GET ya no devuelve la key, la UI manda "" siempre
        // que el usuario no escriba una nueva.
        apiKey: body.pixabay.apiKey
          ? body.pixabay.apiKey
          : current.pixabay?.apiKey ?? "",
      };
    }
    const next = await writeSettings(patch);
    return NextResponse.json(sanitize(next));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/user-settings";

export const dynamic = "force-dynamic";

/**
 * Limpia los tokens OAuth de LinkedIn pero preserva clientId/clientSecret
 * (así el usuario puede reconectar sin re-registrar la app).
 */
export async function POST() {
  const settings = await readSettings();
  const next = await writeSettings({
    linkedin: {
      ...settings.linkedin,
      accessToken: "",
      accessTokenExpiresAt: 0,
      refreshToken: "",
      personUrn: "",
      connectedName: "",
    },
  });
  return NextResponse.json({
    handles: next.handles,
    tiktok: {
      clientKey: next.tiktok.clientKey,
      hasClientSecret: Boolean(next.tiktok.clientSecret),
      hasAccessToken: Boolean(next.tiktok.accessToken),
      hasRefreshToken: Boolean(next.tiktok.refreshToken),
      accessTokenExpiresAt: next.tiktok.accessTokenExpiresAt,
      openId: next.tiktok.openId,
      connectedUsername: next.tiktok.connectedUsername,
    },
    linkedin: {
      clientId: next.linkedin.clientId,
      hasClientSecret: Boolean(next.linkedin.clientSecret),
      hasAccessToken: false,
      hasRefreshToken: false,
      accessTokenExpiresAt: 0,
      personUrn: "",
      connectedName: "",
    },
  });
}

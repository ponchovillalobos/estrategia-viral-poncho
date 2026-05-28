import { NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/user-settings";

export const dynamic = "force-dynamic";

/**
 * Limpia los tokens OAuth de TikTok pero preserva clientKey/clientSecret
 * (así el usuario puede reconectar sin re-registrar la app).
 */
export async function POST() {
  const settings = await readSettings();
  const next = await writeSettings({
    tiktok: {
      ...settings.tiktok,
      accessToken: "",
      refreshToken: "",
      accessTokenExpiresAt: 0,
      openId: "",
      connectedUsername: "",
    },
  });
  return NextResponse.json({
    handles: next.handles,
    tiktok: {
      clientKey: next.tiktok.clientKey,
      hasClientSecret: Boolean(next.tiktok.clientSecret),
      hasAccessToken: false,
      hasRefreshToken: false,
      accessTokenExpiresAt: 0,
      openId: "",
      connectedUsername: "",
    },
  });
}

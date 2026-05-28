/**
 * Publica un Reel en Instagram vía Graph API (3 pasos):
 *   1. POST /{ig-user-id}/media   (media_type=REELS, video_url=<URL pública>, caption)
 *   2. Poll  /{creation-id}?fields=status_code  hasta FINISHED
 *   3. POST /{ig-user-id}/media_publish (creation_id)
 *
 * Instagram DESCARGA el video desde `video_url`, así que tiene que ser una URL HTTPS
 * pública (no localhost). Se construye con instagram.publicBaseUrl de settings (un túnel).
 *
 * Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing/
 */
import { readSettings } from "@/lib/user-settings";
import { GRAPH_BASE, getValidInstagramAccessToken } from "@/lib/instagram-client";

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 45; // ~3 min

export interface InstagramPublishOptions {
  /** id del render (sin extensión) — se sirve vía /api/videos/{id}/stream?source=render */
  videoId: string;
  /** Caption del Reel (hasta 2200 chars) */
  caption: string;
}

export interface InstagramPublishResult {
  mediaId: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function publishReelToInstagram(
  opts: InstagramPublishOptions
): Promise<InstagramPublishResult> {
  const token = await getValidInstagramAccessToken();
  if (!token) {
    throw new Error("No hay token de Instagram válido. Conectá la cuenta en Settings → Instagram.");
  }
  const settings = await readSettings();
  const { igUserId, publicBaseUrl } = settings.instagram;
  if (!igUserId) throw new Error("Falta la cuenta IG (igUserId). Reconectá Instagram.");
  if (!publicBaseUrl) {
    throw new Error(
      "Falta la URL pública. Instagram baja el video desde una URL HTTPS accesible (un túnel " +
        "tipo Cloudflare). Configurala en Settings → Instagram (publicBaseUrl)."
    );
  }
  const videoUrl = `${publicBaseUrl}/api/videos/${encodeURIComponent(opts.videoId)}/stream?source=render`;

  // 1. Crear container
  const createBody = new URLSearchParams({
    media_type: "REELS",
    video_url: videoUrl,
    caption: opts.caption.slice(0, 2200),
    access_token: token,
  });
  const createRes = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    body: createBody,
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok || createData.error) {
    throw new Error(
      `Instagram crear container falló: ${createData?.error?.message ?? createRes.status}`
    );
  }
  const creationId = createData.id as string | undefined;
  if (!creationId) throw new Error("Instagram no devolvió creation_id.");

  // 2. Poll hasta FINISHED (IG transcodifica el video)
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const sp = new URLSearchParams({ fields: "status_code,status", access_token: token });
    const sRes = await fetch(`${GRAPH_BASE}/${creationId}?${sp.toString()}`);
    const sData = await sRes.json().catch(() => ({}));
    const code = sData?.status_code;
    if (code === "FINISHED") break;
    if (code === "ERROR") {
      throw new Error(`Instagram procesamiento falló: ${sData?.status ?? "ERROR"}`);
    }
    if (attempt === POLL_MAX_ATTEMPTS - 1) {
      throw new Error("Instagram: el video no terminó de procesar a tiempo.");
    }
  }

  // 3. Publicar
  const pubBody = new URLSearchParams({ creation_id: creationId, access_token: token });
  const pubRes = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    body: pubBody,
  });
  const pubData = await pubRes.json().catch(() => ({}));
  if (!pubRes.ok || pubData.error) {
    throw new Error(`Instagram publish falló: ${pubData?.error?.message ?? pubRes.status}`);
  }
  return { mediaId: (pubData.id as string) ?? "" };
}

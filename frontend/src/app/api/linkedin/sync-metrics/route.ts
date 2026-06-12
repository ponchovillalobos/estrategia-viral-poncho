import { NextResponse } from "next/server";
import { getValidLinkedInAccessToken, fetchMemberPostMetric } from "@/lib/linkedin-client";
import { listEntries, updateEntry } from "@/lib/metrics-store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Sincroniza métricas REALES de LinkedIn (impresiones, reacciones, comentarios, reposts)
 * para cada post publicado desde la app (entries de métricas con `postUrn`).
 *
 * Usa la Member Post Analytics API (`memberCreatorPostAnalytics`). Requiere que el token
 * tenga el scope `r_member_postAnalytics` — es decir, que hayas habilitado analytics en
 * Settings → LinkedIn, reconectado, y que LinkedIn haya APROBADO tu app para esa API.
 * Si no, las llamadas devuelven null (403) y se reporta el error.
 */
export async function POST() {
  try {
    const token = await getValidLinkedInAccessToken();
    if (!token) {
      return NextResponse.json(
        { error: "No hay token de LinkedIn válido. Conecta la cuenta en /setup/linkedin." },
        { status: 400 }
      );
    }

    const entries = await listEntries();
    const targets = entries.filter((e) => e.platform === "linkedin" && e.postUrn);
    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        synced: 0,
        message: "No hay posts de LinkedIn registrados todavía. Publica un video y vuelve a sincronizar.",
      });
    }

    let synced = 0;
    let failed = 0;
    for (const e of targets) {
      const urn = e.postUrn!;
      const [impressions, reactions, comments, reshares] = await Promise.all([
        fetchMemberPostMetric(token, urn, "IMPRESSION"),
        fetchMemberPostMetric(token, urn, "REACTION"),
        fetchMemberPostMetric(token, urn, "COMMENT"),
        fetchMemberPostMetric(token, urn, "RESHARE"),
      ]);
      // Si TODAS dieron null, probablemente la app no tiene acceso a la API (403).
      if (impressions === null && reactions === null && comments === null && reshares === null) {
        failed++;
        continue;
      }
      await updateEntry(e.id, {
        views: impressions ?? e.views,
        likes: reactions ?? e.likes,
        comments: comments ?? e.comments,
        shares: reshares ?? e.shares,
      });
      synced++;
    }

    if (synced === 0 && failed > 0) {
      return NextResponse.json(
        {
          error:
            "LinkedIn rechazó las consultas de analytics (403). Probable: tu app no está aprobada " +
            "para la Member Post Analytics API, o el token no tiene el scope r_member_postAnalytics. " +
            "Habilitá analytics en /setup/linkedin y reconectá una vez aprobada tu app.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true, synced, failed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

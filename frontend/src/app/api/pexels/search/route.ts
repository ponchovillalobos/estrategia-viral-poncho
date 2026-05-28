import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PEXELS_BASE = "https://api.pexels.com";

export async function GET(req: NextRequest) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "PEXELS_API_KEY no configurado en .env.local" },
      { status: 500 }
    );
  }

  const query = req.nextUrl.searchParams.get("q");
  const type = req.nextUrl.searchParams.get("type") ?? "videos";
  const perPage = req.nextUrl.searchParams.get("per_page") ?? "12";
  const orientation = req.nextUrl.searchParams.get("orientation") ?? "portrait";

  if (!query) {
    return NextResponse.json({ error: "q required" }, { status: 400 });
  }

  const endpoint =
    type === "photos"
      ? `${PEXELS_BASE}/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${orientation}`
      : `${PEXELS_BASE}/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${orientation}`;

  try {
    const res = await fetch(endpoint, {
      headers: { Authorization: key },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `pexels error ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

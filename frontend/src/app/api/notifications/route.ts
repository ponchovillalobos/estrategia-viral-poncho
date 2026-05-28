import { NextRequest, NextResponse } from "next/server";
import {
  ackAllNotifications,
  ackNotification,
  listAllNotifications,
  listPendingNotifications,
} from "@/lib/notifications-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const all = url.searchParams.get("all");
  const items = all ? await listAllNotifications() : await listPendingNotifications();
  return NextResponse.json({ notifications: items });
}

interface AckBody {
  id?: string;
  all?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AckBody;
    if (body.all) {
      const count = await ackAllNotifications();
      return NextResponse.json({ ok: true, acked: count });
    }
    if (body.id) {
      const ok = await ackNotification(body.id);
      return NextResponse.json({ ok });
    }
    return NextResponse.json({ error: "id o all requerido" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

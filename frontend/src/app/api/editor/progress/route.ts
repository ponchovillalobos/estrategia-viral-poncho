import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId requerido" }, { status: 400 });
  }
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "job no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ job });
}

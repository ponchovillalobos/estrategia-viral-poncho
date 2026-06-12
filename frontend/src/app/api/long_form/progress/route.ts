import { NextRequest, NextResponse } from "next/server";
import { getLongFormJob, listLongFormJobs } from "@/lib/long-form-job-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (jobId) {
    const job = getLongFormJob(jobId);
    if (!job) return NextResponse.json({ error: "proceso no encontrado" }, { status: 404 });
    return NextResponse.json(job);
  }
  // Sin jobId → lista de todos los jobs activos
  return NextResponse.json({ jobs: listLongFormJobs() });
}

/**
 * Helpers de paths long-form. Reutiliza LF_ROOT/LF_RAW/LF_CLIPS/LF_PROPOSALS de paths.ts
 * y agrega LF_PROJECTS_DIR (que no se exporta en paths.ts pero se usa en varios endpoints).
 */
import path from "node:path";
import { LF_ROOT } from "@/lib/paths";

export const LF_TRANSCRIPTS = path.join(LF_ROOT, "transcripts");
export const LF_CUTS = path.join(LF_ROOT, "cuts");
export const LF_PROPOSALS = path.join(LF_ROOT, "proposals");
export const LF_PROJECTS_DIR = path.join(LF_ROOT, "projects");

/**
 * Estado en memoria del batch de adaptación de guiones.
 *
 * Sobrevive a HMR vía globalThis.
 * Solo uno activo a la vez (Claude CLI serial).
 */

export interface AdaptBatchProgress {
  /** ID estable del batch (epoch ms al arrancar) */
  batchId: string;
  /** Items a procesar */
  total: number;
  /** Items completados (con éxito o fallo) */
  done: number;
  /** Items que tuvieron éxito */
  success: number;
  /** Items que fallaron */
  failed: number;
  /** Item actualmente procesando (id del ResearchItem) */
  currentItemId: string | null;
  /** Status global */
  status: "running" | "done" | "failed";
  startedAt: number;
  finishedAt?: number;
  /** Últimos errores (para mostrar al usuario) */
  errors: { itemId: string; error: string }[];
}

declare global {
  // eslint-disable-next-line no-var
  var __viral_adapt_batch__: AdaptBatchProgress | null | undefined;
}

export function getBatch(): AdaptBatchProgress | null {
  return globalThis.__viral_adapt_batch__ ?? null;
}

export function setBatch(b: AdaptBatchProgress | null): void {
  globalThis.__viral_adapt_batch__ = b;
}

export function isBatchActive(): boolean {
  const b = getBatch();
  return b !== null && b.status === "running";
}

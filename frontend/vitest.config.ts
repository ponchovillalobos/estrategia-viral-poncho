import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest config para que el alias `@/` (definido en tsconfig.json paths) funcione
// dentro de los tests. Sin esto, `import { foo } from "@/lib/x"` falla en runtime
// porque vitest no lee tsconfig paths automáticamente.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});

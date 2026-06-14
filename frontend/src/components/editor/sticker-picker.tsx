"use client";

/**
 * GALERÍA DE STICKERS (Ola 1 — el diferenciador): destapa la biblioteca FANTASMA
 * de 6.605 iconos SVG (Phosphor + Tabler) + 609 ilustraciones Lottie (Noto), que
 * antes el usuario sólo "elegía" de un puñado curado.
 *
 * Cómo evita traer TODO de golpe (clave del rendimiento con 6.6k assets):
 *   1. /api/stickers/list devuelve sólo METADATA (id/name/category/tags/url) — el
 *      contenido pesado (SVG markup, JSON Lottie) NO viaja en esa respuesta.
 *   2. Grid VIRTUALIZADO (react-window v2): sólo se montan las celdas visibles
 *      (~30) de las miles que hay; el resto no existe en el DOM.
 *   3. SVG on-demand: cada celda visible carga su SVG con <img src> (lazy + cache
 *      del browser). Nunca se bajan 6.605 SVGs a la vez.
 *   4. Lottie SÓLO en hover: la celda muestra el preview estático del frame 0 (un
 *      <img> del JSON sería pesado, así que mostramos un placeholder) y recién al
 *      pasar el mouse hace fetch del JSON y lo anima. Nunca se traen 609 JSON juntos.
 *   5. Búsqueda fuzzy con Fuse.js OFFLINE (sin red, sin API key) sobre la metadata.
 *
 * Al hacer click, empuja el sticker a project.iconStickers con el shape que el
 * render consume (IconSticker): los SVG usan icon="ph:<n>"/"tb:<n>" (el build
 * embebe el markup), los Lottie usan lottieSrc=<url del stream>.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import { Grid, type CellComponentProps } from "react-window";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Sparkles } from "lucide-react";

// ── Shape que el render consume (subset de IconSticker de remotion/src/schemas.ts).
//    `at` lo fija el padre al insertar (currentTime); el resto trae defaults sanos.
export interface IconStickerInput {
  at: number;
  duration: number;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-center";
  size: number;
  color: string;
  bg: string;
  /** Para iconos SVG: "ph:<n>"/"tb:<n>" (el build embebe el SVG). "" para Lottie. */
  icon: string;
  /** Para ilustraciones Lottie: URL del /api/lottie/stream. "" para iconos. */
  lottieSrc: string;
  fullscreen: boolean;
  label: string;
}

interface StickerEntry {
  id: string;
  type: "icon" | "lottie";
  name: string;
  category: string;
  tags: string[];
  url: string;
}

interface ListResponse {
  stickers: StickerEntry[];
  categories: string[];
  counts: { icons: number; lottie: number };
  total: number;
}

interface Props {
  /** Empuja el sticker elegido al project (el padre hace updateProject). */
  onAdd: (sticker: IconStickerInput) => void;
  /** Momento actual del video — se usa como `at` del sticker insertado. */
  currentTime: number;
  /** Cuántos icon-stickers ya tiene el proyecto (para feedback). */
  selectedCount?: number;
}

const COLUMN_MIN = 88; // px por celda (icono + nombre)
const ROW_HEIGHT = 104;

export function StickerPicker({ onAdd, currentTime, selectedCount = 0 }: Props) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "icon" | "lottie">("all");
  const [gridWidth, setGridWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stickers/list")
      .then((r) => r.json())
      .then((d: ListResponse) => {
        if (cancelled) return;
        if (!d.stickers) throw new Error("sin stickers");
        setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "no se pudo cargar la galería");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Medir el ancho del contenedor para calcular columnas (responsive sin re-render loop).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setGridWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  // Índice Fuse.js — se reconstruye sólo cuando llegan los datos (no por keystroke).
  const fuse = useMemo(() => {
    if (!data) return null;
    return new Fuse(data.stickers, {
      keys: [
        { name: "name", weight: 2 },
        { name: "tags", weight: 3 },
        { name: "category", weight: 1 },
      ],
      threshold: 0.38,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }, [data]);

  // Lista filtrada: búsqueda (Fuse) → tipo → categoría. Todo en memoria, sin red.
  const filtered = useMemo(() => {
    if (!data) return [];
    let base: StickerEntry[] =
      query.trim().length >= 2 && fuse
        ? fuse.search(query.trim()).map((r) => r.item)
        : data.stickers;
    if (typeFilter !== "all") base = base.filter((s) => s.type === typeFilter);
    if (activeCat) base = base.filter((s) => s.category === activeCat);
    return base;
  }, [data, fuse, query, typeFilter, activeCat]);

  const columnCount = Math.max(1, Math.floor((gridWidth || 1) / COLUMN_MIN) || 1);
  const rowCount = Math.ceil(filtered.length / columnCount);
  const columnWidth = gridWidth > 0 ? Math.floor(gridWidth / columnCount) : COLUMN_MIN;

  const handlePick = useCallback(
    (s: StickerEntry) => {
      const base: IconStickerInput = {
        at: Math.round(currentTime * 10) / 10,
        duration: 2,
        position: "top-right",
        size: 120,
        color: "#0a0a0a",
        bg: "#fbbf24",
        icon: "",
        lottieSrc: "",
        fullscreen: false,
        label: "",
      };
      if (s.type === "lottie") {
        onAdd({ ...base, lottieSrc: s.url });
      } else {
        // s.id ya viene como "ph:<n>"/"tb:<n>" — el build embebe el SVG.
        onAdd({ ...base, icon: s.id });
      }
    },
    [currentTime, onAdd]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando la galería de stickers…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/50 p-4 text-xs text-muted-foreground">
        No se pudo cargar la galería. {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* PRUEBA DE VALOR: los conteos reales de la biblioteca destapada. */}
      <div className="flex items-center gap-2 text-xs">
        <Sparkles className="h-4 w-4 text-amber-400" />
        <span className="font-medium">
          {data.counts.icons.toLocaleString("es-MX")} iconos ·{" "}
          {data.counts.lottie.toLocaleString("es-MX")} animaciones
        </span>
        {selectedCount > 0 && (
          <span className="text-muted-foreground">· {selectedCount} en este video</span>
        )}
      </div>

      {/* Buscador en español (Fuse.js offline). */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar: dinero, fuego, cohete, corazón…"
          className="pl-8"
          aria-label="Buscar stickers"
        />
      </div>

      {/* Filtro de tipo. */}
      <div className="flex gap-1.5">
        {([
          ["all", "Todos"],
          ["icon", "Iconos"],
          ["lottie", "Animados"],
        ] as const).map(([val, lbl]) => (
          <button
            key={val}
            type="button"
            onClick={() => setTypeFilter(val)}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              typeFilter === val
                ? "border-foreground/40 bg-muted text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* Chips de categoría. */}
      <div className="flex max-h-16 flex-wrap gap-1.5 overflow-y-auto">
        <CategoryChip label="Todas" active={activeCat === null} onClick={() => setActiveCat(null)} />
        {data.categories.map((c) => (
          <CategoryChip
            key={c}
            label={c}
            active={activeCat === c}
            onClick={() => setActiveCat(activeCat === c ? null : c)}
          />
        ))}
      </div>

      <Label className="text-[10px] text-muted-foreground">
        {filtered.length.toLocaleString("es-MX")} resultados · clic para agregar en{" "}
        {currentTime.toFixed(1)}s
      </Label>

      {/* Grid VIRTUALIZADO: sólo se montan las celdas visibles. */}
      <div ref={containerRef} className="h-[360px] w-full overflow-hidden rounded-md border border-border">
        {gridWidth > 0 && filtered.length > 0 ? (
          <Grid
            cellComponent={Cell}
            cellProps={{ items: filtered, columnCount, onPick: handlePick }}
            columnCount={columnCount}
            columnWidth={columnWidth}
            rowCount={rowCount}
            rowHeight={ROW_HEIGHT}
            overscanCount={2}
            style={{ height: 360, width: gridWidth }}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
            Sin resultados para «{query}».
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] ${
        active
          ? "border-brand-pink/50 bg-brand-pink/15 text-brand-pink"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

// ── Props que cada celda recibe vía cellProps (react-window v2). ──
interface CellProps {
  items: StickerEntry[];
  columnCount: number;
  onPick: (s: StickerEntry) => void;
}

function Cell({ columnIndex, rowIndex, style, items, columnCount, onPick }: CellComponentProps<CellProps>) {
  const index = rowIndex * columnCount + columnIndex;
  const item = items[index];
  if (!item) return <div style={style} />;
  return (
    <div style={style} className="p-1">
      <StickerCell item={item} onPick={onPick} />
    </div>
  );
}

/** Celda individual: SVG vía <img> on-demand; Lottie animado SÓLO en hover. */
function StickerCell({ item, onPick }: { item: StickerEntry; onPick: (s: StickerEntry) => void }) {
  const [hover, setHover] = useState(false);
  const [lottieData, setLottieData] = useState<object | null>(null);
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);

  // Lottie: traer el JSON SÓLO al primer hover (nunca al montar). Una vez bajado,
  // queda cacheado en el estado de la celda para hovers siguientes.
  useEffect(() => {
    if (item.type !== "lottie" || !hover || lottieData) return;
    let cancelled = false;
    fetch(item.url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setLottieData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hover, item.type, item.url, lottieData]);

  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${item.name} · ${item.category}`}
      className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-md border border-transparent bg-card/40 p-1.5 transition hover:border-brand-pink/40 hover:bg-muted"
    >
      <div className="flex h-12 w-12 items-center justify-center">
        {item.type === "lottie" ? (
          hover && lottieData ? (
            <Lottie
              lottieRef={lottieRef}
              animationData={lottieData}
              loop
              autoplay
              style={{ width: 48, height: 48 }}
            />
          ) : (
            // Placeholder estático hasta el hover — evita bajar 609 JSON de golpe.
            <span className="text-2xl" aria-hidden>
              ✨
            </span>
          )
        ) : (
          // Iconos SVG: <img> lazy → el browser sólo pide los visibles y los cachea.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.name}
            loading="lazy"
            width={40}
            height={40}
            className="h-10 w-10 object-contain opacity-80 [filter:invert(0.85)]"
          />
        )}
      </div>
      <span className="line-clamp-1 w-full text-center text-[9px] leading-tight text-muted-foreground">
        {item.name}
      </span>
    </button>
  );
}

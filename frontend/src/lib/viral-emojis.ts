/**
 * Pool curado de emojis para contenido viral en TikTok / IG / LinkedIn.
 *
 * Criterio de selección:
 *  - Renderizan bien a 200px (los compuestos como 👨‍💻 a veces no en algunas fuentes).
 *  - Comunican emoción / concepto fuerte para hook viral.
 *  - Cubren ~12 categorías (fuego, caras, dinero, tech, manos, etc.) para variedad real.
 *
 * Selección por video: hash determinístico del videoId → siempre el mismo set para
 * el mismo video (re-render reproducible), pero distinto entre videos.
 */

export const VIRAL_EMOJIS_BY_CATEGORY = {
  fire_hype: [
    "🔥", "💥", "⚡", "🌟", "✨", "💫", "🚀", "💯", "💢", "🆙",
    "🎆", "🎇", "☄️", "♨️", "💨", "‼️", "⭐",
  ],
  faces_reaction: [
    "😱", "🤯", "😮", "🤩", "😎", "🥶", "🤑", "😤", "🥲", "😏",
    "😳", "😬", "🫨", "🥹", "😭", "🤔", "🙄", "😩", "😵", "😍",
    "🤤", "🤐", "🤫", "🤨", "😈", "🤠", "🥸", "🫠", "🫡", "🤪",
  ],
  money_business: [
    "💰", "💵", "💸", "💳", "📈", "📉", "📊", "🏆", "🥇", "🪙",
    "💎", "💼", "🏦", "📦", "🧾", "💹", "🎰",
  ],
  tech_ai: [
    "💻", "🖥️", "📱", "🤖", "🧠", "⚙️", "🛠️", "🔌", "🔋", "📡",
    "🛰️", "🎛️", "⌚", "🖲️", "💾",
  ],
  hands_gestures: [
    "👀", "👆", "👇", "👈", "👉", "👌", "👍", "👎", "👏", "🙌",
    "👋", "🤝", "💪", "🫵", "🤙", "✊", "🤌", "🫶", "☝️", "🤞",
    "🤟", "✌️", "🤘",
  ],
  hearts_love: [
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💗",
    "💓", "💞", "❤️‍🔥", "💔", "💘", "💝", "💌",
  ],
  symbols_action: [
    "💡", "💭", "💬", "🗨️", "📢", "📣", "🔔", "🔊", "🎯", "🎬",
    "🎤", "🎵", "🎉", "🎊", "🎁", "🏅", "🎖️", "🪄",
  ],
  warning_alert: [
    "⚠️", "❌", "🚫", "⛔", "🛑", "⁉️", "❗", "❓", "🚨", "🆘",
  ],
  objects_signals: [
    "📌", "📍", "🎲", "🔑", "🗝️", "🔐", "🔒", "🏁", "🎓", "📚",
    "📖", "📰", "🗞️", "✂️", "📎",
  ],
  nature_aesthetic: [
    "🌈", "☀️", "🌙", "🌠", "❄️", "💧", "🌊", "🍀", "🌹", "🌻",
    "🌸", "🌴", "🌵", "🌎", "🌍", "🌌",
  ],
  food_viral: [
    "🍕", "🍔", "🌮", "🍿", "🍩", "🍪", "🍰", "🎂", "☕", "🧋",
    "🍷", "🥂", "🍾",
  ],
  sport_dynamic: [
    "🏀", "⚽", "🏈", "⚾", "🎾", "🥊", "🏋️", "🤸", "🏇", "🏎️",
    "🚴", "🥋", "🎳",
  ],
} as const;

// Flat pool (de-dup automático en runtime con Set)
export const VIRAL_EMOJIS_FLAT: string[] = Array.from(
  new Set(Object.values(VIRAL_EMOJIS_BY_CATEGORY).flat())
);

/** Hash determinístico de un string (variante FNV-1a-like, OK para shuffle seed). */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** PRNG lineal seeded; misma seed → misma secuencia. */
function seededRng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Devuelve N emojis únicos para un video. La selección es:
 *  - Determinística (mismo seed → mismo set, para re-renders).
 *  - Variada (mezcla categorías, no se queda en una sola).
 *  - Diferente entre videos (hash del seed cambia con el videoId).
 *
 * @param seed  Cadena para sembrar (típico: `${videoId}:${kind}` donde kind = "stickers"/"floating").
 * @param count Cuántos emojis devolver.
 */
export function pickEmojis(seed: string, count: number): string[] {
  const rng = seededRng(hashString(seed));
  // Fisher-Yates parcial: paro cuando llené `count` desde una copia barajada.
  const pool = VIRAL_EMOJIS_FLAT.slice();
  const last = Math.max(0, pool.length - count);
  for (let i = pool.length - 1; i >= last; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(last).reverse();
}

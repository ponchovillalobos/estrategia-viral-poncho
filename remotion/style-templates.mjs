/**
 * Copia JS de frontend/src/lib/style-templates.ts y viral-emojis.ts.
 *
 * Por qué duplicar: Remotion corre en Node puro y no compila TS in-line.
 * Si en el futuro extraemos esto a un workspace compartido vía pnpm/turbo,
 * unificamos. Por ahora la duplicación es controlada y se documenta.
 *
 * **NUNCA editar este archivo sin actualizar la versión TS también** — son
 * la misma lógica. Tests E2E verifican que ambas producen output equivalente.
 */

// ─── viral-emojis (port) ──────────────────────────────────────────────────

const VIRAL_EMOJIS_BY_CATEGORY = {
  fire_hype: ["🔥", "💥", "⚡", "🌟", "✨", "💫", "🚀", "💯", "💢", "🆙", "🎆", "🎇", "☄️", "♨️", "💨", "‼️", "⭐"],
  faces_reaction: ["😱", "🤯", "😮", "🤩", "😎", "🥶", "🤑", "😤", "🥲", "😏", "😳", "😬", "🫨", "🥹", "😭", "🤔", "🙄", "😩", "😵", "😍", "🤤", "🤐", "🤫", "🤨", "😈", "🤠", "🥸", "🫠", "🫡", "🤪"],
  money_business: ["💰", "💵", "💸", "💳", "📈", "📉", "📊", "🏆", "🥇", "🪙", "💎", "💼", "🏦", "📦", "🧾", "💹", "🎰"],
  tech_ai: ["💻", "🖥️", "📱", "🤖", "🧠", "⚙️", "🛠️", "🔌", "🔋", "📡", "🛰️", "🎛️", "⌚", "🖲️", "💾"],
  hands_gestures: ["👀", "👆", "👇", "👈", "👉", "👌", "👍", "👎", "👏", "🙌", "👋", "🤝", "💪", "🫵", "🤙", "✊", "🤌", "🫶", "☝️", "🤞", "🤟", "✌️", "🤘"],
  hearts_love: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💗", "💓", "💞", "❤️‍🔥", "💔", "💘", "💝", "💌"],
  symbols_action: ["💡", "💭", "💬", "🗨️", "📢", "📣", "🔔", "🔊", "🎯", "🎬", "🎤", "🎵", "🎉", "🎊", "🎁", "🏅", "🎖️", "🪄"],
  warning_alert: ["⚠️", "❌", "🚫", "⛔", "🛑", "⁉️", "❗", "❓", "🚨", "🆘"],
  objects_signals: ["📌", "📍", "🎲", "🔑", "🗝️", "🔐", "🔒", "🏁", "🎓", "📚", "📖", "📰", "🗞️", "✂️", "📎"],
  nature_aesthetic: ["🌈", "☀️", "🌙", "🌠", "❄️", "💧", "🌊", "🍀", "🌹", "🌻", "🌸", "🌴", "🌵", "🌎", "🌍", "🌌"],
  food_viral: ["🍕", "🍔", "🌮", "🍿", "🍩", "🍪", "🍰", "🎂", "☕", "🧋", "🍷", "🥂", "🍾"],
  sport_dynamic: ["🏀", "⚽", "🏈", "⚾", "🎾", "🥊", "🏋️", "🤸", "🏇", "🏎️", "🚴", "🥋", "🎳"],
};

const VIRAL_EMOJIS_FLAT = Array.from(
  new Set(Object.values(VIRAL_EMOJIS_BY_CATEGORY).flat())
);

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRng(seed) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function pickEmojis(seed, count) {
  const rng = seededRng(hashString(seed));
  const pool = VIRAL_EMOJIS_FLAT.slice();
  const last = Math.max(0, pool.length - count);
  for (let i = pool.length - 1; i >= last; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(last).reverse();
}

// ─── style-templates (port) ───────────────────────────────────────────────

const SFX_POOL = ["swoosh.wav", "water_drop.ogg", "pop.ogg", "ding.ogg", "bloop.ogg", "notification.ogg", "thud.wav", "swoosh_quick.wav", "ding_bell.ogg"];

function pickKeywords(ctx, count) {
  return ctx.keywords.slice(0, count);
}

function buildStickers(ctx, count) {
  const emojis = pickEmojis(`${ctx.videoId}:stickers`, count);
  return pickKeywords(ctx, count).map((kw, i) => ({
    at: kw.start,
    duration: 1.5,
    word: kw.word.toUpperCase().replace(/[.,;:!?¿¡]/g, "").slice(0, 24),
    emoji: emojis[i] ?? "✨",
    position: "top-center",
    rotation: 0,
    bg: ctx.accentColor,
    color: "#0a0a0a",
  }));
}

function buildFloatingEmojis(ctx, count) {
  const emojis = pickEmojis(`${ctx.videoId}:floating`, count);
  const result = [];
  for (let i = 0; i < count; i++) {
    const at = ((i + 0.5) * ctx.duration) / count;
    result.push({
      at: +at.toFixed(2),
      duration: 1.3,
      emoji: emojis[i] ?? "✨",
      from: i % 2 === 0 ? "left" : "right",
      size: 220,
      yOffset: 0,
    });
  }
  return result;
}

function buildEmphasisCards(ctx) {
  const first = ctx.keywords[0];
  const mid = ctx.keywords[Math.floor(ctx.keywords.length / 2)];
  const hookWord = first ? first.word.toUpperCase().slice(0, 16) : "ATENCION";
  const midWord = mid ? mid.word.toUpperCase().slice(0, 16) : "CLAVE";
  const [eHook, eMid, eSave] = pickEmojis(`${ctx.videoId}:emphasis`, 3);
  return [
    { at: 0.4, duration: 1.2, word: hookWord, emoji: eHook ?? "🔥", bg: "#0a0a0a", color: "#ffffff", accent: ctx.accentColor },
    { at: Math.max(2, ctx.duration * 0.5), duration: 1.2, word: midWord, emoji: eMid ?? "💡", bg: "#0a0a0a", color: "#ffffff", accent: ctx.accentColor },
    { at: Math.max(ctx.duration - 2.5, ctx.duration - 3), duration: 1.5, word: "GUARDALO", emoji: eSave ?? "📌", bg: "#0a0a0a", color: "#ffffff", accent: ctx.accentColor },
  ];
}

function commonBase(ctx, styleId) {
  return {
    id: `${ctx.videoId}_${styleId}`,
    videoId: ctx.videoId,
    day: ctx.day ?? null,
    platforms: ctx.platforms ?? ["tiktok", "instagram"],
    styleId,
    accentColor: ctx.accentColor,
    caption: ctx.caption ?? "",
    status: "borrador",
    subtitleColor: "#ffffff",
    subtitleHighlight: ctx.accentColor,
    musicTrack: null,
    musicVolume: 0.15,
    colorRotation: [],
    bRoll: [],
    animations: [],
    emphasisCards: [],
    wordStickers: [],
    floatingEmojis: [],
    zoomMarks: [],
    reactionZooms: [],
    stutterMarks: [],
    sfxMarks: [],
    manualSubtitles: [],
    captionBounce: false,
    enableJumpCuts: false,
    bRollMode: "fullscreen",
    vignette: false,
    subtitleStyle: "bebas",
    width: ctx.width ?? 1080,
    height: ctx.height ?? 1920,
  };
}

function buildSupremeStyle(ctx, styleId) {
  const base = commonBase(ctx, styleId);
  const stickerEmojis = pickEmojis(`${ctx.videoId}:supreme:stickers`, 6);
  const sideEmojis = pickEmojis(`${ctx.videoId}:supreme:floating`, 4);

  const stickers = [];
  const keywordList = pickKeywords(ctx, 6);
  for (let i = 0; i < keywordList.length; i++) {
    const kw = keywordList[i];
    if (kw.start > 0.5 && kw.start < ctx.duration - 2) {
      stickers.push({
        at: +kw.start.toFixed(2),
        duration: 1.5,
        word: kw.word.toUpperCase().replace(/[.,;:!?¿¡]/g, "").slice(0, 24),
        emoji: stickerEmojis[i] ?? "✨",
        position: "top-center",
        rotation: 0,
        bg: ctx.accentColor,
        color: "#0a0a0a",
      });
    }
  }
  stickers.sort((a, b) => a.at - b.at);

  const hookSource = ctx.hookOverride ?? ctx.keywords[0]?.word ?? "MIRA ESTO";
  const themeSource = ctx.themeOverride ?? ctx.keywords[Math.floor(ctx.keywords.length / 2)]?.word ?? hookSource;
  const hookText = String(hookSource).replace(/[^\w áéíóúñÁÉÍÓÚÑ]/g, "").trim().slice(0, 24).toUpperCase();
  const themeText = String(themeSource).replace(/[^\w áéíóúñÁÉÍÓÚÑ]/g, "").trim().slice(0, 22).toUpperCase();

  const emphasisCards = [
    { at: 0.4, duration: 1.2, word: hookText.split(" ").slice(0, 3).join(" ") || "ATENCION", emoji: "🔥", bg: "#0a0a0a", color: "#ffffff", accent: ctx.accentColor },
    { at: Math.max(2, ctx.duration * 0.5 - 0.5), duration: 1.2, word: themeText.split(" ").slice(0, 3).join(" ") || "INSIGHT", emoji: "💡", bg: "#0a0a0a", color: "#ffffff", accent: ctx.accentColor },
  ];
  if (ctx.duration > 25) {
    emphasisCards.push({ at: Math.max(ctx.duration - 2.5, ctx.duration - 3), duration: 1.6, word: "GUARDALO", emoji: "📌", bg: "#0a0a0a", color: "#ffffff", accent: ctx.accentColor });
  }

  const emojiCount = ctx.duration > 40 ? 4 : 3;
  const floatingEmojis = [];
  for (let i = 0; i < emojiCount; i++) {
    const at = ((i + 0.5) * ctx.duration) / emojiCount;
    const tooClose = stickers.some((s) => Math.abs(s.at - at) < 1.0);
    if (tooClose) continue;
    floatingEmojis.push({
      at: +at.toFixed(2),
      duration: 1.3,
      emoji: sideEmojis[i] ?? "✨",
      from: i % 2 === 0 ? "left" : "right",
      size: 220,
      yOffset: 0,
    });
  }

  const zoomMarks = stickers.slice(0, 5).map((s) => ({ at: s.at, duration: 0.6, scale: 1.14 }));
  zoomMarks.unshift({ at: 0.3, duration: 0.7, scale: 1.18 });

  const reactionZooms = emphasisCards.map((e) => ({ at: +(e.at + 0.05).toFixed(2), intensity: 1.42, duration: 0.22 }));

  const stutterMarks = [];
  if (emphasisCards[1]) stutterMarks.push({ at: +(emphasisCards[1].at - 0.2).toFixed(2), duration: 0.18 });
  if (emphasisCards[2]) stutterMarks.push({ at: +(emphasisCards[2].at - 0.2).toFixed(2), duration: 0.18 });

  const sfxMarks = [];
  sfxMarks.push({ at: 0.3, sound: "swoosh.wav", volume: 0.35 });
  emphasisCards.forEach((e, i) => {
    sfxMarks.push({
      at: +(e.at + 0.05).toFixed(2),
      sound: i === 0 ? "pop.ogg" : i === 1 ? "ding.ogg" : "notification.ogg",
      volume: 0.45,
    });
  });
  stickers.forEach((s, i) => {
    if (i % 2 === 0 && !sfxMarks.some((x) => Math.abs(x.at - s.at) < 0.3)) {
      sfxMarks.push({ at: s.at, sound: SFX_POOL[(i + 2) % SFX_POOL.length], volume: 0.35 });
    }
  });
  sfxMarks.sort((a, b) => a.at - b.at);

  return {
    ...base,
    subtitleStyle: "anton",
    bRollMode: "pip",
    vignette: true,
    captionBounce: true,
    enableJumpCuts: false,
    wordStickers: stickers,
    floatingEmojis,
    zoomMarks,
    reactionZooms,
    stutterMarks,
    emphasisCards,
    sfxMarks,
  };
}

export function buildProjectForStyle(ctx, styleId) {
  const base = commonBase(ctx, styleId);

  if (styleId === "silent") {
    return {
      ...base,
      subtitleStyle: "bebas",
      animations: ctx.keywords.slice(0, 3).map((kw, i) => ({
        at: kw.start,
        type: i === 0 ? "zoom" : i === 1 ? "glow" : "shake",
      })),
    };
  }
  if (styleId === "punch") {
    return { ...base, subtitleStyle: "bebas", emphasisCards: buildEmphasisCards(ctx) };
  }
  if (styleId === "hype") {
    return {
      ...base,
      subtitleStyle: "anton",
      bRollMode: "pip",
      vignette: true,
      wordStickers: buildStickers(ctx, 6),
      floatingEmojis: buildFloatingEmojis(ctx, 4),
      zoomMarks: pickKeywords(ctx, 5).map((kw) => ({ at: kw.start, duration: 0.6, scale: 1.14 })),
    };
  }
  if (styleId === "hype_max") {
    const stickers = buildStickers(ctx, 6);
    return {
      ...base,
      subtitleStyle: "anton",
      bRollMode: "pip",
      vignette: true,
      captionBounce: true,
      enableJumpCuts: true,
      wordStickers: stickers,
      floatingEmojis: buildFloatingEmojis(ctx, 4),
      zoomMarks: pickKeywords(ctx, 5).map((kw) => ({ at: kw.start, duration: 0.6, scale: 1.14 })),
      reactionZooms: pickKeywords(ctx, 3).slice(-3).map((kw) => ({ at: kw.start, intensity: 1.42, duration: 0.22 })),
      stutterMarks: pickKeywords(ctx, 2).map((kw) => ({ at: Math.max(0, kw.start - 0.15), duration: 0.18 })),
    };
  }
  if (styleId === "hype_max_sfx") {
    const stickers = buildStickers(ctx, 6);
    const sfxMarks = stickers.slice(0, 6).map((s, i) => ({ at: s.at, sound: SFX_POOL[i % SFX_POOL.length], volume: 0.4 }));
    sfxMarks.unshift({ at: 0.3, sound: "swoosh.wav", volume: 0.35 });
    return {
      ...base,
      subtitleStyle: "anton",
      bRollMode: "pip",
      vignette: true,
      captionBounce: true,
      enableJumpCuts: true,
      wordStickers: stickers,
      floatingEmojis: buildFloatingEmojis(ctx, 4),
      zoomMarks: pickKeywords(ctx, 5).map((kw) => ({ at: kw.start, duration: 0.6, scale: 1.14 })),
      reactionZooms: pickKeywords(ctx, 3).slice(-3).map((kw) => ({ at: kw.start, intensity: 1.42, duration: 0.22 })),
      stutterMarks: pickKeywords(ctx, 2).map((kw) => ({ at: Math.max(0, kw.start - 0.15), duration: 0.18 })),
      sfxMarks,
    };
  }
  if (styleId === "supreme") {
    return buildSupremeStyle(ctx, styleId);
  }
  return base;
}

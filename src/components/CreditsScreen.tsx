"use client";

// End-of-game UNHINGED celebration sequence:
//   Phase 1: CELEBRATION  — confetti rain, massive title, party sounds
//   Phase 2: SHOTS DECREE — "SHOTS ZA SVE" flashing, mandatory shot for everyone
//   Phase 3: CREDITS ROLL — auto-scrolling stats / achievements / podium / ranking
//
// Used by both host (TV) and local pages.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { spriteUrl, FALLBACK_SPRITE } from "@/lib/fighters";
import { formatDrinks, getDrunkComment } from "@/lib/cards";

export interface CreditsPlayer {
  id: string;
  name: string;
  fighter_id: string;
  is_groom: boolean;
  is_kum: boolean;
  total_sips: number;
  total_shots: number;
  mates: string[];
  chickened_out_count?: number;
}

interface Achievement {
  emoji: string;
  title: string;
  subtitle: string;
  player: CreditsPlayer;
  color: string;
}

function totalDrinkScore(p: CreditsPlayer): number {
  return p.total_sips + p.total_shots * 3;
}

function computeAchievements(players: CreditsPlayer[]): Achievement[] {
  if (players.length === 0) return [];
  const out: Achievement[] = [];

  const sortedByDrinks = [...players].sort((a, b) => totalDrinkScore(b) - totalDrinkScore(a));
  const mostDrunk = sortedByDrinks[0];
  if (totalDrinkScore(mostDrunk) > 0) {
    out.push({
      emoji: "🍺",
      title: "NAJVECI PIJANAC",
      subtitle: `${formatDrinks(mostDrunk.total_sips, mostDrunk.total_shots)} — ${getDrunkComment(mostDrunk.total_sips, mostDrunk.total_shots)}`,
      player: mostDrunk,
      color: "#DC3232",
    });
  }

  const leastDrunk = sortedByDrinks[sortedByDrinks.length - 1];
  if (leastDrunk && leastDrunk.id !== mostDrunk.id) {
    out.push({
      emoji: "🌵",
      title: "TRIJEZAN KO SUDAC",
      subtitle: totalDrinkScore(leastDrunk) === 0
        ? "Nije popio NIJEDNU. Sramota za naciju."
        : `Samo ${formatDrinks(leastDrunk.total_sips, leastDrunk.total_shots)}. Slabic.`,
      player: leastDrunk,
      color: "#28A050",
    });
  }

  const groom = players.find(p => p.is_groom);
  if (groom) {
    out.push({
      emoji: "👑",
      title: "MLADOZENJA NA KOLJENIMA",
      subtitle: totalDrinkScore(groom) > 20
        ? "Sutra ce zaliti SVE ovo. JOS VECERAS NEK ZALI."
        : "Cestitamo na zadnjoj noci slobode, druze.",
      player: groom,
      color: "#FFC828",
    });
  }

  const kum = players.find(p => p.is_kum);
  if (kum) {
    out.push({
      emoji: "🤝",
      title: "KUM I VJERNI PRATILAC",
      subtitle: "Drzao je mladozenju kad je posrnuo. Pravi covjek.",
      player: kum,
      color: "#3264B4",
    });
  }

  const sortedByMates = [...players].sort((a, b) => (b.mates?.length || 0) - (a.mates?.length || 0));
  const topMater = sortedByMates[0];
  if (topMater && (topMater.mates?.length || 0) > 0) {
    out.push({
      emoji: "💍",
      title: "DRUSTVENA ZIVOTINJA",
      subtitle: `Sklopio ${topMater.mates.length} pajdas-savez. Svi su zajedno pili. Svi su zajedno patili.`,
      player: topMater,
      color: "#B43C78",
    });
  }

  const sortedByChicken = [...players].sort((a, b) => (b.chickened_out_count || 0) - (a.chickened_out_count || 0));
  const topChicken = sortedByChicken[0];
  if (topChicken && (topChicken.chickened_out_count || 0) >= 2) {
    out.push({
      emoji: "🐔",
      title: "KUKAVICA GODINE",
      subtitle: `Pobjegao od ${topChicken.chickened_out_count} izazova. SRAMOTA OBITELJI.`,
      player: topChicken,
      color: "#FF8814",
    });
  }

  const beast = sortedByDrinks.find(p => totalDrinkScore(p) >= 30);
  if (beast && beast.id !== mostDrunk.id) {
    out.push({
      emoji: "🐉",
      title: "ZMAJ PIJANCA",
      subtitle: "Presao je sve granice ljudskog razuma. Mit. Legenda.",
      player: beast,
      color: "#7828A0",
    });
  }

  return out;
}

// ── Confetti particles — UNHINGED EMOJI EDITION ─────────────────────────
// Rains a chaotic mix of party emojis (booty, boobies, dick, beer, fire,
// money, eggplant, etc.) instead of paper rectangles. Pure party fuel.
interface EmojiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  emoji: string;
  bobPhase: number;
}

const PARTY_EMOJI = [
  "🍑", "🍑", "🍒", "🍒", "🍆", "🍆",  // booty / boobies / dick — 2x weight
  "🍺", "🍺", "🍻", "🥃", "🍷", "🍸",  // booze
  "🔥", "💦", "💋", "💃", "🕺",         // heat
  "💸", "💰", "🤑",                     // money
  "🎉", "🎊", "🥳", "🎁", "🍾",        // party
  "💍", "👰", "🤵",                    // wedding
];

// Pre-rasterize each emoji at a fixed size once, then draw via drawImage on
// the particle canvas every frame. Canvas fillText with color emojis is
// extremely slow per-frame; drawImage from a cached bitmap is ~50x faster.
function buildEmojiCache(size: number): Map<string, HTMLCanvasElement> {
  const cache = new Map<string, HTMLCanvasElement>();
  for (const e of PARTY_EMOJI) {
    if (cache.has(e)) continue;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const cx = c.getContext("2d")!;
    cx.font = `${size * 0.85}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText(e, size / 2, size / 2);
    cache.set(e, c);
  }
  return cache;
}

function ConfettiCanvas({ density = 1 }: { density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    // Render at a fixed emoji bitmap size (we scale via ctx.scale for variety)
    const EMOJI_TEX_SIZE = 64;
    const emojiCache = buildEmojiCache(EMOJI_TEX_SIZE);

    let particles: EmojiParticle[] = [];
    // Cap particle count so the animation stays smooth even on weak phones.
    const MAX_PARTICLES = Math.floor(60 * density);

    const resize = () => {
      // DPR-aware sizing keeps the canvas sharp without blowing up cost.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    const spawn = () => {
      if (particles.length >= MAX_PARTICLES) return;
      const count = Math.floor(2 * density);
      for (let i = 0; i < count; i++) {
        if (particles.length >= MAX_PARTICLES) break;
        particles.push({
          x: Math.random() * W(),
          y: -40,
          vx: (Math.random() - 0.5) * 3,
          vy: 3 + Math.random() * 4,
          rot: Math.random() * 360,
          vrot: (Math.random() - 0.5) * 10,
          size: 32 + Math.random() * 32, // 32-64px draw size
          emoji: PARTY_EMOJI[Math.floor(Math.random() * PARTY_EMOJI.length)],
          bobPhase: Math.random() * Math.PI * 2,
        });
      }
    };

    let raf = 0;
    let frame = 0;
    const tick = () => {
      ctx.clearRect(0, 0, W(), H());
      spawn();
      frame++;
      // Update + draw in a single pass
      const next: EmojiParticle[] = [];
      for (const p of particles) {
        p.x += p.vx + Math.sin(frame * 0.04 + p.bobPhase) * 0.6;
        p.y += p.vy;
        p.rot += p.vrot;
        if (p.y > H() + 60) continue;
        next.push(p);
        const tex = emojiCache.get(p.emoji);
        if (!tex) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        const half = p.size / 2;
        ctx.drawImage(tex, -half, -half, p.size, p.size);
        ctx.restore();
      }
      particles = next;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-30"
    />
  );
}

// ── Sound helper ────────────────────────────────────────────────────────
function playSound(file: string, volume = 0.6) {
  try {
    const a = new Audio(`/sounds/${file}`);
    a.volume = volume;
    void a.play().catch(() => {});
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────

interface CreditsScreenProps {
  players: CreditsPlayer[];
  actions?: ReactNode;
}

type Phase = "celebration" | "shots" | "credits";

export function CreditsScreen({ players, actions }: CreditsScreenProps) {
  const [phase, setPhase] = useState<Phase>("celebration");

  const groom = useMemo(() => players.find(p => p.is_groom), [players]);

  // Auto-advance phases
  useEffect(() => {
    if (phase === "celebration") {
      // Fire party sounds immediately
      playSound("victory.wav", 0.7);
      setTimeout(() => playSound("crowd_cheer.wav", 0.6), 300);
      setTimeout(() => playSound("air_horn.wav", 0.5), 800);
      const t = setTimeout(() => setPhase("shots"), 5500);
      return () => clearTimeout(t);
    }
    if (phase === "shots") {
      playSound("air_horn.wav", 0.6);
      setTimeout(() => playSound("crowd_cheer.wav", 0.5), 400);
    }
  }, [phase]);

  if (phase === "celebration") {
    return (
      <CelebrationPhase
        groomName={groom?.name || "MLADOZENJA"}
        groomFighterId={groom?.fighter_id || "matija"}
        onSkip={() => setPhase("shots")}
      />
    );
  }

  if (phase === "shots") {
    return <ShotsPhase onContinue={() => setPhase("credits")} />;
  }

  return <CreditsRoll players={players} actions={actions} />;
}

// ─────────────────────────────────────────────────────────────────────────
// PHASE 1: CELEBRATION
// ─────────────────────────────────────────────────────────────────────────

function CelebrationPhase({
  groomName,
  groomFighterId,
  onSkip,
}: {
  groomName: string;
  groomFighterId: string;
  onSkip: () => void;
}) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center text-white z-40 cursor-pointer overflow-hidden"
      onClick={onSkip}
      style={{
        background:
          "radial-gradient(circle at center, #4a1a3a 0%, #1a0a1a 60%, #000 100%)",
      }}
    >
      <ConfettiCanvas density={4} />

      {/* Pulsing rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="absolute rounded-full border-4 border-[#FFC828]/40"
          style={{ width: 400, height: 400, animation: "ring-pulse 2s ease-out infinite" }}
        />
        <div
          className="absolute rounded-full border-4 border-[#DC3232]/40"
          style={{ width: 600, height: 600, animation: "ring-pulse 2s ease-out infinite 0.5s" }}
        />
        <div
          className="absolute rounded-full border-4 border-[#28A050]/40"
          style={{ width: 800, height: 800, animation: "ring-pulse 2s ease-out infinite 1s" }}
        />
      </div>

      {/* Sparkle text */}
      <div className="relative z-10 text-center">
        <p
          className="text-2xl md:text-4xl text-[#FFC828] mb-4 tracking-widest"
          style={{ animation: "float-bob 1.5s ease-in-out infinite" }}
        >
          ✦ ✦ ✦
        </p>
        <h1
          className="text-6xl md:text-9xl font-bold tracking-wider"
          style={{
            color: "#FFC828",
            textShadow: "0 0 20px #FFC828, 0 0 40px #FFC828, 4px 4px 0 #000",
            animation: "title-pulse 0.6s ease-in-out infinite alternate",
          }}
        >
          {groomName}
        </h1>
        <h2
          className="text-4xl md:text-7xl font-bold mt-4 tracking-widest"
          style={{
            color: "#FFFFFF",
            textShadow: "0 0 20px #DC3232, 0 0 40px #DC3232, 4px 4px 0 #000",
            animation: "title-pulse 0.6s ease-in-out infinite alternate 0.3s",
          }}
        >
          SE ZENI!!!
        </h2>

        <img
          src={spriteUrl(groomFighterId)}
          alt={groomName}
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_SPRITE; }}
          className="pixel-art mx-auto mt-8"
          style={{
            maxHeight: 280,
            width: "auto",
            filter: "drop-shadow(0 0 30px #FFC828)",
            animation: "float-bob 2s ease-in-out infinite",
          }}
        />

        <p
          className="text-2xl md:text-4xl text-white mt-8 tracking-widest"
          style={{ animation: "float-bob 1.5s ease-in-out infinite 0.5s" }}
        >
          ✦ ✦ ✦
        </p>

        <p className="text-zinc-500 text-sm mt-12 animate-pulse">[ klikni za dalje ]</p>
      </div>

      <style jsx>{`
        @keyframes title-pulse {
          0%   { transform: scale(1); }
          100% { transform: scale(1.06); }
        }
        @keyframes ring-pulse {
          0%   { transform: scale(0.5); opacity: 0; }
          50%  { opacity: 1; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes float-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PHASE 2: SHOTS DECREE
// ─────────────────────────────────────────────────────────────────────────

function ShotsPhase({ onContinue }: { onContinue: () => void }) {
  const [counted, setCounted] = useState(false);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!counted) return;
    if (countdown === 0) {
      playSound("crowd_cheer.wav", 0.6);
      const t = setTimeout(onContinue, 1500);
      return () => clearTimeout(t);
    }
    playSound("menu_select.wav", 0.4);
    const t = setTimeout(() => setCountdown(c => c - 1), 900);
    return () => clearTimeout(t);
  }, [counted, countdown, onContinue]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-40 overflow-hidden"
      style={{
        background: "linear-gradient(45deg, #DC3232, #FFC828, #DC3232, #FFC828)",
        backgroundSize: "400% 400%",
        animation: "shots-bg 1.5s linear infinite",
      }}
    >
      <ConfettiCanvas density={3} />

      <div className="relative z-10 text-center px-6">
        <p
          className="text-3xl md:text-5xl text-black font-bold mb-6 tracking-widest"
          style={{ animation: "shake-text 0.3s ease-in-out infinite" }}
        >
          🚨 PAZNJA 🚨
        </p>
        <h1
          className="text-7xl md:text-[12rem] font-black text-white tracking-widest leading-none"
          style={{
            textShadow: "6px 6px 0 #000, -2px -2px 0 #000, 12px 12px 30px rgba(0,0,0,0.5)",
            animation: "shots-pulse 0.4s ease-in-out infinite alternate",
          }}
        >
          SHOTS
        </h1>
        <h2
          className="text-6xl md:text-9xl font-black text-black tracking-widest mt-2"
          style={{
            textShadow: "4px 4px 0 #FFC828, 8px 8px 0 rgba(0,0,0,0.4)",
            animation: "shots-pulse 0.4s ease-in-out infinite alternate 0.2s",
          }}
        >
          ZA SVE!!!
        </h2>
        <p className="text-2xl md:text-4xl text-black font-bold mt-8 tracking-wider">
          JEDAN SHOT. ODMAH. NEMA RASPRAVE.
        </p>
        <p className="text-xl md:text-2xl text-black/80 mt-3">
          Mladozenja casti. Kum sluzi. Svi piju.
        </p>

        {!counted ? (
          <button
            onClick={() => { setCounted(true); playSound("battle_start.wav", 0.6); }}
            className="mt-12 bg-black text-[#FFC828] font-black text-3xl md:text-5xl py-6 px-12 rounded-2xl border-4 border-black hover:scale-105 active:scale-95 transition-transform"
            style={{ boxShadow: "0 8px 0 rgba(0,0,0,0.4), 0 0 60px rgba(255,200,40,0.6)" }}
          >
            🥃 SPREMNI? KLIKNI 🥃
          </button>
        ) : (
          <div className="mt-12">
            {countdown > 0 ? (
              <div
                className="text-[14rem] md:text-[20rem] font-black text-white leading-none"
                style={{
                  textShadow: "10px 10px 0 #000",
                  animation: "count-pop 0.9s ease-out",
                }}
                key={countdown}
              >
                {countdown}
              </div>
            ) : (
              <div
                className="text-7xl md:text-9xl font-black text-white tracking-widest"
                style={{
                  textShadow: "8px 8px 0 #000",
                  animation: "count-pop 0.9s ease-out",
                }}
              >
                EX!!! 🥃
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shots-bg {
          0%   { background-position: 0% 0%; }
          50%  { background-position: 100% 100%; }
          100% { background-position: 0% 0%; }
        }
        @keyframes shots-pulse {
          0%   { transform: scale(1) rotate(-1deg); }
          100% { transform: scale(1.04) rotate(1deg); }
        }
        @keyframes shake-text {
          0%, 100% { transform: translateX(0); }
          25%      { transform: translateX(-3px); }
          75%      { transform: translateX(3px); }
        }
        @keyframes count-pop {
          0%   { transform: scale(0.4); opacity: 0; }
          40%  { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PHASE 3: CREDITS ROLL
// ─────────────────────────────────────────────────────────────────────────

function CreditsRoll({ players, actions }: { players: CreditsPlayer[]; actions?: ReactNode }) {
  const ranked = [...players].sort((a, b) => totalDrinkScore(b) - totalDrinkScore(a));
  const achievements = computeAchievements(players);
  const totalSips = players.reduce((s, p) => s + p.total_sips, 0);
  const totalShots = players.reduce((s, p) => s + p.total_shots, 0);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    let lastT = performance.now();
    const tick = (t: number) => {
      const dt = t - lastT;
      lastT = t;
      el.scrollTop += dt * 0.05;
      const max = el.scrollHeight - el.clientHeight;
      if (el.scrollTop >= max - 1) {
        el.scrollTop = max;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoScroll]);

  const handleUserScroll = () => setAutoScroll(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#0c0c14] text-white relative overflow-hidden">
      <ConfettiCanvas density={0.5} />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center top, rgba(255,200,40,0.15) 0%, transparent 60%)," +
            "radial-gradient(ellipse at center bottom, rgba(220,50,50,0.15) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 text-center py-6 border-b-2 border-[#FFC828]/30 bg-black/40">
        <h1 className="text-4xl md:text-6xl font-bold text-[#FFC828] tracking-widest"
            style={{ textShadow: "0 0 20px #FFC828" }}>
          JUTRO POSLIJE
        </h1>
        <p className="text-zinc-400 text-sm mt-2">CREDITI · MATIJAMON BACHELOR SPECIAL</p>
      </div>

      <div
        ref={scrollerRef}
        onWheel={handleUserScroll}
        onTouchMove={handleUserScroll}
        className="flex-1 overflow-y-auto relative z-10"
      >
        <div className="max-w-3xl mx-auto px-6 py-12 space-y-16">
          <section className="text-center">
            <p className="text-zinc-500 text-xs uppercase tracking-widest">UKUPNO POPIJENO</p>
            <p className="text-5xl md:text-8xl text-[#FFC828] font-bold mt-2"
               style={{ textShadow: "0 0 30px rgba(255,200,40,0.6)" }}>
              {formatDrinks(totalSips, totalShots)}
            </p>
            <p className="text-zinc-400 text-sm mt-3">
              raspodjeljeno na {players.length} {players.length === 1 ? "dusu" : "dusa"}
            </p>
          </section>

          {ranked.length >= 1 && (
            <section className="text-center">
              <p className="text-zinc-500 text-xs uppercase tracking-widest mb-6">PODIUM SRAMOTE</p>
              <div className="flex items-end justify-center gap-4">
                {[ranked[1], ranked[0], ranked[2]].filter(Boolean).map((p, i) => {
                  const place = i === 1 ? 1 : i === 0 ? 2 : 3;
                  const heights = { 1: 200, 2: 160, 3: 130 };
                  const colors = { 1: "#FFC828", 2: "#C0C0C0", 3: "#CD7F32" };
                  const medal = { 1: "🥇", 2: "🥈", 3: "🥉" };
                  return (
                    <div key={p.id} className="flex flex-col items-center" style={{ width: 130 }}>
                      <img
                        src={spriteUrl(p.fighter_id)}
                        alt={p.name}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_SPRITE; }}
                        className="pixel-art mb-2"
                        style={{ maxHeight: 120, width: "auto" }}
                      />
                      <div
                        className="w-full flex flex-col items-center justify-end pb-3 border-2"
                        style={{
                          height: heights[place as 1 | 2 | 3],
                          backgroundColor: `${colors[place as 1 | 2 | 3]}22`,
                          borderColor: colors[place as 1 | 2 | 3],
                          boxShadow: `0 0 30px ${colors[place as 1 | 2 | 3]}55`,
                        }}
                      >
                        <span className="text-3xl">{medal[place as 1 | 2 | 3]}</span>
                        <span className="text-lg font-bold mt-1">{p.name}</span>
                        <span className="text-sm" style={{ color: colors[place as 1 | 2 | 3] }}>
                          {formatDrinks(p.total_sips, p.total_shots)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {achievements.length > 0 && (
            <section>
              <p className="text-zinc-500 text-xs uppercase tracking-widest text-center mb-6">
                NAGRADE I PRIZNANJA
              </p>
              <div className="space-y-6">
                {achievements.map((a, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-6 border-2 flex items-center gap-6"
                    style={{
                      backgroundColor: `${a.color}15`,
                      borderColor: a.color,
                      boxShadow: `0 0 30px ${a.color}44`,
                    }}
                  >
                    <span className="text-6xl">{a.emoji}</span>
                    <img
                      src={spriteUrl(a.player.fighter_id)}
                      alt={a.player.name}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_SPRITE; }}
                      className="pixel-art"
                      style={{ maxHeight: 100, width: "auto" }}
                    />
                    <div className="flex-1">
                      <p className="text-xs uppercase tracking-widest" style={{ color: a.color }}>
                        {a.title}
                      </p>
                      <p className="text-2xl font-bold text-white mt-1">{a.player.name}</p>
                      <p className="text-sm text-zinc-300 mt-1">{a.subtitle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <p className="text-zinc-500 text-xs uppercase tracking-widest text-center mb-6">
              KONACAN POREDAK
            </p>
            <div className="space-y-2">
              {ranked.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-4 bg-[#1a1a28] border border-zinc-800 p-3 rounded-lg"
                >
                  <span className="text-2xl text-[#FFC828] w-12 text-center font-bold">{i + 1}.</span>
                  <img
                    src={spriteUrl(p.fighter_id)}
                    alt={p.name}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_SPRITE; }}
                    className="pixel-art"
                    style={{ width: 48, height: 48, objectFit: "contain" }}
                  />
                  <div className="flex-1">
                    <span className="text-xl">
                      {p.name}
                      {p.is_groom && <span className="text-[#FFC828] ml-2">★</span>}
                      {p.is_kum && <span className="text-[#3264B4] ml-2">+</span>}
                    </span>
                    <p className="text-xs text-zinc-500">{getDrunkComment(p.total_sips, p.total_shots)}</p>
                  </div>
                  <span className="text-xl text-[#FFC828] font-bold">
                    {formatDrinks(p.total_sips, p.total_shots)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="text-center pt-12 pb-8">
            <p className="text-zinc-600 text-xs uppercase tracking-widest">PRODUCIRAO</p>
            <p className="text-2xl text-[#FFC828] mt-2">PAJO & DRUSTVO</p>
            <p className="text-zinc-600 text-xs mt-8 uppercase tracking-widest">REZIJA</p>
            <p className="text-2xl text-[#FFC828] mt-2">ALKOHOL</p>
            <p className="text-zinc-600 text-xs mt-8 uppercase tracking-widest">U GLAVNOJ ULOZI</p>
            <p className="text-3xl text-[#FFC828] mt-2 font-bold">MATIJA</p>
            <p className="text-zinc-700 text-xs mt-12">Sva slicnost s pijancima je SLUCAJNA.</p>
            <p className="text-[#FFC828] text-xl mt-12">★ ZIVJELI ★</p>
          </section>
        </div>
      </div>

      {actions && (
        <div className="relative z-20 border-t-2 border-[#FFC828]/30 bg-black/70 p-4">
          <div className="flex flex-wrap gap-3 justify-center">{actions}</div>
        </div>
      )}
    </div>
  );
}

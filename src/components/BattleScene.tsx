"use client";

// Pokemon FireRed-style battle scene — pixel-perfect port of pygame battle_ui.py.
// Uses the same backgrounds, fonts, colors, layouts, and animations as MATIJAMON desktop.

import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleState, BattleFighter, MoveData } from "@/lib/battle";
import { TYPE_COLORS } from "@/lib/battle";
import { spriteUrl } from "@/lib/fighters";

interface BattleSceneProps {
  state: BattleState;
  showMoves: boolean;
  selectedMoveIdx: number;
  onMoveSelect?: (idx: number) => void;
  onMoveConfirm?: () => void;
  currentMessage?: string;
  isHost?: boolean;
  mode?: "host" | "phone";
}

// ── Battle arena dimensions (matches pygame 960x640 arena, scaled responsively) ──
// In pygame: sprite_y = 0.5*h for enemy, 0.73*h for player
// We use percentages so it scales with the container.

const BG_FILES = [
  "bar_night.png",
  "parking_lot.png",
  "beach_boat.png",
  "garage_stage.png",
  "rooftop_zagreb.png",
  "forest_clearing.png",
  "gym_dojo.png",
  "apartment_party.png",
];

const TYPE_COLORS_DARK: Record<string, string> = {
  alcohol:      "#8C1E1E",
  amphetamines: "#A07810",
  psychedelics: "#641E8C",
  weed:         "#1E7820",
  neutral:      "#6E6E6E",
  all:          "#8C8C8C",
};

// HP bar palette — 3 tones per color for gradient (matches pygame constants)
const HP_GREEN  = { base: "rgb(50,200,80)",  light: "rgb(90,230,120)", dark: "rgb(30,150,50)" };
const HP_YELLOW = { base: "rgb(230,180,30)", light: "rgb(250,210,80)", dark: "rgb(180,140,10)" };
const HP_RED    = { base: "rgb(200,50,50)",  light: "rgb(240,90,90)",  dark: "rgb(150,30,30)" };

function hpColorFor(ratio: number) {
  if (ratio > 0.5) return HP_GREEN;
  if (ratio > 0.25) return HP_YELLOW;
  return HP_RED;
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────

export function BattleScene({
  state,
  showMoves,
  selectedMoveIdx,
  onMoveSelect,
  onMoveConfirm,
  currentMessage,
  mode = "host",
}: BattleSceneProps) {
  const isMobile = mode === "phone";

  // Animated HP values (smooth drain, ~3 HP/frame = 180 HP/s at 60fps)
  const [animatedHp1, setAnimatedHp1] = useState(state.player1.current_hp);
  const [animatedHp2, setAnimatedHp2] = useState(state.player2.current_hp);

  // Shake state (triggered on HP decrease)
  const [shake1, setShake1] = useState(0);
  const [shake2, setShake2] = useState(0);

  // Critical flash overlay (triggered when message contains "kritican" / "critical")
  const [critFlash, setCritFlash] = useState(false);

  // Previous HP to detect damage for shake trigger
  const prevHp1 = useRef(state.player1.current_hp);
  const prevHp2 = useRef(state.player2.current_hp);

  // Stable random background per fight (keyed on fighter pairing)
  const bgFile = useMemo(() => {
    const seed = (state.player1.id + state.player2.id).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return BG_FILES[seed % BG_FILES.length];
  }, [state.player1.id, state.player2.id]);

  // Detect HP decrease → trigger shake on the fighter that took damage
  useEffect(() => {
    if (state.player1.current_hp < prevHp1.current) {
      setShake1(s => s + 1);
    }
    prevHp1.current = state.player1.current_hp;
  }, [state.player1.current_hp]);

  useEffect(() => {
    if (state.player2.current_hp < prevHp2.current) {
      setShake2(s => s + 1);
    }
    prevHp2.current = state.player2.current_hp;
  }, [state.player2.current_hp]);

  // Crit flash from message text
  useEffect(() => {
    if (!currentMessage) return;
    const m = currentMessage.toLowerCase();
    if (m.includes("kritic") || m.includes("critical")) {
      setCritFlash(true);
      const t = window.setTimeout(() => setCritFlash(false), 220);
      return () => window.clearTimeout(t);
    }
  }, [currentMessage]);

  // Smooth HP bar drain: lerp animatedHp toward current_hp (3 HP/frame-ish)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setAnimatedHp1(prev => {
        const target = state.player1.current_hp;
        if (prev === target) return prev;
        const step = prev < target ? 1 : -1;
        const next = prev + step * Math.max(1, Math.abs(target - prev) * 0.08);
        if ((step > 0 && next >= target) || (step < 0 && next <= target)) return target;
        return next;
      });
      setAnimatedHp2(prev => {
        const target = state.player2.current_hp;
        if (prev === target) return prev;
        const step = prev < target ? 1 : -1;
        const next = prev + step * Math.max(1, Math.abs(target - prev) * 0.08);
        if ((step > 0 && next >= target) || (step < 0 && next <= target)) return target;
        return next;
      });
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [state.player1.current_hp, state.player2.current_hp]);

  return (
    <div className={`flex flex-col w-full mx-auto font-pixel ${isMobile ? "max-w-md gap-2" : "max-w-5xl gap-3"}`}>
      {/* ── BATTLE ARENA ── */}
      <div
        className={`relative rounded-xl overflow-hidden ${isMobile ? "h-72" : "h-[30rem] md:h-[34rem]"}`}
        style={{
          backgroundImage: `url(/backgrounds/${bgFile})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          imageRendering: "pixelated",
          border: "4px solid #282828",
          boxShadow: "inset 0 0 0 2px #FFC828, 0 8px 32px rgba(0,0,0,0.6)",
        }}
      >
        {/* Dim overlay so sprites read clearly */}
        <div className="absolute inset-0 bg-black/10 pointer-events-none" />

        {/* Critical flash overlay */}
        {critFlash && (
          <div className="absolute inset-0 bg-white/60 pointer-events-none z-30" />
        )}

        {/* ── ENEMY (player2) — top-right ── */}
        {/* Platform ellipse */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: "65%",
            top: "50%",
            width: isMobile ? 160 : 300,
            height: isMobile ? 24 : 44,
            transform: "translate(-50%, 0)",
            borderRadius: "50%",
            background: "radial-gradient(ellipse at center, rgba(136,176,136,0.85) 40%, rgba(104,144,104,0.5) 70%, transparent 100%)",
            boxShadow: "0 4px 8px rgba(0,0,0,0.4)",
          }}
        />
        {/* Enemy sprite */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: "65%",
            top: "50%",
            transform: `translate(-50%, -100%) translateX(${shake2 % 2 === 0 ? 0 : 3}px)`,
            animation: shake2 > 0 ? "battle-shake 0.35s ease-out" : "battle-idle-bob 3.5s ease-in-out infinite",
          }}
          key={`enemy-${shake2}`}
        >
          <img
            src={spriteUrl(state.player2.id)}
            alt={state.player2.name}
            className="pixel-art"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/sprites/matijamon.png"; }}
            style={{
              width: isMobile ? 130 : 230,
              height: isMobile ? 130 : 230,
              imageRendering: "pixelated",
              filter: state.player2.current_hp <= 0 ? "grayscale(1) brightness(0.5)" : "drop-shadow(0 6px 0 rgba(0,0,0,0.3))",
              opacity: state.player2.current_hp <= 0 ? 0.4 : 1,
              transform: state.player2.current_hp <= 0 ? "translateY(40px)" : "none",
              transition: "opacity 0.4s, transform 0.4s",
            }}
          />
        </div>
        {/* Enemy HP box — top-left */}
        <div className={`absolute z-20 ${isMobile ? "top-2 left-2" : "top-4 left-4"}`}>
          <HpBox fighter={state.player2} animatedHp={animatedHp2} isEnemy compact={isMobile} />
        </div>

        {/* ── PLAYER (player1) — bottom-left ── */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: "28%",
            top: "73%",
            width: isMobile ? 200 : 340,
            height: isMobile ? 28 : 52,
            transform: "translate(-50%, 0)",
            borderRadius: "50%",
            background: "radial-gradient(ellipse at center, rgba(168,144,112,0.85) 40%, rgba(136,112,80,0.5) 70%, transparent 100%)",
            boxShadow: "0 4px 8px rgba(0,0,0,0.4)",
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            left: "28%",
            top: "73%",
            transform: `translate(-50%, -100%) translateX(${shake1 % 2 === 0 ? 0 : -3}px)`,
            animation: shake1 > 0 ? "battle-shake 0.35s ease-out" : "battle-idle-bob 3.5s ease-in-out infinite",
          }}
          key={`player-${shake1}`}
        >
          <img
            src={spriteUrl(state.player1.id)}
            alt={state.player1.name}
            className="pixel-art"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/sprites/matijamon.png"; }}
            style={{
              width: isMobile ? 150 : 280,
              height: isMobile ? 150 : 280,
              imageRendering: "pixelated",
              filter: state.player1.current_hp <= 0 ? "grayscale(1) brightness(0.5)" : "drop-shadow(0 8px 0 rgba(0,0,0,0.35))",
              opacity: state.player1.current_hp <= 0 ? 0.4 : 1,
              transform: state.player1.current_hp <= 0 ? "translateY(40px)" : "none",
              transition: "opacity 0.4s, transform 0.4s",
            }}
          />
        </div>
        {/* Player HP box — bottom-right */}
        <div className={`absolute z-20 ${isMobile ? "bottom-2 right-2" : "bottom-4 right-6"}`}>
          <HpBox fighter={state.player1} animatedHp={animatedHp1} compact={isMobile} />
        </div>
      </div>

      {/* ── BOTTOM PANEL: text box + move grid ── */}
      <div
        className={`relative rounded-xl overflow-hidden ${isMobile ? "min-h-[180px]" : "min-h-[200px]"}`}
        style={{
          background: "linear-gradient(180deg, #f8f8f0 0%, #e8e8dc 100%)",
          border: "4px solid #282828",
          boxShadow: "inset 0 0 0 2px #b4b4a0",
        }}
      >
        {showMoves && state.player1.moves ? (
          <div className={`flex ${isMobile ? "flex-col" : "flex-row"} h-full`}>
            {/* Info column (selected move details) */}
            <div className={`${isMobile ? "p-2 border-b-2 border-[#282828]" : "w-2/5 p-3 border-r-2 border-[#282828]"}`}>
              <SelectedMoveInfo move={state.player1.moves[selectedMoveIdx]} compact={isMobile} message={currentMessage} />
            </div>
            {/* 2×2 move grid */}
            <div className={`${isMobile ? "p-2" : "flex-1 p-3"}`}>
              <MoveGrid
                moves={state.player1.moves}
                selectedIdx={selectedMoveIdx}
                onSelect={onMoveSelect}
                onConfirm={onMoveConfirm}
                compact={isMobile}
              />
            </div>
          </div>
        ) : (
          <div className={`${isMobile ? "p-4" : "p-6"}`}>
            <TypewriterText text={currentMessage || ""} compact={isMobile} />
          </div>
        )}
      </div>

      {/* Inline CSS for the bespoke animations */}
      <style jsx>{`
        @keyframes battle-shake {
          0%   { transform: translate(-50%, -100%) translateX(0); }
          15%  { transform: translate(-50%, -100%) translateX(-6px); }
          30%  { transform: translate(-50%, -100%) translateX(5px); }
          45%  { transform: translate(-50%, -100%) translateX(-4px); }
          60%  { transform: translate(-50%, -100%) translateX(3px); }
          75%  { transform: translate(-50%, -100%) translateX(-2px); }
          100% { transform: translate(-50%, -100%) translateX(0); }
        }
        @keyframes battle-idle-bob {
          0%, 100% { transform: translate(-50%, -100%) translateY(0); }
          50%      { transform: translate(-50%, -100%) translateY(-3px); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// HP BOX — Gen 3 Pokemon style
// ─────────────────────────────────────────────────────────────────────────

function HpBox({
  fighter,
  animatedHp,
  isEnemy = false,
  compact,
}: {
  fighter: BattleFighter;
  animatedHp: number;
  isEnemy?: boolean;
  compact: boolean;
}) {
  const hpPct = Math.max(0, animatedHp / fighter.max_hp);
  const palette = hpColorFor(hpPct);
  const critical = hpPct <= 0.25;

  return (
    <div
      className="font-pixel"
      style={{
        backgroundColor: "rgba(248,248,240,0.95)",
        border: "3px solid #282828",
        borderRadius: 6,
        padding: compact ? "4px 8px" : "6px 12px",
        minWidth: compact ? 150 : 260,
        boxShadow: "0 3px 0 #282828, inset 0 0 0 1px #b4b4a0",
      }}
    >
      {/* Name + type badges */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[#282828] font-bold"
          style={{ fontSize: compact ? 9 : 13, letterSpacing: "0.5px" }}
        >
          {fighter.name.toUpperCase()}
        </span>
        {fighter.types.map(t => (
          <span
            key={t}
            className="inline-block text-white"
            style={{
              backgroundColor: TYPE_COLORS[t] || "#888",
              fontSize: compact ? 6 : 8,
              padding: "1px 3px",
              borderRadius: 2,
              border: "1px solid rgba(0,0,0,0.4)",
              letterSpacing: "0.5px",
            }}
          >
            {t.slice(0, 4).toUpperCase()}
          </span>
        ))}
      </div>

      {/* HP label + bar */}
      <div className="flex items-center gap-1.5">
        <span
          className="font-bold"
          style={{ color: "#F8B030", fontSize: compact ? 7 : 10 }}
        >
          HP
        </span>
        <div
          className="relative flex-1 overflow-hidden"
          style={{
            height: compact ? 6 : 10,
            backgroundColor: "#383838",
            border: "1px solid #282828",
            borderRadius: 2,
            boxShadow: "inset 0 1px 0 rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              width: `${hpPct * 100}%`,
              height: "100%",
              background: `linear-gradient(180deg, ${palette.light} 0%, ${palette.base} 50%, ${palette.dark} 100%)`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)",
              transition: "width 0.05s linear",
              animation: critical ? "hp-pulse 0.6s ease-in-out infinite" : "none",
            }}
          />
        </div>
      </div>

      {/* HP number (not shown for enemy, matches Gen 3) */}
      {!isEnemy && (
        <p
          className="text-right font-bold"
          style={{
            color: "#282828",
            fontSize: compact ? 8 : 11,
            marginTop: 2,
          }}
        >
          {Math.round(animatedHp)}/{fighter.max_hp}
        </p>
      )}

      {/* Status badges */}
      <div className="flex gap-1 mt-1 flex-wrap">
        {fighter.status.drunk && <StatusBadge label="PIJ" color="#FFC828" />}
        {fighter.status.stoned && <StatusBadge label="STN" color="#32B432" />}
        {fighter.status.wired && <StatusBadge label="WIR" color="#E6B41E" />}
        {fighter.status.asleep && <StatusBadge label="SPA" color="#888" />}
        {fighter.status.silenced && <StatusBadge label="MUT" color="#9632C8" />}
        {fighter.status.burned && <StatusBadge label="BRN" color="#FF4828" />}
      </div>

      <style jsx>{`
        @keyframes hp-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        backgroundColor: color,
        color: "#000",
        fontSize: 7,
        fontWeight: "bold",
        padding: "1px 3px",
        borderRadius: 2,
        border: "1px solid rgba(0,0,0,0.5)",
      }}
    >
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MOVE GRID (2×2) — Gen 3 style with type-colored fills
// ─────────────────────────────────────────────────────────────────────────

function MoveGrid({
  moves,
  selectedIdx,
  onSelect,
  onConfirm,
  compact,
}: {
  moves: MoveData[];
  selectedIdx: number;
  onSelect?: (idx: number) => void;
  onConfirm?: () => void;
  compact: boolean;
}) {
  return (
    <div
      className="grid grid-cols-2 h-full"
      style={{ gap: compact ? 6 : 10 }}
    >
      {moves.slice(0, 4).map((move, idx) => {
        const typeColor = TYPE_COLORS[move.type] || "#888";
        const typeColorDark = TYPE_COLORS_DARK[move.type] || "#555";
        const isSelected = idx === selectedIdx;
        const noPP = (move.pp ?? 0) <= 0;
        return (
          <button
            key={idx}
            disabled={noPP}
            onClick={() => {
              if (noPP) return;
              if (isSelected) onConfirm?.();
              else onSelect?.(idx);
            }}
            className="font-pixel text-left relative transition-transform active:scale-[0.97]"
            style={{
              background: isSelected
                ? `linear-gradient(180deg, ${typeColor} 0%, ${typeColorDark} 100%)`
                : `linear-gradient(180deg, ${typeColorDark} 0%, ${typeColorDark}dd 100%)`,
              border: isSelected ? "3px solid #FFD030" : "3px solid #282828",
              borderLeft: `8px solid ${typeColor}`,
              borderRadius: 4,
              padding: compact ? "6px 8px" : "10px 12px",
              boxShadow: isSelected
                ? `0 0 0 2px #282828, 0 0 12px ${typeColor}, inset 0 0 0 1px rgba(255,255,255,0.3)`
                : `0 2px 0 #282828, inset 0 0 0 1px rgba(255,255,255,0.15)`,
              opacity: noPP ? 0.35 : 1,
              cursor: noPP ? "not-allowed" : "pointer",
              color: "#fff",
            }}
          >
            <div className="flex items-center justify-between">
              <span
                style={{
                  fontSize: compact ? 10 : 14,
                  textShadow: "1px 1px 0 rgba(0,0,0,0.8)",
                  letterSpacing: "0.5px",
                }}
              >
                {move.name.toUpperCase()}
              </span>
              <span
                style={{
                  fontSize: compact ? 7 : 9,
                  color: (move.pp ?? 0) < 3 ? "#FFAAAA" : "#ddd",
                  textShadow: "1px 1px 0 rgba(0,0,0,0.8)",
                }}
              >
                PP {move.pp}/{move.max_pp}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="text-black font-bold"
                style={{
                  backgroundColor: typeColor,
                  fontSize: compact ? 6 : 8,
                  padding: "1px 4px",
                  borderRadius: 2,
                  border: "1px solid rgba(0,0,0,0.5)",
                  letterSpacing: "0.5px",
                }}
              >
                {move.type.toUpperCase()}
              </span>
              {move.power > 0 && (
                <span
                  style={{
                    fontSize: compact ? 7 : 9,
                    color: "#fff",
                    textShadow: "1px 1px 0 rgba(0,0,0,0.8)",
                  }}
                >
                  ⚔ {move.power}
                </span>
              )}
              <span
                style={{
                  fontSize: compact ? 7 : 9,
                  color: "#ddd",
                  textShadow: "1px 1px 0 rgba(0,0,0,0.8)",
                }}
              >
                {move.category}
              </span>
            </div>
            {isSelected && !compact && (
              <div
                className="absolute -left-3 top-1/2 w-0 h-0"
                style={{
                  transform: "translateY(-50%)",
                  borderTop: "8px solid transparent",
                  borderBottom: "8px solid transparent",
                  borderLeft: "10px solid #FFD030",
                  filter: "drop-shadow(1px 1px 0 #282828)",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function SelectedMoveInfo({
  move,
  compact,
  message,
}: {
  move: MoveData | undefined;
  compact: boolean;
  message?: string;
}) {
  if (!move) return null;
  const color = TYPE_COLORS[move.type] || "#888";
  return (
    <div className="h-full flex flex-col justify-between font-pixel">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-black font-bold"
            style={{
              backgroundColor: color,
              fontSize: compact ? 7 : 10,
              padding: "2px 5px",
              borderRadius: 2,
              border: "1px solid rgba(0,0,0,0.5)",
            }}
          >
            {move.type.toUpperCase()}
          </span>
          {move.power > 0 && (
            <span className="text-[#282828]" style={{ fontSize: compact ? 8 : 11 }}>
              PWR {move.power}
            </span>
          )}
        </div>
        <p className="text-[#282828]" style={{ fontSize: compact ? 7 : 10, marginBottom: 4 }}>
          {move.category.toUpperCase()} · PP {move.pp}/{move.max_pp}
        </p>
        {move.description && (
          <p
            className="text-[#404040] leading-relaxed"
            style={{ fontSize: compact ? 7 : 10 }}
          >
            {move.description}
          </p>
        )}
      </div>
      {message && (
        <p
          className="text-[#8C1E1E] mt-2 border-t-2 border-[#282828] pt-2"
          style={{ fontSize: compact ? 7 : 10 }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TYPEWRITER TEXT BOX — Gen 3 style message reveal
// ─────────────────────────────────────────────────────────────────────────

function TypewriterText({ text, compact }: { text: string; compact: boolean }) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    setRevealed(0);
    if (!text) return;
    let i = 0;
    const interval = window.setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= text.length) window.clearInterval(interval);
    }, 28);
    return () => window.clearInterval(interval);
  }, [text]);

  return (
    <p
      className="text-[#282828] font-pixel leading-relaxed"
      style={{
        fontSize: compact ? 11 : 16,
        minHeight: compact ? 60 : 80,
        letterSpacing: "0.3px",
      }}
    >
      {text.slice(0, revealed)}
      {revealed < text.length && <span className="animate-pulse">▌</span>}
      {revealed >= text.length && text.length > 0 && (
        <span className="inline-block ml-2 animate-bounce" style={{ color: "#282828" }}>▾</span>
      )}
    </p>
  );
}

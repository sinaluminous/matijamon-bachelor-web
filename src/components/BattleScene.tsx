"use client";

// Pokemon FireRed-style battle scene component.
// Used by both host page (TV) and local mode.
// Props provide the battle state and event callbacks for move selection.

import { useEffect, useState, useRef } from "react";
import type { BattleState, BattleFighter, MoveData, BattleEvent } from "@/lib/battle";
import { TYPE_COLORS } from "@/lib/battle";
import { spriteUrl } from "@/lib/fighters";

interface BattleSceneProps {
  state: BattleState;
  // Show move grid for player1 (host always shows player1's moves on TV)
  showMoves: boolean;
  selectedMoveIdx: number;
  onMoveSelect?: (idx: number) => void;
  onMoveConfirm?: () => void;
  // Battle log messages currently animating
  currentMessage?: string;
  isHost?: boolean;
  // Display mode: "host" = big TV view, "phone" = mobile player view
  mode?: "host" | "phone";
}

export function BattleScene({
  state,
  showMoves,
  selectedMoveIdx,
  onMoveSelect,
  onMoveConfirm,
  currentMessage,
  mode = "host",
}: BattleSceneProps) {
  const [animatedHp1, setAnimatedHp1] = useState(state.player1.current_hp);
  const [animatedHp2, setAnimatedHp2] = useState(state.player2.current_hp);

  // Animate HP bars smoothly
  useEffect(() => {
    const animateBar = (
      target: number,
      setter: React.Dispatch<React.SetStateAction<number>>,
    ): number | undefined => {
      const interval = window.setInterval(() => {
        setter((prev: number) => {
          if (prev === target) {
            window.clearInterval(interval);
            return target;
          }
          const step = prev < target ? 1 : -1;
          const next = prev + step * 2;
          if ((step > 0 && next >= target) || (step < 0 && next <= target)) {
            window.clearInterval(interval);
            return target;
          }
          return next;
        });
      }, 20);
      return interval;
    };

    const i1 = animateBar(state.player1.current_hp, setAnimatedHp1);
    const i2 = animateBar(state.player2.current_hp, setAnimatedHp2);
    return () => {
      if (i1) window.clearInterval(i1);
      if (i2) window.clearInterval(i2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.player1.current_hp, state.player2.current_hp]);

  const isMobile = mode === "phone";

  return (
    <div className={`flex flex-col w-full max-w-5xl mx-auto ${isMobile ? "gap-2" : "gap-4"}`}>
      {/* Battle arena: gradient background with two fighters */}
      <div
        className={`relative rounded-2xl overflow-hidden ${isMobile ? "h-64" : "h-96 md:h-[28rem]"}`}
        style={{
          background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          border: "4px solid #FFC828",
        }}
      >
        {/* Enemy (player2) — top-right */}
        <div className={`absolute ${isMobile ? "top-2 left-2" : "top-4 left-4"}`}>
          <FighterHpBox fighter={state.player2} animatedHp={animatedHp2} compact={isMobile} />
        </div>
        <div className={`absolute ${isMobile ? "top-1 right-2" : "top-4 right-8"}`}>
          <img
            src={spriteUrl(state.player2.id)}
            alt={state.player2.name}
            className={`pixel-art ${isMobile ? "w-24 h-24" : "w-44 h-44 md:w-56 md:h-56"} ${state.player2.current_hp <= 0 ? "opacity-30 grayscale" : ""}`}
            style={{ imageRendering: "pixelated" }}
          />
        </div>

        {/* Player (player1) — bottom-left */}
        <div className={`absolute ${isMobile ? "bottom-1 left-2" : "bottom-4 left-8"}`}>
          <img
            src={spriteUrl(state.player1.id)}
            alt={state.player1.name}
            className={`pixel-art ${isMobile ? "w-24 h-24" : "w-44 h-44 md:w-56 md:h-56"} ${state.player1.current_hp <= 0 ? "opacity-30 grayscale" : ""}`}
            style={{ imageRendering: "pixelated", transform: "scaleX(-1)" }}
          />
        </div>
        <div className={`absolute ${isMobile ? "bottom-2 right-2" : "bottom-8 right-8"}`}>
          <FighterHpBox fighter={state.player1} animatedHp={animatedHp1} compact={isMobile} />
        </div>

        {/* VS divider lightning */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#FFC828] opacity-20 text-6xl pointer-events-none">VS</div>
      </div>

      {/* Message log */}
      {currentMessage && (
        <div className={`bg-[#1a1a28] border-2 border-[#FFC828] rounded-xl p-4 ${isMobile ? "min-h-[60px]" : "min-h-[80px]"}`}>
          <p className={`text-white text-center ${isMobile ? "text-sm" : "text-xl"}`}>{currentMessage}</p>
        </div>
      )}

      {/* Move grid (if shown) */}
      {showMoves && state.player1.moves && (
        <MoveGrid
          moves={state.player1.moves}
          selectedIdx={selectedMoveIdx}
          onSelect={onMoveSelect}
          onConfirm={onMoveConfirm}
          compact={isMobile}
        />
      )}
    </div>
  );
}

function FighterHpBox({
  fighter,
  animatedHp,
  compact,
}: {
  fighter: BattleFighter;
  animatedHp: number;
  compact: boolean;
}) {
  const hpPct = Math.max(0, animatedHp / fighter.max_hp);
  const hpColor = hpPct > 0.5 ? "#28C846" : hpPct > 0.2 ? "#FFC828" : "#DC3232";
  return (
    <div
      className={`bg-black/80 border-2 border-[#FFC828] rounded-lg ${compact ? "px-2 py-1 min-w-[120px]" : "px-3 py-2 min-w-[200px]"}`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-white font-bold ${compact ? "text-[10px]" : "text-sm"}`}>{fighter.name}</span>
        {fighter.types.map(t => (
          <span
            key={t}
            className={`px-1 rounded text-black font-bold ${compact ? "text-[7px]" : "text-[10px]"}`}
            style={{ backgroundColor: TYPE_COLORS[t] || "#888" }}
          >
            {t.slice(0, 4).toUpperCase()}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-1">
        <span className={`text-zinc-500 ${compact ? "text-[7px]" : "text-[9px]"}`}>HP</span>
        <div className={`flex-1 bg-zinc-900 rounded ${compact ? "h-1.5" : "h-2"} border border-zinc-700 overflow-hidden`}>
          <div
            className="h-full transition-all"
            style={{
              width: `${hpPct * 100}%`,
              backgroundColor: hpColor,
            }}
          />
        </div>
      </div>
      <p className={`text-right text-zinc-400 ${compact ? "text-[7px]" : "text-[10px]"}`}>
        {Math.round(animatedHp)}/{fighter.max_hp}
      </p>
      {/* Status badges */}
      <div className="flex gap-1 mt-1">
        {fighter.status.drunk && <StatusBadge label="PIJ" color="#FFC828" />}
        {fighter.status.stoned && <StatusBadge label="STN" color="#32B432" />}
        {fighter.status.wired && <StatusBadge label="WIR" color="#E6B41E" />}
        {fighter.status.asleep && <StatusBadge label="SPA" color="#888" />}
        {fighter.status.silenced && <StatusBadge label="MUT" color="#9632C8" />}
        {fighter.status.burned && <StatusBadge label="BRN" color="#FF4828" />}
      </div>
    </div>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="px-1 rounded text-black text-[7px] font-bold"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

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
    <div className={`grid grid-cols-2 ${compact ? "gap-2" : "gap-3"}`}>
      {moves.slice(0, 4).map((move, idx) => {
        const color = TYPE_COLORS[move.type] || "#888";
        const isSelected = idx === selectedIdx;
        const out = (move.pp ?? 0) <= 0;
        return (
          <button
            key={idx}
            disabled={out}
            onClick={() => {
              if (out) return;
              if (isSelected) {
                onConfirm?.();
              } else {
                onSelect?.(idx);
              }
            }}
            className={`text-left rounded-lg border-2 transition active:scale-95 ${compact ? "p-2" : "p-3"} ${
              isSelected ? "border-[#FFC828] bg-[#FFC828]/20" : "border-zinc-700 bg-[#1a1a28]"
            } ${out ? "opacity-30" : ""}`}
            style={{ borderLeftWidth: 6, borderLeftColor: color }}
          >
            <div className="flex items-center justify-between">
              <span className={`font-bold text-white ${compact ? "text-xs" : "text-base"}`}>{move.name}</span>
              <span className={`text-zinc-500 ${compact ? "text-[8px]" : "text-[10px]"}`}>PP {move.pp}/{move.max_pp}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`px-1 rounded text-black font-bold ${compact ? "text-[7px]" : "text-[9px]"}`}
                style={{ backgroundColor: color }}
              >
                {move.type.toUpperCase()}
              </span>
              {move.power > 0 && (
                <span className={`text-zinc-400 ${compact ? "text-[8px]" : "text-[10px]"}`}>
                  ⚔ {move.power}
                </span>
              )}
              <span className={`text-zinc-500 ${compact ? "text-[8px]" : "text-[10px]"}`}>{move.category}</span>
            </div>
            {!compact && move.description && (
              <p className="text-[10px] text-zinc-500 mt-1 line-clamp-1">{move.description}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

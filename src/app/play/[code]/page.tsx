"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  getRoom, joinRoom, getPlayers, subscribeToRoom, subscribeToPlayers,
  recordPlayerAction, getOrCreateSessionToken,
} from "@/lib/room";
import { FIGHTERS, spriteUrl } from "@/lib/fighters";
import type { GameState, PlayerRow, GameCard } from "@/lib/supabase";
import { formatDrinks, getDrunkComment, CARD_COLORS } from "@/lib/cards";
import { getPlayerRole } from "@/lib/cardFlow";

export default function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "name" | "fighter" | "in_game" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selectedFighter, setSelectedFighter] = useState<string | null>(null);
  const [me, setMe] = useState<PlayerRow | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [actedOnCard, setActedOnCard] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const room = await getRoom(code);
        if (!room) { setError("Soba ne postoji ili je istekla"); setPhase("error"); return; }
        setState(room.state);
        const token = getOrCreateSessionToken();
        const ps = await getPlayers(code);
        setPlayers(ps);
        const existing = ps.find(p => p.session_token === token);
        if (existing) { setMe(existing); setPhase("in_game"); }
        else setPhase("name");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Greska");
        setPhase("error");
      }
    })();
  }, [code]);

  useEffect(() => {
    if (phase !== "in_game") return;
    const unsub1 = subscribeToRoom(code, (s) => {
      setState(s);
      // Reset acted-on-card flag when card changes
      if (!s.current_card || s.current_card.id !== actedOnCard) {
        setActedOnCard(null);
      }
    });
    const unsub2 = subscribeToPlayers(code, (ps) => {
      setPlayers(ps);
      if (me) {
        const updated = ps.find(p => p.id === me.id);
        if (updated) setMe(updated);
      }
    });
    return () => { unsub1(); unsub2(); };
  }, [phase, code, me, actedOnCard]);

  const handleNameSubmit = () => { if (name.trim().length < 1) return; setPhase("fighter"); };

  const handleJoin = async () => {
    if (!selectedFighter) return;
    setBusy(true);
    try {
      const isGroom = selectedFighter === "matija";
      const isKum = selectedFighter === "pasko";
      const player = await joinRoom(code, name, selectedFighter, isGroom, isKum);
      setMe(player);
      setPhase("in_game");
    } catch (e) { setError(e instanceof Error ? e.message : "Greska"); }
    setBusy(false);
  };

  const takenFighterIds = new Set(players.map(p => p.fighter_id));

  if (phase === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="text-[#DC3232] text-xl mb-4">{error}</p>
        <button onClick={() => router.push("/")} className="bg-[#FFC828] text-black px-6 py-3 rounded-lg">Natrag</button>
      </div>
    );
  }
  if (phase === "loading") return <div className="min-h-screen flex items-center justify-center text-zinc-400">Ucitavanje...</div>;

  if (phase === "name") {
    return (
      <div className="min-h-screen flex flex-col p-6 pt-12">
        <p className="text-zinc-400 text-xs text-center mb-2">SOBA</p>
        <p className="text-[#FFC828] text-3xl text-center mb-8 tracking-[0.3em]">{code}</p>
        <h1 className="text-2xl text-center mb-6 text-[#FFC828]">Kako se zoves?</h1>
        <input
          type="text" value={name}
          onChange={(e) => setName(e.target.value.slice(0, 12))} maxLength={12}
          placeholder="TVOJE IME"
          className="bg-[#1a1a28] border-2 border-[#FFC828] text-center text-2xl py-4 px-6 rounded-lg uppercase text-white focus:outline-none focus:border-[#FFD850] mb-6"
          autoFocus
        />
        <button onClick={handleNameSubmit} disabled={!name.trim()}
          className="bg-[#FFC828] text-black font-bold py-4 text-xl rounded-lg disabled:opacity-30 active:scale-95">DALJE</button>
      </div>
    );
  }

  if (phase === "fighter") {
    return (
      <div className="min-h-screen flex flex-col p-4 pt-6">
        <p className="text-center text-zinc-400 text-sm mb-2">{name}</p>
        <h1 className="text-xl text-center mb-2 text-[#FFC828]">Odaberi lika</h1>
        <p className="text-xs text-center text-zinc-500 mb-4">Matija = Mladozenja • Pasko = Kum</p>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {FIGHTERS.map((f) => {
            const isTaken = takenFighterIds.has(f.id);
            const isSelected = selectedFighter === f.id;
            return (
              <button key={f.id} onClick={() => !isTaken && setSelectedFighter(f.id)} disabled={isTaken}
                className={`p-2 rounded-lg border-2 transition ${
                  isSelected ? "border-[#FFC828] bg-[#FFC828]/20 scale-105"
                    : isTaken ? "border-zinc-800 bg-zinc-900/50 opacity-30"
                      : "border-zinc-700 bg-[#1a1a28] active:scale-95"
                }`}>
                {f.has_sprite ? <img src={spriteUrl(f.id)} alt={f.name} className="w-full pixel-art" />
                  : <div className="w-full aspect-square flex items-center justify-center text-3xl text-zinc-500">?</div>}
                <p className="text-[8px] mt-1 text-center text-white">{f.name}</p>
                {f.is_groom && <p className="text-[6px] text-[#FFC828] text-center">MLADOZENJA</p>}
                {f.is_kum && <p className="text-[6px] text-[#DCA014] text-center">KUM</p>}
                {isTaken && <p className="text-[6px] text-red-500 text-center">UZET</p>}
              </button>
            );
          })}
        </div>
        <button onClick={handleJoin} disabled={!selectedFighter || busy}
          className="bg-[#FFC828] text-black font-bold py-4 text-xl rounded-lg disabled:opacity-30 active:scale-95">
          {busy ? "..." : "UDJI U IGRU"}
        </button>
        <button onClick={() => setPhase("name")} className="text-zinc-500 underline text-sm mt-3">Natrag</button>
      </div>
    );
  }

  if (phase === "in_game" && me && state) {
    return (
      <PlayerInGame
        me={me} state={state} players={players} code={code}
        actedOnCard={actedOnCard} setActedOnCard={setActedOnCard}
      />
    );
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// IN-GAME VIEW (the main player UX)
// ────────────────────────────────────────────────────────────────────────────

function PlayerInGame({
  me, state, players, code, actedOnCard, setActedOnCard,
}: {
  me: PlayerRow; state: GameState; players: PlayerRow[]; code: string;
  actedOnCard: string | null; setActedOnCard: (id: string | null) => void;
}) {
  const currentPlayer = players[state.current_player_idx];
  const isMyTurn = currentPlayer?.id === me.id;
  const card = state.current_card;
  const role = card ? getPlayerRole(card.card_type, isMyTurn, me.is_groom) : "spectator";

  // Helper to send action and mark as acted
  const act = async (actionType: string, payload: Record<string, unknown> = {}) => {
    if (!card || actedOnCard === card.id) return;
    setActedOnCard(card.id);
    await recordPlayerAction(code, me.id, actionType, payload, card.id);
  };

  // ── LOBBY ──
  if (state.phase === "lobby") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <img src={spriteUrl(me.fighter_id)} alt={me.name} className="w-32 h-32 pixel-art mb-4 animate-pulse-glow" />
        <h2 className="text-3xl text-[#FFC828] mb-2">{me.name}</h2>
        <p className="text-zinc-500 text-sm mb-6">{me.is_groom ? "MLADOZENJA" : me.is_kum ? "KUM" : "IGRAC"}</p>
        <p className="text-zinc-400 text-sm mb-8 animate-pulse">Cekam pocetak igre...</p>
        <div className="bg-[#1a1a28] rounded-lg p-4 w-full max-w-sm">
          <p className="text-xs text-zinc-500 mb-2">U IGRI ({players.length})</p>
          <div className="grid grid-cols-2 gap-2">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-6 h-6 pixel-art" />
                <span className={p.id === me.id ? "text-[#FFC828]" : "text-white"}>
                  {p.is_groom && "★"}{p.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── ENDED ──
  if (state.phase === "ended") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-3xl text-[#FFC828] mb-4">JUTRO POSLIJE</h1>
        <img src={spriteUrl(me.fighter_id)} alt={me.name} className="w-32 h-32 pixel-art my-6" />
        <p className="text-2xl text-white mb-2">{me.name}</p>
        <p className="text-3xl text-[#FFC828]">{formatDrinks(me.total_sips, me.total_shots)}</p>
        <p className="text-zinc-500 text-sm mt-2">{getDrunkComment(me.total_sips, me.total_shots)}</p>
      </div>
    );
  }

  // ── PLAYING ──
  return (
    <div className="min-h-screen flex flex-col bg-[#0c0c14]">
      {/* Top: Self info bar */}
      <div className="bg-[#1a1a28] border-b border-[#FFC828]/30 p-3 flex items-center gap-3">
        <img src={spriteUrl(me.fighter_id)} alt={me.name} className="w-12 h-12 pixel-art" />
        <div className="flex-1 min-w-0">
          <p className="text-[#FFC828] text-base font-bold truncate">
            {me.is_groom && "★"}{me.is_kum && "+"}{me.name}
          </p>
          <p className="text-zinc-400 text-xs">
            {formatDrinks(me.total_sips, me.total_shots)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[8px] text-zinc-500">RUNDA</p>
          <p className="text-lg text-[#FFC828]">{state.current_round}</p>
        </div>
      </div>

      {/* Whose turn indicator */}
      <div className={`px-4 py-2 text-center text-xs ${isMyTurn ? "bg-[#FFC828] text-black animate-pulse" : "bg-[#1a1a28] text-zinc-400"}`}>
        {isMyTurn ? "🎯 TVOJ RED!" : `▶ ${currentPlayer?.name || "..."} igra`}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        {state.card_phase === "draw" && (
          <DrawPhase isMyTurn={isMyTurn} currentPlayer={currentPlayer} onDraw={() => recordPlayerAction(code, me.id, "draw_card")} />
        )}

        {state.card_phase === "show" && card && (
          <CardPhase
            card={card}
            role={role}
            isMyTurn={isMyTurn}
            currentPlayer={currentPlayer}
            players={players}
            me={me}
            actedOnCard={actedOnCard}
            onAction={act}
          />
        )}
      </div>

      {/* Bottom mini-HUD */}
      <MiniHUD players={players} currentPlayerName={currentPlayer?.name} meId={me.id} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PHASE COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function DrawPhase({ isMyTurn, currentPlayer, onDraw }: {
  isMyTurn: boolean; currentPlayer?: PlayerRow; onDraw: () => void;
}) {
  if (isMyTurn) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <p className="text-zinc-500 text-xs mb-4">TI SI NA REDU</p>
        <p className="text-2xl text-[#FFC828] mb-8 animate-pulse">VUCI KARTU!</p>
        <button onClick={onDraw}
          className="bg-[#FFC828] text-black font-bold py-8 px-12 text-3xl rounded-2xl active:scale-95 shadow-2xl">
          🎴 VUCI
        </button>
        <p className="text-zinc-500 text-xs mt-6">(ili klikni na TV-u)</p>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <p className="text-zinc-500 text-xs mb-2">SLJEDECI:</p>
      {currentPlayer && (
        <>
          <img src={spriteUrl(currentPlayer.fighter_id)} alt={currentPlayer.name} className="w-24 h-24 pixel-art mb-3" />
          <p className="text-3xl text-[#FFC828]">{currentPlayer.name}</p>
          <p className="text-zinc-500 text-xs mt-6">👀 Pogledaj TV</p>
        </>
      )}
    </div>
  );
}

function CardPhase({ card, role, isMyTurn, currentPlayer, players, me, actedOnCard, onAction }: {
  card: GameCard; role: string; isMyTurn: boolean;
  currentPlayer?: PlayerRow; players: PlayerRow[]; me: PlayerRow;
  actedOnCard: string | null; onAction: (type: string, payload?: Record<string, unknown>) => void;
}) {
  const colors = CARD_COLORS[card.card_type as keyof typeof CARD_COLORS];
  const acted = actedOnCard === card.id;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Card title strip */}
      <div className="rounded-lg p-2 text-center" style={{ backgroundColor: colors?.bg || "#333" }}>
        <p className="text-xs font-bold" style={{ color: colors?.accent }}>{card.title}</p>
      </div>

      {/* Card content */}
      <div className="bg-[#1a1a28] border-2 rounded-xl p-4" style={{ borderColor: colors?.accent }}>
        <p className="text-base text-white text-center leading-relaxed">{card.content}</p>
        {card.content_b && (
          <>
            <p className="text-center text-xs text-zinc-500 my-3">— ILI —</p>
            <p className="text-base text-white text-center leading-relaxed">{card.content_b}</p>
          </>
        )}
        {card.is_groom_targeted && (
          <p className="text-center text-xs text-[#FFC828] mt-3 animate-pulse">★ MLADOZENJA ★</p>
        )}
      </div>

      {/* Spectator notice if not active */}
      {role === "spectator" && (
        <div className="bg-[#1a1a28]/50 border border-zinc-700 rounded-lg p-3 text-center">
          <p className="text-zinc-400 text-sm">👀 Cekamo {currentPlayer?.name}...</p>
          <p className="text-zinc-600 text-xs mt-1">Pogledaj TV</p>
        </div>
      )}

      {/* Acted notice */}
      {acted && role !== "spectator" && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-3 text-center">
          <p className="text-green-400 text-sm">✓ Glas poslan</p>
          <p className="text-zinc-500 text-xs mt-1">Pogledaj TV za rezultate</p>
        </div>
      )}

      {/* Action buttons by card type */}
      {!acted && role !== "spectator" && (
        <div className="flex-1 flex flex-col justify-end pb-2">
          <CardActions card={card} role={role} players={players} me={me} onAction={onAction} />
        </div>
      )}
    </div>
  );
}

// ── Per-card action buttons ──
function CardActions({ card, role, players, me, onAction }: {
  card: GameCard; role: string; players: PlayerRow[]; me: PlayerRow;
  onAction: (type: string, payload?: Record<string, unknown>) => void;
}) {
  // NHIE: everyone presses "ja sam" or "nisam"
  if (card.card_type === "nhie") {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => onAction("nhie_done", { did: true })}
          className="bg-[#DC3232] text-white font-bold py-6 rounded-lg active:scale-95">
          🍺 JESAM (PIJES)
        </button>
        <button onClick={() => onAction("nhie_done", { did: false })}
          className="bg-[#28A050] text-white font-bold py-6 rounded-lg active:scale-95">
          ✓ NISAM
        </button>
      </div>
    );
  }

  // Truth/Dare: did it / chickened
  if (card.card_type === "truth" || card.card_type === "dare" || card.card_type === "groom_special") {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => onAction("did_it")}
          className="bg-[#28A050] text-white font-bold py-6 rounded-lg active:scale-95">
          ✓ {card.card_type === "truth" ? "ODGOVORIO" : "URADIO"}
        </button>
        <button onClick={() => onAction("chicken")}
          className="bg-[#DC3232] text-white font-bold py-6 rounded-lg active:scale-95">
          🐔 KUKAVICA — PIJEM RADIJE
        </button>
      </div>
    );
  }

  // WYR + Hot Take: binary
  if (card.card_type === "wyr" || card.card_type === "hot_take") {
    const labelA = card.card_type === "hot_take" ? "ZA" : "A";
    const labelB = card.card_type === "hot_take" ? "PROTIV" : "B";
    return (
      <div className="flex gap-3">
        <button onClick={() => onAction("vote", { choice: "a" })}
          className="flex-1 bg-[#28A050] text-white font-bold py-8 text-2xl rounded-lg active:scale-95">{labelA}</button>
        <button onClick={() => onAction("vote", { choice: "b" })}
          className="flex-1 bg-[#DC3232] text-white font-bold py-8 text-2xl rounded-lg active:scale-95">{labelB}</button>
      </div>
    );
  }

  // Most Likely / Who In Room / Mate: pick a player
  if (card.card_type === "most_likely" || card.card_type === "who_in_room" || card.card_type === "mate") {
    const targets = card.card_type === "mate" || card.card_type === "who_in_room"
      ? players.filter(p => p.id !== me.id)
      : players;
    return <PlayerGrid players={targets} onPick={(p) => onAction(card.card_type === "most_likely" ? "vote" : "pick", { target_id: p.id, target_name: p.name })} />;
  }

  // Categories / Chaos: just OK
  if (card.card_type === "categories" || card.card_type === "chaos") {
    return (
      <button onClick={() => onAction("acknowledge")}
        className="bg-[#FFC828] text-black font-bold py-6 text-xl rounded-lg active:scale-95">
        OK
      </button>
    );
  }

  // Rule: text input (simplified — host enters via TV)
  if (card.card_type === "rule") {
    return (
      <button onClick={() => onAction("acknowledge")}
        className="bg-[#FFC828] text-black font-bold py-6 text-xl rounded-lg active:scale-95">
        REKAO PRAVILO
      </button>
    );
  }

  // Boss fight or other passive
  return (
    <div className="text-center">
      <p className="text-zinc-500">👀 Pogledaj TV</p>
    </div>
  );
}

function PlayerGrid({ players, onPick }: { players: PlayerRow[]; onPick: (p: PlayerRow) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {players.map(p => (
        <button key={p.id} onClick={() => onPick(p)}
          className="p-2 rounded-lg border-2 border-zinc-700 bg-[#1a1a28] active:scale-95 active:border-[#FFC828]">
          <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-full pixel-art" />
          <p className="text-[8px] mt-1 text-white">{p.name}</p>
        </button>
      ))}
    </div>
  );
}

function MiniHUD({ players, currentPlayerName, meId }: {
  players: PlayerRow[]; currentPlayerName?: string; meId: string;
}) {
  return (
    <div className="bg-black/80 border-t-2 border-[#FFC828] py-1 px-1">
      <div className="flex gap-1 justify-around overflow-x-auto">
        {players.map((p) => {
          const isCurrent = p.name === currentPlayerName;
          const isMe = p.id === meId;
          return (
            <div key={p.id} className={`flex flex-col items-center min-w-[44px] px-1 py-1 rounded ${
              isCurrent ? "bg-[#FFC828]/30" : ""
            } ${isMe ? "border border-[#FFC828]" : ""}`}>
              <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-7 h-7 pixel-art" />
              <p className={`text-[7px] mt-0.5 ${isCurrent ? "text-[#FFC828]" : "text-white"}`}>
                {p.is_groom && "★"}{p.name.slice(0, 6)}
              </p>
              <p className="text-[7px] text-[#FFC828]">{p.total_sips}g</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  getRoom, joinRoom, getPlayers, subscribeToRoom, subscribeToPlayers,
  recordPlayerAction, getOrCreateSessionToken,
} from "@/lib/room";
import { FIGHTERS, spriteUrl } from "@/lib/fighters";
import type { GameState, PlayerRow } from "@/lib/supabase";
import { formatDrinks, getDrunkComment } from "@/lib/cards";

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

  // Initial check: does this player already exist in the room?
  useEffect(() => {
    (async () => {
      try {
        const room = await getRoom(code);
        if (!room) {
          setError("Soba ne postoji ili je istekla");
          setPhase("error");
          return;
        }
        setState(room.state);

        // Check if we already joined (via session token)
        const token = getOrCreateSessionToken();
        const ps = await getPlayers(code);
        setPlayers(ps);
        const existing = ps.find(p => p.session_token === token);
        if (existing) {
          setMe(existing);
          setPhase("in_game");
        } else {
          setPhase("name");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Greska");
        setPhase("error");
      }
    })();
  }, [code]);

  // Subscribe to room and player updates
  useEffect(() => {
    if (phase !== "in_game") return;
    const unsub1 = subscribeToRoom(code, setState);
    const unsub2 = subscribeToPlayers(code, (ps) => {
      setPlayers(ps);
      // Update self
      if (me) {
        const updated = ps.find(p => p.id === me.id);
        if (updated) setMe(updated);
      }
    });
    return () => { unsub1(); unsub2(); };
  }, [phase, code, me]);

  const handleNameSubmit = () => {
    if (name.trim().length < 1) return;
    setPhase("fighter");
  };

  const handleJoin = async () => {
    if (!selectedFighter) return;
    setBusy(true);
    try {
      const isGroom = selectedFighter === "matija";
      const isKum = selectedFighter === "pasko";
      const player = await joinRoom(code, name, selectedFighter, isGroom, isKum);
      setMe(player);
      setPhase("in_game");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greska");
    }
    setBusy(false);
  };

  // Available fighters (not already taken)
  const takenFighterIds = new Set(players.map(p => p.fighter_id));

  // ── PHASE: ERROR ──
  if (phase === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="text-[#DC3232] text-xl mb-4">{error}</p>
        <button onClick={() => router.push("/")} className="bg-[#FFC828] text-black px-6 py-3 rounded-lg">
          Natrag
        </button>
      </div>
    );
  }

  // ── PHASE: LOADING ──
  if (phase === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-zinc-400">Ucitavanje...</div>;
  }

  // ── PHASE: NAME ENTRY ──
  if (phase === "name") {
    return (
      <div className="min-h-screen flex flex-col p-6 pt-12">
        <p className="text-zinc-400 text-xs text-center mb-2">SOBA</p>
        <p className="text-[#FFC828] text-3xl text-center mb-8 tracking-[0.3em]">{code}</p>

        <h1 className="text-2xl text-center mb-6 text-[#FFC828]">Kako se zoves?</h1>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 12))}
          maxLength={12}
          placeholder="TVOJE IME"
          className="bg-[#1a1a28] border-2 border-[#FFC828] text-center text-2xl py-4 px-6 rounded-lg uppercase text-white focus:outline-none focus:border-[#FFD850] mb-6"
          autoFocus
        />
        <button
          onClick={handleNameSubmit}
          disabled={!name.trim()}
          className="bg-[#FFC828] text-black font-bold py-4 text-xl rounded-lg disabled:opacity-30 active:scale-95"
        >
          DALJE
        </button>
      </div>
    );
  }

  // ── PHASE: FIGHTER PICK ──
  if (phase === "fighter") {
    return (
      <div className="min-h-screen flex flex-col p-4 pt-6">
        <p className="text-center text-zinc-400 text-sm mb-2">{name}</p>
        <h1 className="text-xl text-center mb-2 text-[#FFC828]">Odaberi lika</h1>
        <p className="text-xs text-center text-zinc-500 mb-4">Matija = Mladozenja, Pasko = Kum</p>

        <div className="grid grid-cols-3 gap-2 mb-6">
          {FIGHTERS.map((f) => {
            const isTaken = takenFighterIds.has(f.id);
            const isSelected = selectedFighter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => !isTaken && setSelectedFighter(f.id)}
                disabled={isTaken}
                className={`p-2 rounded-lg border-2 transition ${
                  isSelected
                    ? "border-[#FFC828] bg-[#FFC828]/20 scale-105"
                    : isTaken
                      ? "border-zinc-800 bg-zinc-900/50 opacity-30"
                      : "border-zinc-700 bg-[#1a1a28] active:scale-95"
                }`}
              >
                {f.has_sprite ? (
                  <img src={spriteUrl(f.id)} alt={f.name} className="w-full pixel-art" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center text-3xl text-zinc-500">?</div>
                )}
                <p className="text-[8px] mt-1 text-center text-white">{f.name}</p>
                {f.is_groom && <p className="text-[6px] text-[#FFC828] text-center">MLADOZENJA</p>}
                {f.is_kum && <p className="text-[6px] text-[#DCA014] text-center">KUM</p>}
                {isTaken && <p className="text-[6px] text-red-500 text-center">UZET</p>}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleJoin}
          disabled={!selectedFighter || busy}
          className="bg-[#FFC828] text-black font-bold py-4 text-xl rounded-lg disabled:opacity-30 active:scale-95"
        >
          {busy ? "..." : "UDJI U IGRU"}
        </button>
        <button
          onClick={() => setPhase("name")}
          className="text-zinc-500 underline text-sm mt-3"
        >
          Natrag
        </button>
      </div>
    );
  }

  // ── PHASE: IN GAME ──
  if (phase === "in_game" && me && state) {
    return <PlayerInGame me={me} state={state} players={players} code={code} />;
  }

  return null;
}

// ── IN-GAME PLAYER VIEW ──
function PlayerInGame({ me, state, players, code }: {
  me: PlayerRow;
  state: GameState;
  players: PlayerRow[];
  code: string;
}) {
  const isMyTurn = players[state.current_player_idx]?.id === me.id;
  const card = state.current_card;

  // ── LOBBY (waiting for game to start) ──
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

  // ── PLAYING ──
  if (state.phase === "playing") {
    return (
      <div className="min-h-screen flex flex-col p-4">
        {/* Top — me */}
        <div className="flex items-center gap-3 bg-[#1a1a28] rounded-lg p-3 mb-4">
          <img src={spriteUrl(me.fighter_id)} alt={me.name} className="w-12 h-12 pixel-art" />
          <div className="flex-1">
            <p className="text-[#FFC828] text-base font-bold">{me.name}</p>
            <p className="text-zinc-400 text-xs">
              {formatDrinks(me.total_sips, me.total_shots)} • {getDrunkComment(me.total_sips, me.total_shots)}
            </p>
          </div>
          {me.is_groom && <span className="text-[#FFC828] text-xs">MLADOZENJA</span>}
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {isMyTurn && state.card_phase === "draw" && (
            <div className="text-center">
              <p className="text-2xl text-[#FFC828] mb-4 animate-pulse">TVOJ RED!</p>
              <p className="text-sm text-zinc-400 mb-6">Vuci kartu na TV ekranu</p>
              <button
                onClick={async () => {
                  await recordPlayerAction(code, me.id, "draw_card");
                }}
                className="bg-[#FFC828] text-black font-bold py-6 px-12 text-2xl rounded-xl active:scale-95"
              >
                VUCI KARTU
              </button>
            </div>
          )}

          {!isMyTurn && state.card_phase === "draw" && (
            <div className="text-center">
              <p className="text-zinc-400 text-sm mb-4">Red:</p>
              <p className="text-4xl text-[#FFC828]">{players[state.current_player_idx]?.name}</p>
              <p className="text-zinc-500 text-xs mt-4">Pricekaj svoj red...</p>
            </div>
          )}

          {state.card_phase === "show" && card && (
            <div className="text-center w-full max-w-md">
              <p className="text-xs text-zinc-500 mb-2">{card.title}</p>
              <p className="text-lg text-white mb-6">{card.content}</p>
              {card.content_b && (
                <>
                  <p className="text-zinc-500 text-xs my-2">— ILI —</p>
                  <p className="text-lg text-white mb-6">{card.content_b}</p>
                </>
              )}

              {/* Action buttons based on card type */}
              {(card.card_type === "truth" || card.card_type === "dare" || card.card_type === "groom_special") && isMyTurn && (
                <div className="flex flex-col gap-3 mt-6">
                  <button
                    onClick={() => recordPlayerAction(code, me.id, "did_it", {}, card.id)}
                    className="bg-[#28A050] text-white font-bold py-4 rounded-lg active:scale-95"
                  >
                    NAPRAVIO/ODGOVORIO
                  </button>
                  <button
                    onClick={() => recordPlayerAction(code, me.id, "chicken", {}, card.id)}
                    className="bg-[#DC3232] text-white font-bold py-4 rounded-lg active:scale-95"
                  >
                    PIJEM RADIJE
                  </button>
                </div>
              )}

              {(card.card_type === "wyr" || card.card_type === "hot_take") && (
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => recordPlayerAction(code, me.id, "vote", { choice: "a" }, card.id)}
                    className="flex-1 bg-[#28A050] text-white font-bold py-6 rounded-lg active:scale-95"
                  >
                    {card.card_type === "hot_take" ? "ZA" : "A"}
                  </button>
                  <button
                    onClick={() => recordPlayerAction(code, me.id, "vote", { choice: "b" }, card.id)}
                    className="flex-1 bg-[#DC3232] text-white font-bold py-6 rounded-lg active:scale-95"
                  >
                    {card.card_type === "hot_take" ? "PROTIV" : "B"}
                  </button>
                </div>
              )}

              {card.card_type === "most_likely" && (
                <PlayerVoteGrid
                  players={players}
                  cardId={card.id}
                  code={code}
                  meId={me.id}
                />
              )}

              {(card.card_type === "who_in_room" || card.card_type === "mate") && isMyTurn && (
                <PlayerVoteGrid
                  players={players.filter(p => p.id !== me.id)}
                  cardId={card.id}
                  code={code}
                  meId={me.id}
                  actionType="pick"
                />
              )}

              {(card.card_type === "nhie" || card.card_type === "categories" || card.card_type === "chaos") && (
                <div className="mt-6">
                  <p className="text-zinc-400 text-xs">{card.instruction}</p>
                </div>
              )}
            </div>
          )}
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

  return null;
}

function PlayerVoteGrid({ players, cardId, code, meId, actionType = "vote" }: {
  players: PlayerRow[];
  cardId: string;
  code: string;
  meId: string;
  actionType?: string;
}) {
  const [voted, setVoted] = useState(false);
  return (
    <div className="grid grid-cols-3 gap-2 mt-4">
      {players.map(p => (
        <button
          key={p.id}
          disabled={voted}
          onClick={async () => {
            await recordPlayerAction(code, meId, actionType, { target_id: p.id, target_name: p.name }, cardId);
            setVoted(true);
          }}
          className={`p-2 rounded-lg border-2 transition ${
            voted ? "border-zinc-800 opacity-30" : "border-zinc-700 bg-[#1a1a28] active:scale-95 active:border-[#FFC828]"
          }`}
        >
          <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-full pixel-art" />
          <p className="text-[8px] mt-1 text-white">{p.name}</p>
        </button>
      ))}
    </div>
  );
}

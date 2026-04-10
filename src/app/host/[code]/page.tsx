"use client";

import { useEffect, useState, useCallback, use, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  getRoom, updateRoomState, getPlayers, applyDrinks,
  subscribeToRoom, subscribeToPlayers, subscribeToActions,
} from "@/lib/room";
import {
  drawCard, applyGroomTax, applyMates, ROUND_NAMES, ROUND_SUBTITLES,
  CARD_COLORS, formatDrinks, getDrunkComment,
} from "@/lib/cards";
import type { GameState, GameCard, PlayerRow, DrinkPenalty, VoteState } from "@/lib/supabase";
import { spriteUrl } from "@/lib/fighters";

const CARDS_PER_ROUND = 30;

export default function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [state, setState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [joinUrl, setJoinUrl] = useState("");
  const [pendingPenalties, setPendingPenalties] = useState<DrinkPenalty[]>([]);
  const [showSplash, setShowSplash] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioStarted, setAudioStarted] = useState(false);

  // Set join URL based on current location
  useEffect(() => {
    if (typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/play/${code}`);
    }
  }, [code]);

  // Initial load
  useEffect(() => {
    (async () => {
      const room = await getRoom(code);
      if (room) setState(room.state);
      const ps = await getPlayers(code);
      setPlayers(ps);
    })();
  }, [code]);

  // Subscribe to room state changes
  useEffect(() => {
    return subscribeToRoom(code, (newState) => setState(newState));
  }, [code]);

  // Subscribe to player changes
  useEffect(() => {
    return subscribeToPlayers(code, (ps) => setPlayers(ps));
  }, [code]);

  // Subscribe to player actions and resolve them server-side (host)
  useEffect(() => {
    return subscribeToActions(code, async (action) => {
      // Always re-fetch fresh state because closure may be stale
      const room = await getRoom(code);
      if (!room) return;
      const fresh = room.state;
      const ps = await getPlayers(code);
      if (!fresh.current_card) return;

      // Player asked to draw their card on their turn
      if (action.action_type === "draw_card" && fresh.card_phase === "draw") {
        // The host's drawNewCard runs from the TV side, but allow phones to trigger it too
        const isGroomTurn = ps[fresh.current_player_idx]?.is_groom || false;
        const card = drawCard({
          currentRound: fresh.current_round,
          isGroomTurn,
          bossFightCooldown: 99,
        });
        await updateRoomState(code, { ...fresh, current_card: card, card_phase: "show" });
        return;
      }

      // Truth/Dare/Groom Special: did_it or chickened
      if (fresh.current_card && action.action_type === "did_it") {
        // No drink for the player; just advance
        await advanceTurnInternal(code, fresh, ps);
        return;
      }
      if (fresh.current_card && action.action_type === "chicken") {
        const player = ps.find(p => p.id === action.player_id);
        if (player) {
          let penalties: DrinkPenalty[] = [{
            player_name: player.name,
            sips: fresh.current_card.drink_penalty_skip,
            shots: 0,
            reason: "KUKAVICA!",
          }];
          penalties = applyMates(penalties, ps);
          penalties = applyGroomTax(penalties, ps, fresh.current_round);
          await applyDrinks(code, penalties);
        }
        await advanceTurnInternal(code, fresh, ps);
        return;
      }

      // Pick card (who_in_room, mate)
      if (fresh.current_card && action.action_type === "pick") {
        const targetName = (action.payload as { target_name?: string }).target_name;
        if (targetName) {
          let penalties: DrinkPenalty[] = [{
            player_name: targetName,
            sips: fresh.current_card.drink_penalty,
            shots: 0,
            reason: `${targetName} pije ${fresh.current_card.drink_penalty}!`,
          }];
          penalties = applyMates(penalties, ps);
          penalties = applyGroomTax(penalties, ps, fresh.current_round);
          await applyDrinks(code, penalties);
        }
        await advanceTurnInternal(code, fresh, ps);
        return;
      }

      // Vote cards (most_likely, hot_take, wyr): collect all votes, then resolve
      if (fresh.current_card && action.action_type === "vote") {
        // Re-fetch action count for this card
        const allActions = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/player_actions?room_code=eq.${code}&card_id=eq.${fresh.current_card.id}&action_type=eq.vote`,
          {
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
            },
          },
        ).then(r => r.json()).catch(() => []);

        // Wait until all players have voted
        if (Array.isArray(allActions) && allActions.length >= ps.length) {
          await resolveVoteCard(code, fresh, ps, allActions);
        }
      }
    });
  }, [code]);

  async function advanceTurnInternal(roomCode: string, currentState: GameState, ps: PlayerRow[]) {
    const newCardsInRound = currentState.cards_in_round + 1;
    let newRound = currentState.current_round;
    let cardsInRound = newCardsInRound;
    let phase: GameState["phase"] = currentState.phase;

    if (newCardsInRound >= CARDS_PER_ROUND) {
      if (currentState.current_round < 3) {
        newRound = currentState.current_round + 1;
        cardsInRound = 0;
      } else {
        phase = "ended";
      }
    }
    const newPlayerIdx = (currentState.current_player_idx + 1) % ps.length;
    await updateRoomState(roomCode, {
      ...currentState,
      current_player_idx: newPlayerIdx,
      cards_in_round: cardsInRound,
      total_cards_drawn: currentState.total_cards_drawn + 1,
      current_round: newRound,
      current_card: null,
      card_phase: "draw",
      vote_state: null,
      phase,
    });
  }

  async function resolveVoteCard(
    roomCode: string,
    currentState: GameState,
    ps: PlayerRow[],
    actions: Array<{ player_id: string; payload: { choice?: string; target_name?: string } }>,
  ) {
    const card = currentState.current_card;
    if (!card) return;

    let penalties: DrinkPenalty[] = [];

    if (card.card_type === "wyr" || card.card_type === "hot_take") {
      const aCount = actions.filter(a => a.payload.choice === "a").length;
      const bCount = actions.filter(a => a.payload.choice === "b").length;
      let losers: typeof ps = [];
      if (aCount === bCount) {
        losers = ps;
      } else if (aCount < bCount) {
        losers = ps.filter(p => actions.find(a => a.player_id === p.id)?.payload.choice === "a");
      } else {
        losers = ps.filter(p => actions.find(a => a.player_id === p.id)?.payload.choice === "b");
      }
      penalties = losers.map(p => ({
        player_name: p.name,
        sips: card.drink_penalty,
        shots: 0,
        reason: "MANJINA PIJE!",
      }));
    } else if (card.card_type === "most_likely") {
      const tally: Record<string, number> = {};
      for (const a of actions) {
        const t = a.payload.target_name;
        if (t) tally[t] = (tally[t] || 0) + 1;
      }
      if (Object.keys(tally).length > 0) {
        const max = Math.max(...Object.values(tally));
        const winners = Object.entries(tally).filter(([, c]) => c === max).map(([n]) => n);
        penalties = winners.map(name => ({
          player_name: name,
          sips: card.drink_penalty,
          shots: 0,
          reason: `${max} glasova!`,
        }));
      }
    }

    penalties = applyMates(penalties, ps);
    penalties = applyGroomTax(penalties, ps, currentState.current_round);
    await applyDrinks(roomCode, penalties);
    await advanceTurnInternal(roomCode, currentState, ps);
  }

  // Wake lock so TV doesn't sleep
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then(w => { wakeLock = w; }).catch(() => {});
    }
    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, []);

  const startGame = async () => {
    if (!state || players.length < 2) return;
    setAudioStarted(true);
    const newState: GameState = {
      ...state,
      phase: "playing",
      current_round: 1,
      cards_in_round: 0,
      total_cards_drawn: 0,
      current_player_idx: 0,
      card_phase: "draw",
    };
    await updateRoomState(code, newState);
    playPhaseMusic("round1");
  };

  const drawNewCard = async () => {
    if (!state || players.length === 0) return;
    const isGroomTurn = players[state.current_player_idx]?.is_groom || false;
    const card = drawCard({
      currentRound: state.current_round,
      isGroomTurn,
      bossFightCooldown: 99,
    });
    const newState: GameState = {
      ...state,
      current_card: card,
      card_phase: "show",
      vote_state: card.target_type === "vote"
        ? { type: card.card_type === "wyr" || card.card_type === "hot_take" ? "binary" : "group_pick", votes: {} }
        : null,
    };
    await updateRoomState(code, newState);
  };

  const advanceTurn = async () => {
    if (!state || players.length === 0) return;
    const newCardsInRound = state.cards_in_round + 1;
    const newTotalCards = state.total_cards_drawn + 1;
    let newRound = state.current_round;
    let cardsInRound = newCardsInRound;
    let phase: GameState["phase"] = state.phase;

    if (newCardsInRound >= CARDS_PER_ROUND) {
      if (state.current_round < 3) {
        newRound = state.current_round + 1;
        cardsInRound = 0;
        phase = "round_transition";
        playPhaseMusic(`round${newRound}`);
      } else {
        phase = "ended";
      }
    }

    const newPlayerIdx = (state.current_player_idx + 1) % players.length;
    const newState: GameState = {
      ...state,
      current_player_idx: newPlayerIdx,
      cards_in_round: cardsInRound,
      total_cards_drawn: newTotalCards,
      current_round: newRound,
      current_card: null,
      card_phase: "draw",
      vote_state: null,
      phase,
    };
    await updateRoomState(code, newState);
  };

  const playPhaseMusic = useCallback((phase: string) => {
    if (!audioStarted) return;
    // Random track from playlist matching the phase mood
    const tracks: Record<string, string[]> = {
      round1: ["/music/12_SINA/Still DRE - Dr Dre feat Snoop Dogg.mp3", "/music/06_DENIS/Africa - Toto.mp3"],
      round2: ["/music/01_PASKO/Killing In The Name - RATM.mp3", "/music/13_MATIJA/Thunderstruck - ACDC.mp3"],
      round3: ["/music/04_FIXX/Enter Sandman - Metallica.mp3", "/music/01_PASKO/Chop Suey - SOAD.mp3"],
      victory: ["/music/11_RUKAVINA/We Are The Champions - Queen.mp3"],
    };
    const pool = tracks[phase] || tracks.round1;
    const url = pool[Math.floor(Math.random() * pool.length)];
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.volume = 0.3;
      audioRef.current.play().catch(() => {});
    }
  }, [audioStarted]);

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0c0c14] text-white">
        Ucitavanje...
      </div>
    );
  }

  // ── LOBBY PHASE ──
  if (state.phase === "lobby") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c14] text-white p-8">
        <h1 className="text-6xl md:text-8xl font-bold text-[#FFC828] mb-2 tracking-wider">BACHELOR</h1>
        <h2 className="text-5xl md:text-7xl font-bold text-[#DC3232] mb-12 tracking-wider">SPECIAL</h2>

        <div className="flex flex-col md:flex-row gap-12 items-center">
          {/* QR Code */}
          <div className="bg-white p-6 rounded-2xl">
            <QRCodeSVG value={joinUrl} size={280} level="H" />
          </div>

          {/* Join info */}
          <div className="text-center md:text-left">
            <p className="text-zinc-400 text-sm mb-2">SKENIRAJ S MOBITELOM</p>
            <p className="text-zinc-400 text-sm mb-4">ili udji na:</p>
            <p className="text-2xl text-[#FFC828] mb-2 break-all">{joinUrl}</p>
            <p className="text-zinc-500 text-xs mt-4 mb-2">KOD SOBE</p>
            <p className="text-7xl md:text-9xl font-bold text-[#FFC828] tracking-[0.2em]">{code}</p>
          </div>
        </div>

        {/* Players list */}
        <div className="mt-12 w-full max-w-4xl">
          <p className="text-center text-zinc-400 mb-4">
            IGRACI: {players.length} / 15
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            {players.map((p) => (
              <div key={p.id} className="bg-[#1a1a28] border border-[#FFC828]/30 rounded-lg p-3 flex flex-col items-center w-28">
                <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-16 h-16 pixel-art" />
                <p className="text-xs mt-1 text-white truncate w-full text-center">{p.name}</p>
                {p.is_groom && <p className="text-xs text-[#FFC828]">MLADOZENJA</p>}
                {p.is_kum && <p className="text-xs text-[#DCA014]">KUM</p>}
              </div>
            ))}
          </div>
        </div>

        {players.length >= 2 && (
          <button
            onClick={startGame}
            className="mt-8 bg-[#FFC828] text-black font-bold py-4 px-12 text-2xl rounded-lg hover:bg-[#FFD850] active:scale-95 transition shadow-2xl animate-pulse-glow"
          >
            POKRENI IGRU
          </button>
        )}
      </div>
    );
  }

  // ── PLAYING PHASE ──
  if (state.phase === "playing") {
    const currentPlayer = players[state.current_player_idx];
    const card = state.current_card;

    return (
      <div className="min-h-screen flex flex-col bg-[#0c0c14] text-white">
        {/* Top bar — round info */}
        <div className="px-6 py-3 bg-black/40 flex justify-between items-center">
          <div className="text-sm text-zinc-400">
            Runda {state.current_round}: <span className="text-[#FFC828]">{ROUND_NAMES[state.current_round]}</span>
          </div>
          <div className="text-sm text-zinc-400">
            Karta {state.cards_in_round + 1}/{CARDS_PER_ROUND}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {state.card_phase === "draw" && currentPlayer && (
            <div className="text-center">
              <img
                src={spriteUrl(currentPlayer.fighter_id)}
                alt={currentPlayer.name}
                className="w-48 h-48 mx-auto pixel-art animate-pulse-glow"
              />
              <h2 className="text-6xl text-[#FFC828] mt-6 mb-2">{currentPlayer.name}</h2>
              <p className="text-zinc-400 text-xl mb-2">
                {formatDrinks(currentPlayer.total_sips, currentPlayer.total_shots)}
              </p>
              <p className="text-zinc-500 text-sm mb-8">
                {getDrunkComment(currentPlayer.total_sips, currentPlayer.total_shots)}
              </p>
              <button
                onClick={drawNewCard}
                className="bg-[#FFC828] text-black font-bold py-6 px-12 text-3xl rounded-xl hover:bg-[#FFD850] transition animate-pulse-glow"
              >
                VUCI KARTU
              </button>
            </div>
          )}

          {state.card_phase === "show" && card && (
            <CardDisplay card={card} />
          )}
        </div>

        {/* Bottom HUD — players bar */}
        <PlayerHUD players={players} currentPlayerName={currentPlayer?.name} />

        {/* Hidden audio element */}
        <audio ref={audioRef} loop />

        {/* Test controls (host only) */}
        {state.card_phase === "show" && (
          <button
            onClick={advanceTurn}
            className="fixed top-4 right-4 bg-zinc-800 text-white px-4 py-2 rounded text-sm"
          >
            Sljedeci →
          </button>
        )}
      </div>
    );
  }

  // ── ENDED ──
  if (state.phase === "ended") {
    const ranked = [...players].sort((a, b) => (b.total_sips + b.total_shots * 3) - (a.total_sips + a.total_shots * 3));
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c14] text-white p-8">
        <h1 className="text-6xl text-[#FFC828] mb-8">JUTRO POSLIJE</h1>
        <div className="space-y-2 max-w-2xl w-full">
          {ranked.map((p, i) => (
            <div key={p.id} className="flex items-center gap-4 bg-[#1a1a28] p-3 rounded-lg">
              <span className="text-2xl text-[#FFC828] w-12">{i + 1}.</span>
              <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-12 h-12 pixel-art" />
              <span className="text-xl flex-1">{p.name}{p.is_groom && " *"}{p.is_kum && " +"}</span>
              <span className="text-xl text-[#FFC828]">{formatDrinks(p.total_sips, p.total_shots)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// ── CARD DISPLAY ──
function CardDisplay({ card }: { card: GameCard }) {
  const colors = CARD_COLORS[card.card_type as keyof typeof CARD_COLORS];
  return (
    <div
      className="rounded-2xl border-4 p-12 max-w-4xl w-full shadow-2xl"
      style={{
        backgroundColor: colors?.bg || "#333",
        borderColor: colors?.accent || "#888",
        color: colors?.text || "#fff",
      }}
    >
      <h2 className="text-3xl md:text-5xl font-bold text-center mb-2 tracking-wider">
        {card.title}
      </h2>
      <div className="border-t-2 my-6 opacity-50" style={{ borderColor: colors?.accent }} />
      <p className="text-2xl md:text-4xl text-center leading-relaxed py-8">
        {card.content}
      </p>
      {card.content_b && (
        <>
          <p className="text-center text-xl my-4 opacity-70">— ILI —</p>
          <p className="text-2xl md:text-4xl text-center leading-relaxed py-8">
            {card.content_b}
          </p>
        </>
      )}
      {card.instruction && (
        <p className="text-center text-xl mt-6" style={{ color: colors?.accent }}>
          {card.instruction}
        </p>
      )}
      {card.is_groom_targeted && (
        <p className="text-center text-2xl mt-4 text-[#FFC828] animate-pulse">
          ★ MLADOZENJA ★
        </p>
      )}
    </div>
  );
}

// ── PLAYER HUD ──
function PlayerHUD({ players, currentPlayerName }: { players: PlayerRow[]; currentPlayerName?: string }) {
  return (
    <div className="bg-black/80 border-t-2 border-[#FFC828] py-2 px-2">
      <div className="flex gap-1 justify-around overflow-x-auto">
        {players.map((p) => {
          const isCurrent = p.name === currentPlayerName;
          return (
            <div
              key={p.id}
              className={`flex flex-col items-center min-w-[60px] px-1 py-1 rounded ${
                isCurrent ? "bg-[#FFC828]/20 border border-[#FFC828]" : ""
              }`}
            >
              <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-8 h-8 pixel-art" />
              <p className={`text-[8px] mt-1 ${isCurrent ? "text-[#FFC828]" : "text-white"}`}>
                {p.is_groom && "★"}{p.name.slice(0, 7)}
              </p>
              <p className="text-[8px] text-[#FFC828]">{p.total_sips}g{p.total_shots > 0 && ` ${p.total_shots}sh`}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

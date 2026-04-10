"use client";

// LOCAL MODE — fully offline single-screen drinking game.
// No Supabase, no phones, no internet required (after first visit).
// Pass the device around the table.

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  drawCard, applyGroomTax, applyMates, ROUND_NAMES,
  CARD_COLORS, formatDrinks, getDrunkComment,
} from "@/lib/cards";
import type { GameCard, DrinkPenalty } from "@/lib/supabase";
import { FIGHTERS, spriteUrl } from "@/lib/fighters";
import playlist from "@/data/playlist.json";

const CARDS_PER_ROUND = 30;

interface LocalPlayer {
  id: string;
  name: string;
  fighter_id: string;
  is_groom: boolean;
  is_kum: boolean;
  total_sips: number;
  total_shots: number;
  chickened_out_count: number;
  cards_drawn: number;
  mates: string[];
}

interface PlaylistTrack { name: string; url: string; fighter_id: string | null; }

type Phase = "setup" | "playing" | "ended";
type CardPhase = "draw" | "show" | "voting" | "result";

export default function LocalGamePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("setup");
  const [players, setPlayers] = useState<LocalPlayer[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [cardsInRound, setCardsInRound] = useState(0);
  const [card, setCard] = useState<GameCard | null>(null);
  const [cardPhase, setCardPhase] = useState<CardPhase>("draw");
  const [voteState, setVoteState] = useState<{ voterIdx: number; votes: Record<string, string> } | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onYes: () => void } | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // Music
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioStarted, setAudioStarted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.3);
  const [musicMuted, setMusicMuted] = useState(false);
  const [musicPaused, setMusicPaused] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<string>("");
  const trackHistoryRef = useRef<PlaylistTrack[]>([]);
  const trackHistoryPosRef = useRef<number>(-1);
  const tracks = playlist as PlaylistTrack[];

  // Wake lock
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then(w => { wakeLock = w; }).catch(() => {});
    }
    return () => { if (wakeLock) wakeLock.release().catch(() => {}); };
  }, []);

  const playTrack = useCallback((track: PlaylistTrack, recordHistory = true) => {
    if (!audioRef.current) return;
    audioRef.current.src = track.url;
    audioRef.current.volume = musicMuted ? 0 : musicVolume;
    audioRef.current.play().catch(() => {});
    setCurrentTrack(track.name);
    setMusicPaused(false);
    if (recordHistory) {
      const hist = trackHistoryRef.current.slice(0, trackHistoryPosRef.current + 1);
      hist.push(track);
      trackHistoryRef.current = hist;
      trackHistoryPosRef.current = hist.length - 1;
    }
  }, [musicVolume, musicMuted]);

  const playRandomTrack = useCallback((phasePool?: string[]) => {
    if (!audioRef.current) return;
    let candidates: PlaylistTrack[];
    if (phasePool && phasePool.length > 0) {
      candidates = tracks.filter(t => phasePool.some(name => t.name.includes(name)));
      if (candidates.length === 0) candidates = tracks;
    } else candidates = tracks;
    if (candidates.length > 1 && currentTrack) candidates = candidates.filter(t => t.name !== currentTrack);
    const t = candidates[Math.floor(Math.random() * candidates.length)];
    playTrack(t);
  }, [tracks, currentTrack, playTrack]);

  const nextTrack = () => playRandomTrack();
  const prevTrack = () => {
    if (trackHistoryPosRef.current > 0) {
      trackHistoryPosRef.current -= 1;
      const t = trackHistoryRef.current[trackHistoryPosRef.current];
      if (t) playTrack(t, false);
    }
  };
  const togglePause = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) { audioRef.current.play().catch(() => {}); setMusicPaused(false); }
    else { audioRef.current.pause(); setMusicPaused(true); }
  };
  const toggleMute = () => {
    setMusicMuted(m => {
      const next = !m;
      if (audioRef.current) audioRef.current.volume = next ? 0 : musicVolume;
      return next;
    });
  };

  // ────────────────────────────────────────────────────────────────────
  // GAME ACTIONS
  // ────────────────────────────────────────────────────────────────────

  const startGame = async (newPlayers: LocalPlayer[]) => {
    setPlayers(newPlayers);
    setPhase("playing");
    setCurrentRound(1);
    setCardsInRound(0);
    setCurrentPlayerIdx(0);
    setCardPhase("draw");
    setAudioStarted(true);

    // Play music DIRECTLY in this click handler to satisfy autoplay policy
    if (audioRef.current) {
      const phasePool = ["Still DRE", "Africa", "Beat It", "Holy Diver"];
      let candidates = tracks.filter(t => phasePool.some(name => t.name.includes(name)));
      if (candidates.length === 0) candidates = tracks;
      const t = candidates[Math.floor(Math.random() * candidates.length)];
      audioRef.current.src = t.url;
      audioRef.current.volume = musicMuted ? 0 : musicVolume;
      try {
        await audioRef.current.play();
        setCurrentTrack(t.name);
        trackHistoryRef.current = [t];
        trackHistoryPosRef.current = 0;
      } catch (err) {
        console.error("Music autoplay blocked:", err);
      }
    }
  };

  const drawNewCard = () => {
    if (players.length === 0) return;
    const isGroomTurn = players[currentPlayerIdx]?.is_groom || false;
    const newCard = drawCard({ currentRound, isGroomTurn, bossFightCooldown: 99 });
    setCard(newCard);
    setCardPhase("show");
    setVoteState(null);
    setResultMessage(null);
  };

  const applyDrinks = useCallback((penalties: DrinkPenalty[]) => {
    // Build full penalty list (mates + groom tax)
    // We use a temp player array for resolution
    const playersAsRows = players.map(p => ({ ...p })) as unknown as Parameters<typeof applyMates>[1];
    const withMates = applyMates(penalties, playersAsRows);
    const withTax = applyGroomTax(withMates, playersAsRows, currentRound);

    // Apply to state
    setPlayers(prev => {
      const map = new Map(prev.map(p => [p.name, { ...p }]));
      for (const pen of withTax) {
        const p = map.get(pen.player_name);
        if (p) {
          p.total_sips += pen.sips;
          p.total_shots += pen.shots;
        }
      }
      return Array.from(map.values()).sort((a, b) =>
        prev.findIndex(x => x.id === a.id) - prev.findIndex(x => x.id === b.id)
      );
    });

    // Show summary
    const summary = withTax
      .filter(p => p.sips > 0 || p.shots > 0)
      .map(p => `${p.player_name}: ${formatDrinks(p.sips, p.shots)} ${p.reason ? `(${p.reason})` : ""}`)
      .join("\n");
    if (summary) setResultMessage(summary);
  }, [players, currentRound]);

  const advanceTurn = useCallback(() => {
    setCard(null);
    setCardPhase("draw");
    setVoteState(null);
    setResultMessage(null);
    const newCardsInRound = cardsInRound + 1;
    if (newCardsInRound >= CARDS_PER_ROUND) {
      if (currentRound < 3) {
        const newRound = currentRound + 1;
        setCurrentRound(newRound);
        setCardsInRound(0);
        const phasePools: Record<number, string[]> = {
          2: ["Killing In", "Thunderstruck", "Faint", "Bodies"],
          3: ["Enter Sandman", "Chop Suey", "Duality", "Through The Fire"],
        };
        playRandomTrack(phasePools[newRound]);
      } else {
        setPhase("ended");
        playRandomTrack(["We Are The Champions"]);
        return;
      }
    } else {
      setCardsInRound(newCardsInRound);
    }
    setCurrentPlayerIdx((idx) => (idx + 1) % players.length);
  }, [cardsInRound, currentRound, players.length, playRandomTrack]);

  // ── Card-specific resolvers ──
  const handleNhieDone = (player: LocalPlayer, did: boolean) => {
    if (!card) return;
    if (did) {
      applyDrinks([{ player_name: player.name, sips: card.drink_penalty, shots: 0, reason: "Ja sam!" }]);
    }
    setTimeout(() => advanceTurn(), 800);
  };

  const handleTruthDareDone = (didIt: boolean) => {
    if (!card || players.length === 0) return;
    const current = players[currentPlayerIdx];
    if (!didIt) {
      applyDrinks([{ player_name: current.name, sips: card.drink_penalty_skip, shots: 0, reason: "KUKAVICA!" }]);
      setPlayers(prev => prev.map((p, i) => i === currentPlayerIdx ? { ...p, chickened_out_count: p.chickened_out_count + 1 } : p));
    } else if (card.card_type === "groom_special" && current.is_groom) {
      applyDrinks([{ player_name: current.name, sips: card.drink_penalty, shots: 0, reason: "Mladozenja pije svejedno!" }]);
    }
    setTimeout(() => advanceTurn(), didIt && card.card_type !== "groom_special" ? 200 : 1500);
  };

  const startBinaryVote = () => {
    setCardPhase("voting");
    setVoteState({ voterIdx: 0, votes: {} });
  };

  const handleBinaryVote = (choice: "a" | "b") => {
    if (!voteState || !card) return;
    const newVotes = { ...voteState.votes, [players[voteState.voterIdx].id]: choice };
    if (voteState.voterIdx + 1 < players.length) {
      setVoteState({ voterIdx: voteState.voterIdx + 1, votes: newVotes });
    } else {
      // Tally
      const aCount = Object.values(newVotes).filter(v => v === "a").length;
      const bCount = Object.values(newVotes).filter(v => v === "b").length;
      let losers: LocalPlayer[] = [];
      if (aCount === bCount) losers = players;
      else if (aCount < bCount) losers = players.filter(p => newVotes[p.id] === "a");
      else losers = players.filter(p => newVotes[p.id] === "b");
      const penalties = losers.map(p => ({ player_name: p.name, sips: card.drink_penalty, shots: 0, reason: "MANJINA PIJE!" }));
      applyDrinks(penalties);
      setVoteState(null);
      setCardPhase("result");
      setTimeout(() => advanceTurn(), 4000);
    }
  };

  const startGroupPick = () => {
    setCardPhase("voting");
    setVoteState({ voterIdx: 0, votes: {} });
  };

  const handleGroupPick = (targetName: string) => {
    if (!voteState || !card) return;
    const newVotes = { ...voteState.votes, [players[voteState.voterIdx].id]: targetName };
    if (voteState.voterIdx + 1 < players.length) {
      setVoteState({ voterIdx: voteState.voterIdx + 1, votes: newVotes });
    } else {
      // Tally
      const tally: Record<string, number> = {};
      for (const v of Object.values(newVotes)) tally[v] = (tally[v] || 0) + 1;
      if (Object.keys(tally).length === 0) {
        setVoteState(null);
        advanceTurn();
        return;
      }
      const max = Math.max(...Object.values(tally));
      const winners = Object.entries(tally).filter(([, c]) => c === max).map(([n]) => n);
      const penalties = winners.map(name => ({ player_name: name, sips: card.drink_penalty, shots: 0, reason: `${max} glasova!` }));
      applyDrinks(penalties);
      setVoteState(null);
      setCardPhase("result");
      setTimeout(() => advanceTurn(), 4000);
    }
  };

  const handleSinglePick = (targetName: string) => {
    if (!card) return;
    const penalties: DrinkPenalty[] = [{ player_name: targetName, sips: card.drink_penalty, shots: 0, reason: `${targetName} pije ${card.drink_penalty}!` }];
    applyDrinks(penalties);
    setTimeout(() => advanceTurn(), 1500);
  };

  const handleMatePick = (matePlayerName: string) => {
    if (!card) return;
    const current = players[currentPlayerIdx];
    if (!current) return;
    // Bidirectional mate binding
    setPlayers(prev => prev.map(p => {
      if (p.id === current.id) return { ...p, mates: [...p.mates, matePlayerName] };
      if (p.name === matePlayerName) return { ...p, mates: [...p.mates, current.name] };
      return p;
    }));
    setResultMessage(`${current.name} <3 ${matePlayerName} — pajdasi su!`);
    setCardPhase("result");
    setTimeout(() => advanceTurn(), 2500);
  };

  const handleAcknowledge = () => advanceTurn();

  // Admin
  const restartGame = () => {
    setConfirmDialog({
      message: "Sigurno restartati igru?",
      onYes: () => {
        setPlayers(prev => prev.map(p => ({ ...p, total_sips: 0, total_shots: 0, chickened_out_count: 0, cards_drawn: 0, mates: [] })));
        setPhase("playing");
        setCurrentRound(1);
        setCardsInRound(0);
        setCurrentPlayerIdx(0);
        setCard(null);
        setCardPhase("draw");
        setVoteState(null);
        setResultMessage(null);
        setConfirmDialog(null);
      },
    });
  };

  const endGameNow = () => {
    setConfirmDialog({
      message: "Zavrsiti igru?",
      onYes: () => { setPhase("ended"); playRandomTrack(["We Are The Champions"]); setConfirmDialog(null); },
    });
  };

  const exitGame = () => {
    setConfirmDialog({
      message: "Izlaz iz igre?",
      onYes: () => {
        if (audioRef.current) audioRef.current.pause();
        router.push("/");
      },
    });
  };

  const backToSetup = () => {
    setConfirmDialog({
      message: "Vratiti se na odabir likova?",
      onYes: () => {
        setPhase("setup");
        setPlayers([]);
        setConfirmDialog(null);
        if (audioRef.current) audioRef.current.pause();
      },
    });
  };

  // ────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────

  if (phase === "setup") {
    return <SetupScreen onStart={startGame} onCancel={() => router.push("/")} />;
  }

  if (phase === "ended") {
    const ranked = [...players].sort((a, b) => (b.total_sips + b.total_shots * 3) - (a.total_sips + a.total_shots * 3));
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c14] text-white p-8">
        <h1 className="text-6xl text-[#FFC828] mb-8">JUTRO POSLIJE</h1>
        <div className="space-y-2 max-w-2xl w-full mb-8">
          {ranked.map((p, i) => (
            <div key={p.id} className="flex items-center gap-4 bg-[#1a1a28] p-3 rounded-lg">
              <span className="text-2xl text-[#FFC828] w-12">{i + 1}.</span>
              <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-12 h-12 pixel-art" />
              <span className="text-xl flex-1">{p.name}{p.is_groom && " ★"}{p.is_kum && " +"}</span>
              <span className="text-xl text-[#FFC828]">{formatDrinks(p.total_sips, p.total_shots)}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <button onClick={restartGame} className="bg-[#28A050] hover:bg-[#3CB464] text-white font-bold py-3 px-6 rounded-lg">🔄 NOVA IGRA</button>
          <button onClick={() => setPhase("setup")} className="bg-[#28508C] hover:bg-[#3264B4] text-white font-bold py-3 px-6 rounded-lg">👥 NOVI IGRACI</button>
          <button onClick={() => router.push("/")} className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-6 rounded-lg">❌ IZLAZ</button>
        </div>
        {confirmDialog && <ConfirmModal {...confirmDialog} onCancel={() => setConfirmDialog(null)} />}
        <audio ref={audioRef} onEnded={nextTrack} />
      </div>
    );
  }

  // ── PLAYING ──
  const currentPlayer = players[currentPlayerIdx];

  return (
    <div className="min-h-screen flex flex-col bg-[#0c0c14] text-white relative">
      {/* Top bar */}
      <div className="px-6 py-3 bg-black/60 flex justify-between items-center border-b border-[#FFC828]/30">
        <div className="text-base">
          <span className="text-zinc-400">Runda </span>
          <span className="text-[#FFC828] font-bold">{currentRound}</span>
          <span className="text-zinc-400">: </span>
          <span className="text-[#FFC828]">{ROUND_NAMES[currentRound]}</span>
        </div>
        <div className="text-base text-zinc-400">
          Karta <span className="text-white">{cardsInRound + 1}</span>/{CARDS_PER_ROUND}
        </div>
        <button onClick={() => setShowAdminPanel(p => !p)}
          className="text-sm text-zinc-500 hover:text-white px-3 py-1 border border-zinc-700 rounded">
          {showAdminPanel ? "Sakrij" : "Admin"}
        </button>
      </div>

      {/* Whose turn */}
      {currentPlayer && (
        <div className="px-6 py-4 bg-gradient-to-r from-transparent via-[#FFC828]/10 to-transparent flex items-center justify-center gap-4">
          <img src={spriteUrl(currentPlayer.fighter_id)} alt={currentPlayer.name} className="w-16 h-16 pixel-art" />
          <div>
            <p className="text-xs text-zinc-500 uppercase">Na potezu</p>
            <p className="text-3xl text-[#FFC828] font-bold">
              {currentPlayer.is_groom && "★ "}{currentPlayer.is_kum && "+ "}{currentPlayer.name}
            </p>
            <p className="text-xs text-zinc-400">
              {formatDrinks(currentPlayer.total_sips, currentPlayer.total_shots)} • {getDrunkComment(currentPlayer.total_sips, currentPlayer.total_shots)}
            </p>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-4 overflow-y-auto">
        {cardPhase === "draw" && currentPlayer && (
          <div className="text-center">
            <p className="text-2xl text-zinc-400 mb-6">{currentPlayer.name}, vuci kartu!</p>
            <button onClick={drawNewCard}
              className="bg-[#FFC828] text-black font-bold py-6 px-12 text-3xl rounded-xl hover:bg-[#FFD850] transition animate-pulse-glow">
              🎴 VUCI KARTU
            </button>
          </div>
        )}

        {cardPhase === "show" && card && (
          <ShowCardLocal
            card={card}
            players={players}
            currentPlayer={currentPlayer}
            onNhie={handleNhieDone}
            onTruthDare={handleTruthDareDone}
            onStartVote={startBinaryVote}
            onStartPick={startGroupPick}
            onSinglePick={handleSinglePick}
            onMatePick={handleMatePick}
            onAdvance={handleAcknowledge}
          />
        )}

        {cardPhase === "voting" && voteState && card && (
          <VotingScreen
            card={card}
            players={players}
            voterIdx={voteState.voterIdx}
            onBinaryVote={handleBinaryVote}
            onPickVote={handleGroupPick}
          />
        )}

        {cardPhase === "result" && resultMessage && (
          <div className="bg-[#1a1a28] border-4 border-[#FFC828] rounded-2xl p-8 max-w-2xl text-center">
            <h2 className="text-4xl text-[#FFC828] mb-6">REZULTAT</h2>
            <pre className="text-xl text-white whitespace-pre-wrap font-sans">{resultMessage}</pre>
            <button onClick={advanceTurn} className="mt-6 bg-[#FFC828] text-black font-bold py-3 px-8 rounded-lg">DALJE</button>
          </div>
        )}
      </div>

      {/* HUD */}
      <PlayerHudLocal players={players} currentPlayerName={currentPlayer?.name} />

      {/* Admin panel */}
      {showAdminPanel && (
        <div className="fixed top-20 right-4 bg-black/90 border-2 border-[#FFC828]/50 rounded-lg p-3 w-64 z-40 max-h-[calc(100vh-100px)] overflow-y-auto">
          <p className="text-xs text-[#FFC828] mb-2 font-bold">ADMIN (LOKALNO)</p>

          <p className="text-[9px] text-zinc-500 mb-1 mt-2">TIJEK IGRE</p>
          <div className="flex flex-col gap-1.5">
            <button onClick={drawNewCard} disabled={cardPhase !== "draw"}
              className="bg-[#28A050] hover:bg-[#3CB464] text-white text-xs py-2 rounded disabled:opacity-30">
              🎴 Vuci kartu
            </button>
            <button onClick={advanceTurn} disabled={cardPhase === "draw"}
              className="bg-[#28508C] hover:bg-[#3264B4] text-white text-xs py-2 rounded disabled:opacity-30">
              ⏭ Sljedeci red
            </button>
          </div>

          <p className="text-[9px] text-zinc-500 mb-1 mt-3">UPRAVLJANJE</p>
          <div className="flex flex-col gap-1.5">
            <button onClick={backToSetup} className="bg-[#7828A0] hover:bg-[#9438C0] text-white text-xs py-2 rounded">
              👥 Promijeni igrace
            </button>
            <button onClick={restartGame} className="bg-[#B46414] hover:bg-[#D47828] text-white text-xs py-2 rounded">
              🔄 Restartaj
            </button>
            <button onClick={endGameNow} className="bg-[#DC3232] hover:bg-[#FF4848] text-white text-xs py-2 rounded">
              🏁 Zavrsi → rezultati
            </button>
            <button onClick={exitGame} className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs py-2 rounded">
              ❌ Izlaz
            </button>
          </div>

          {/* Music */}
          <p className="text-[9px] text-zinc-500 mb-1 mt-3">MUZIKA</p>
          <div className="bg-black/50 rounded px-2 py-1 mb-2 h-5 overflow-hidden">
            <p className="text-[9px] text-zinc-400 truncate">{currentTrack ? `♪ ${currentTrack}` : "— nema —"}</p>
          </div>
          <div className="flex gap-1 mb-2">
            <button onClick={prevTrack} className="flex-1 bg-zinc-800 text-white text-xs py-1.5 rounded">⏮</button>
            <button onClick={togglePause} className="flex-1 bg-zinc-800 text-white text-xs py-1.5 rounded">{musicPaused ? "▶" : "⏸"}</button>
            <button onClick={nextTrack} className="flex-1 bg-zinc-800 text-white text-xs py-1.5 rounded">⏭</button>
            <button onClick={toggleMute} className="flex-1 bg-zinc-800 text-white text-xs py-1.5 rounded">{musicMuted ? "🔇" : "🔊"}</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-zinc-600 w-6 text-right">{Math.round(musicVolume * 100)}%</span>
            <input type="range" min="0" max="100" value={musicVolume * 100}
              onChange={(e) => {
                const v = parseInt(e.target.value) / 100;
                setMusicVolume(v);
                if (audioRef.current && !musicMuted) audioRef.current.volume = v;
              }}
              className="flex-1" />
          </div>
        </div>
      )}

      {confirmDialog && <ConfirmModal {...confirmDialog} onCancel={() => setConfirmDialog(null)} />}
      <audio ref={audioRef} onEnded={nextTrack} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SETUP SCREEN
// ────────────────────────────────────────────────────────────────────────────

function SetupScreen({ onStart, onCancel }: { onStart: (players: LocalPlayer[]) => void; onCancel: () => void }) {
  const [playerCount, setPlayerCount] = useState(4);
  const [picks, setPicks] = useState<string[]>([]);
  const [pickingIdx, setPickingIdx] = useState(0);
  const [step, setStep] = useState<"count" | "pick">("count");

  const handleConfirmCount = () => {
    setPicks([]);
    setPickingIdx(0);
    setStep("pick");
  };

  const pickFighter = (fighterId: string) => {
    if (picks.includes(fighterId)) return;
    const newPicks = [...picks, fighterId];
    setPicks(newPicks);
    if (newPicks.length >= playerCount) {
      // Build player list
      const players: LocalPlayer[] = newPicks.map((fid, i) => {
        const fighter = FIGHTERS.find(f => f.id === fid);
        return {
          id: `local-${i}-${fid}`,
          name: fighter?.name || fid.toUpperCase(),
          fighter_id: fid,
          is_groom: fid === "matija",
          is_kum: fid === "pasko",
          total_sips: 0,
          total_shots: 0,
          chickened_out_count: 0,
          cards_drawn: 0,
          mates: [],
        };
      });
      onStart(players);
    } else {
      setPickingIdx(newPicks.length);
    }
  };

  const undoPick = () => {
    if (picks.length === 0) {
      setStep("count");
      return;
    }
    const newPicks = picks.slice(0, -1);
    setPicks(newPicks);
    setPickingIdx(newPicks.length);
  };

  if (step === "count") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c14] text-white p-8">
        <h1 className="text-5xl text-[#FFC828] mb-2 tracking-wider">LOKALNO</h1>
        <p className="text-zinc-500 text-sm mb-12">1 ekran • 0 telefona • 0 interneta</p>
        <p className="text-2xl text-white mb-6">Kolko vas je?</p>
        <div className="flex items-center gap-6 mb-8">
          <button onClick={() => setPlayerCount(c => Math.max(2, c - 1))}
            className="bg-zinc-800 hover:bg-zinc-700 text-white text-3xl w-16 h-16 rounded-full">−</button>
          <div className="text-7xl text-[#FFC828] font-bold w-24 text-center">{playerCount}</div>
          <button onClick={() => setPlayerCount(c => Math.min(15, c + 1))}
            className="bg-zinc-800 hover:bg-zinc-700 text-white text-3xl w-16 h-16 rounded-full">+</button>
        </div>
        <p className="text-zinc-500 text-xs mb-8">2-15 igraca</p>
        <button onClick={handleConfirmCount}
          className="bg-[#FFC828] text-black font-bold py-4 px-12 text-2xl rounded-lg hover:bg-[#FFD850]">
          DALJE
        </button>
        <button onClick={onCancel} className="text-zinc-500 underline text-sm mt-4">Natrag</button>
      </div>
    );
  }

  // step === "pick"
  return (
    <div className="min-h-screen flex flex-col items-center bg-[#0c0c14] text-white p-6">
      <h2 className="text-2xl text-[#FFC828] mb-2">IGRAC {pickingIdx + 1} OD {playerCount}</h2>
      <p className="text-sm text-zinc-500 mb-4">Odaberi svog lika</p>
      <p className="text-xs text-zinc-600 mb-6">Matija = Mladozenja • Pasko = Kum</p>

      <div className="grid grid-cols-3 md:grid-cols-5 gap-3 max-w-4xl w-full mb-6">
        {FIGHTERS.map(f => {
          const isPicked = picks.includes(f.id);
          return (
            <button key={f.id} onClick={() => pickFighter(f.id)} disabled={isPicked}
              className={`p-3 rounded-lg border-2 transition ${
                isPicked
                  ? "border-zinc-800 bg-zinc-900/30 opacity-30"
                  : "border-zinc-700 bg-[#1a1a28] hover:border-[#FFC828] hover:bg-[#FFC828]/10 active:scale-95"
              }`}>
              {f.has_sprite
                ? <img src={spriteUrl(f.id)} alt={f.name} className="w-full pixel-art" />
                : <div className="w-full aspect-square flex items-center justify-center text-3xl text-zinc-500">?</div>}
              <p className="text-[10px] mt-1 text-center text-white">{f.name}</p>
              {f.is_groom && <p className="text-[8px] text-[#FFC828] text-center">MLADOZENJA</p>}
              {f.is_kum && <p className="text-[8px] text-[#DCA014] text-center">KUM</p>}
              {isPicked && <p className="text-[8px] text-red-500 text-center">UZET</p>}
            </button>
          );
        })}
      </div>

      {/* Already picked */}
      {picks.length > 0 && (
        <div className="bg-[#1a1a28] rounded-lg p-3 max-w-md w-full mb-4">
          <p className="text-xs text-zinc-500 mb-2">ODABRANI ({picks.length}/{playerCount})</p>
          <div className="flex flex-wrap gap-2">
            {picks.map((fid, i) => {
              const f = FIGHTERS.find(x => x.id === fid);
              return (
                <div key={i} className="flex items-center gap-1 bg-black/40 rounded px-2 py-1">
                  {f?.has_sprite && <img src={spriteUrl(fid)} alt="" className="w-6 h-6 pixel-art" />}
                  <span className="text-xs text-white">{f?.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={undoPick} className="text-zinc-500 underline text-sm">← Vrati zadnji odabir</button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CARD DISPLAY (in show phase)
// ────────────────────────────────────────────────────────────────────────────

function ShowCardLocal({ card, players, currentPlayer, onNhie, onTruthDare, onStartVote, onStartPick, onSinglePick, onMatePick, onAdvance }: {
  card: GameCard;
  players: LocalPlayer[];
  currentPlayer?: LocalPlayer;
  onNhie: (player: LocalPlayer, did: boolean) => void;
  onTruthDare: (didIt: boolean) => void;
  onStartVote: () => void;
  onStartPick: () => void;
  onSinglePick: (targetName: string) => void;
  onMatePick: (targetName: string) => void;
  onAdvance: () => void;
}) {
  const colors = CARD_COLORS[card.card_type as keyof typeof CARD_COLORS];

  return (
    <div className="w-full max-w-5xl">
      <div
        className="rounded-2xl border-4 p-8 md:p-12 shadow-2xl"
        style={{
          backgroundColor: colors?.bg || "#333",
          borderColor: colors?.accent || "#888",
          color: colors?.text || "#fff",
        }}
      >
        <h2 className="text-3xl md:text-5xl font-bold text-center mb-2 tracking-wider">{card.title}</h2>
        <div className="border-t-2 my-6 opacity-50" style={{ borderColor: colors?.accent }} />
        <p className="text-2xl md:text-4xl text-center leading-relaxed py-6">{card.content}</p>
        {card.content_b && (
          <>
            <p className="text-center text-xl my-2 opacity-70">— ILI —</p>
            <p className="text-2xl md:text-4xl text-center leading-relaxed py-6">{card.content_b}</p>
          </>
        )}
        {card.instruction && (
          <p className="text-center text-lg mt-4" style={{ color: colors?.accent }}>{card.instruction}</p>
        )}
        {card.is_groom_targeted && (
          <p className="text-center text-2xl mt-4 text-[#FFC828] animate-pulse">★ MLADOZENJA ★</p>
        )}
      </div>

      {/* Action buttons based on card type */}
      <div className="mt-6 flex flex-col items-center gap-3">
        {/* Truth/Dare/Groom Special — current player only */}
        {(card.card_type === "truth" || card.card_type === "dare" || card.card_type === "groom_special") && currentPlayer && (
          <div className="flex gap-3 w-full max-w-2xl">
            <button onClick={() => onTruthDare(true)}
              className="flex-1 bg-[#28A050] hover:bg-[#3CB464] text-white font-bold py-6 text-2xl rounded-lg active:scale-95">
              ✓ {card.card_type === "truth" ? "ODGOVORIO" : "URADIO"}
            </button>
            <button onClick={() => onTruthDare(false)}
              className="flex-1 bg-[#DC3232] hover:bg-[#FF4848] text-white font-bold py-6 text-2xl rounded-lg active:scale-95">
              🐔 KUKAVICA
            </button>
          </div>
        )}

        {/* NHIE — pass around the device */}
        {card.card_type === "nhie" && (
          <NhieRoundRobin players={players} onPlayerDone={onNhie} />
        )}

        {/* WYR / Hot Take — start group voting */}
        {(card.card_type === "wyr" || card.card_type === "hot_take") && (
          <button onClick={onStartVote}
            className="bg-[#FFC828] text-black font-bold py-4 px-12 text-2xl rounded-lg hover:bg-[#FFD850] active:scale-95">
            POCNI GLASANJE ({players.length} igraca)
          </button>
        )}

        {/* Most Likely — group vote */}
        {card.card_type === "most_likely" && (
          <button onClick={onStartPick}
            className="bg-[#FFC828] text-black font-bold py-4 px-12 text-2xl rounded-lg hover:bg-[#FFD850] active:scale-95">
            POCNI GLASANJE ({players.length} igraca)
          </button>
        )}

        {/* Who in room — current player picks */}
        {card.card_type === "who_in_room" && currentPlayer && (
          <div className="w-full">
            <p className="text-center text-zinc-400 mb-3">{currentPlayer.name}, odaberi nekog:</p>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {players.map(p => (
                <button key={p.id} onClick={() => onSinglePick(p.name)}
                  className="p-2 rounded-lg border-2 border-zinc-700 bg-[#1a1a28] hover:border-[#FFC828] active:scale-95">
                  <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-full pixel-art" />
                  <p className="text-[10px] mt-1 text-white text-center">{p.name}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mate — current player picks */}
        {card.card_type === "mate" && currentPlayer && (
          <div className="w-full">
            <p className="text-center text-zinc-400 mb-3">{currentPlayer.name}, odaberi pajdasa (od sad pijete zajedno):</p>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {players.filter(p => p.id !== currentPlayer.id).map(p => (
                <button key={p.id} onClick={() => onMatePick(p.name)}
                  className="p-2 rounded-lg border-2 border-zinc-700 bg-[#1a1a28] hover:border-[#FFC828] active:scale-95">
                  <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-full pixel-art" />
                  <p className="text-[10px] mt-1 text-white text-center">{p.name}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Categories / Chaos / Rule / Boss Fight — just OK */}
        {(card.card_type === "categories" || card.card_type === "chaos" || card.card_type === "rule" || card.card_type === "boss_fight") && (
          <button onClick={onAdvance}
            className="bg-[#FFC828] text-black font-bold py-4 px-12 text-2xl rounded-lg hover:bg-[#FFD850] active:scale-95">
            DALJE
          </button>
        )}
      </div>
    </div>
  );
}

// NHIE: each player presses a button in turn
function NhieRoundRobin({ players, onPlayerDone }: {
  players: LocalPlayer[];
  onPlayerDone: (player: LocalPlayer, did: boolean) => void;
}) {
  const [idx, setIdx] = useState(0);
  if (idx >= players.length) return null;
  const p = players[idx];
  const handle = (did: boolean) => {
    onPlayerDone(p, did);
    setIdx(i => i + 1);
  };
  return (
    <div className="w-full max-w-2xl">
      <p className="text-center text-zinc-400 mb-2">Igrac {idx + 1}/{players.length}</p>
      <div className="flex items-center justify-center gap-3 mb-4">
        <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-16 h-16 pixel-art" />
        <p className="text-3xl text-[#FFC828]">{p.name}</p>
      </div>
      <div className="flex gap-3">
        <button onClick={() => handle(true)}
          className="flex-1 bg-[#DC3232] text-white font-bold py-6 text-xl rounded-lg active:scale-95">
          🍺 JESAM (PIJES)
        </button>
        <button onClick={() => handle(false)}
          className="flex-1 bg-[#28A050] text-white font-bold py-6 text-xl rounded-lg active:scale-95">
          ✓ NISAM
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// VOTING SCREEN (round-robin on shared device)
// ────────────────────────────────────────────────────────────────────────────

function VotingScreen({ card, players, voterIdx, onBinaryVote, onPickVote }: {
  card: GameCard;
  players: LocalPlayer[];
  voterIdx: number;
  onBinaryVote: (choice: "a" | "b") => void;
  onPickVote: (targetName: string) => void;
}) {
  const voter = players[voterIdx];
  if (!voter) return null;
  const isBinary = card.card_type === "wyr" || card.card_type === "hot_take";

  return (
    <div className="w-full max-w-3xl">
      <p className="text-center text-zinc-400 mb-1">Glas {voterIdx + 1}/{players.length}</p>
      <div className="flex items-center justify-center gap-3 mb-6">
        <img src={spriteUrl(voter.fighter_id)} alt={voter.name} className="w-20 h-20 pixel-art" />
        <p className="text-4xl text-[#FFC828]">{voter.name}, glasaj!</p>
      </div>

      {isBinary && (
        <div className="flex gap-4">
          <button onClick={() => onBinaryVote("a")}
            className="flex-1 bg-[#28A050] hover:bg-[#3CB464] text-white font-bold py-12 text-3xl rounded-xl active:scale-95">
            {card.card_type === "hot_take" ? "ZA" : "A"}
            {card.card_type === "wyr" && <p className="text-sm mt-2 opacity-80 px-4">{card.content?.slice(0, 50)}</p>}
          </button>
          <button onClick={() => onBinaryVote("b")}
            className="flex-1 bg-[#DC3232] hover:bg-[#FF4848] text-white font-bold py-12 text-3xl rounded-xl active:scale-95">
            {card.card_type === "hot_take" ? "PROTIV" : "B"}
            {card.card_type === "wyr" && <p className="text-sm mt-2 opacity-80 px-4">{card.content_b?.slice(0, 50)}</p>}
          </button>
        </div>
      )}

      {card.card_type === "most_likely" && (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {players.map(p => (
            <button key={p.id} onClick={() => onPickVote(p.name)}
              className="p-2 rounded-lg border-2 border-zinc-700 bg-[#1a1a28] hover:border-[#FFC828] hover:bg-[#FFC828]/10 active:scale-95">
              <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-full pixel-art" />
              <p className="text-[10px] mt-1 text-white text-center">{p.name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// HUD
// ────────────────────────────────────────────────────────────────────────────

function PlayerHudLocal({ players, currentPlayerName }: { players: LocalPlayer[]; currentPlayerName?: string }) {
  return (
    <div className="bg-black/80 border-t-2 border-[#FFC828] py-2 px-2">
      <div className="flex gap-1 justify-around overflow-x-auto">
        {players.map((p) => {
          const isCurrent = p.name === currentPlayerName;
          return (
            <div key={p.id}
              className={`flex flex-col items-center min-w-[64px] px-1 py-1 rounded transition ${
                isCurrent ? "bg-[#FFC828]/20 border border-[#FFC828]" : ""
              }`}>
              <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-10 h-10 pixel-art" />
              <p className={`text-[8px] mt-0.5 ${isCurrent ? "text-[#FFC828]" : "text-white"}`}>
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

// ────────────────────────────────────────────────────────────────────────────
// CONFIRM MODAL
// ────────────────────────────────────────────────────────────────────────────

function ConfirmModal({ message, onYes, onCancel }: { message: string; onYes: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
      <div className="bg-[#1a1a28] border-4 border-[#FFC828] rounded-2xl p-8 max-w-md text-center">
        <p className="text-xl text-white mb-6">{message}</p>
        <div className="flex gap-4 justify-center">
          <button onClick={onYes} className="bg-[#DC3232] hover:bg-[#FF4848] text-white font-bold py-3 px-8 rounded-lg">DA</button>
          <button onClick={onCancel} className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-8 rounded-lg">NE</button>
        </div>
      </div>
    </div>
  );
}

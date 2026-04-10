"use client";

import { useEffect, useState, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  getRoom, updateRoomState, getPlayers, applyDrinks,
  subscribeToRoom, subscribeToPlayers, subscribeToActions,
  resetRoomToLobby, deleteRoom, kickPlayer, emptyGameState,
} from "@/lib/room";
import {
  drawCard, applyGroomTax, applyMates, ROUND_NAMES,
  CARD_COLORS, formatDrinks, getDrunkComment,
} from "@/lib/cards";
import type { GameState, GameCard, PlayerRow, DrinkPenalty, BattleStateSync } from "@/lib/supabase";
import { spriteUrl } from "@/lib/fighters";
import playlist from "@/data/playlist.json";
import { BattleScene } from "@/components/BattleScene";
import { CreditsScreen } from "@/components/CreditsScreen";
import { createBattleState, executeTurn, type BattleState as MatijamonBattleState, type BattleFighter } from "@/lib/battle";

// Helper: build the synced JSON from a full battle state
function syncFromBattle(
  battle: MatijamonBattleState,
  p1PlayerId: string, p2PlayerId: string,
  p1Name: string, p2Name: string,
  selectingFor: "p1" | "p2",
  p1MoveLocked: number | null,
  message: string,
  resolved: boolean,
): BattleStateSync {
  const fighterToSync = (f: BattleFighter) => f.moves.map(m => ({
    name: m.name,
    type: m.type as string,
    category: m.category as string,
    power: m.power,
    pp: m.pp ?? 0,
    max_pp: m.max_pp ?? 0,
    description: m.description,
  }));
  return {
    p1_player_id: p1PlayerId,
    p2_player_id: p2PlayerId,
    p1_fighter_id: battle.player1.id,
    p2_fighter_id: battle.player2.id,
    p1_name: p1Name,
    p2_name: p2Name,
    p1_hp: battle.player1.current_hp,
    p2_hp: battle.player2.current_hp,
    p1_max_hp: battle.player1.max_hp,
    p2_max_hp: battle.player2.max_hp,
    p1_types: battle.player1.types as string[],
    p2_types: battle.player2.types as string[],
    p1_moves: fighterToSync(battle.player1),
    p2_moves: fighterToSync(battle.player2),
    selecting_for: selectingFor,
    p1_move: p1MoveLocked,
    message,
    resolved,
    winner_id: battle.winnerId,
  };
}

const CARDS_PER_ROUND = 30;

interface PlaylistTrack { name: string; url: string; fighter_id: string | null; }

// Local battle state held by the host page (mirrored to room.state.battle for phones)
interface LocalBattle {
  state: MatijamonBattleState;
  p1Player: PlayerRow;
  p2Player: PlayerRow;
  p1Move: number | null;
  p2Move: number | null;
  selectingFor: "p1" | "p2";
  selectedMoveIdx: number;
  message: string;
  resolved: boolean;
}

export default function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [state, setState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [joinUrl, setJoinUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.3);
  const [musicMuted, setMusicMuted] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<string>("");
  const [musicPaused, setMusicPaused] = useState(false);
  const trackHistoryRef = useRef<PlaylistTrack[]>([]);
  const trackHistoryPosRef = useRef<number>(-1);
  const [showAdminPanel, setShowAdminPanel] = useState(true);
  const [voteTally, setVoteTally] = useState<Record<string, number>>({});
  const [actedPlayerIds, setActedPlayerIds] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onYes: () => void } | null>(null);
  const [showKickMenu, setShowKickMenu] = useState(false);
  // Battle state (for boss fight cards) — type declared next to the ref above
  const [battle, setBattle] = useState<LocalBattle | null>(null);

  const tracks = playlist as PlaylistTrack[];

  // ── Refs shadow state so the action-handler useEffect only re-subscribes
  // once per room code instead of on every state/players update. Without
  // this the Supabase channel gets torn down ~20x per minute and actions
  // that land during the churn window are silently dropped.
  const stateRef = useRef<GameState | null>(null);
  const playersRef = useRef<PlayerRow[]>([]);
  const battleRef = useRef<LocalBattle | null>(null);
  const actedPlayerIdsRef = useRef<Set<string>>(new Set());
  // Double-fire guards
  const drawingRef = useRef(false);
  const submittingMoveRef = useRef(false);
  const advancingRef = useRef(false);
  // Stable references for callbacks read from inside the action handler
  const advanceTurnRef = useRef<() => Promise<void>>(async () => {});
  const submitBattleMoveRef = useRef<(moveIdx: number) => Promise<void>>(async () => {});
  const applyAndAdvanceRef = useRef<(penalties: DrinkPenalty[]) => Promise<void>>(async () => {});

  // Keep refs in lockstep with state
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { battleRef.current = battle; }, [battle]);
  useEffect(() => { actedPlayerIdsRef.current = actedPlayerIds; }, [actedPlayerIds]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/play/${code}`);
    }
  }, [code]);

  useEffect(() => {
    (async () => {
      try {
        const [room, ps] = await Promise.all([getRoom(code), getPlayers(code)]);
        if (room) setState(room.state);
        setPlayers(ps);
      } catch {}
    })();
  }, [code]);

  useEffect(() => {
    return subscribeToRoom(code, (newState) => {
      setState(newState);
      // Reset vote state when card changes
      if (!newState.current_card) {
        setVoteTally({});
        setActedPlayerIds(new Set());
      }
    });
  }, [code]);

  useEffect(() => {
    return subscribeToPlayers(code, (ps) => setPlayers(ps));
  }, [code]);

  // Wake lock — reacquire on visibility change since the browser releases
  // the lock automatically when the tab is hidden.
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (cancelled) return;
      if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch {}
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, []);

  // Battle rehydration: if we land on a state where battle is in progress
  // (e.g. host browser reloaded mid-fight) but local battle ref is empty,
  // rebuild local battle from the synced room.state.battle so the host TV
  // doesn't render the bare card text behind the phones.
  useEffect(() => {
    if (!state?.battle) return;
    if (battleRef.current) return; // already alive
    const sync = state.battle;
    // We only need a thin local-battle stand-in pointing at the right
    // players; the engine state itself is opaque to the TV view since
    // showMoves is false until next selection. Recreate fighters from ids.
    try {
      const p1Player = playersRef.current.find(p => p.id === sync.p1_player_id);
      const p2Player = playersRef.current.find(p => p.id === sync.p2_player_id);
      if (!p1Player || !p2Player) return;
      const battleState = createBattleState(sync.p1_fighter_id, sync.p2_fighter_id);
      // Restore HP from the sync so the TV shows the current state, not full HP
      battleState.player1.current_hp = sync.p1_hp;
      battleState.player2.current_hp = sync.p2_hp;
      const rehydrated: LocalBattle = {
        state: battleState,
        p1Player, p2Player,
        p1Move: sync.p1_move,
        p2Move: null,
        selectingFor: sync.selecting_for,
        selectedMoveIdx: 0,
        message: sync.message,
        resolved: sync.resolved,
      };
      setBattle(rehydrated);
      battleRef.current = rehydrated;
    } catch (err) {
      console.error("Battle rehydration failed:", err);
    }
  }, [state?.battle]);

  // Play a specific track and add to history
  const playTrack = useCallback((track: PlaylistTrack, recordHistory = true) => {
    if (!audioRef.current) return;
    audioRef.current.src = track.url;
    audioRef.current.volume = musicMuted ? 0 : musicVolume;
    audioRef.current.play().catch(() => {});
    setCurrentTrack(track.name);
    setMusicPaused(false);
    if (recordHistory) {
      // Truncate any "future" history when picking a new track
      const hist = trackHistoryRef.current.slice(0, trackHistoryPosRef.current + 1);
      hist.push(track);
      trackHistoryRef.current = hist;
      trackHistoryPosRef.current = hist.length - 1;
    }
  }, [musicVolume, musicMuted]);

  // Music: random track from a phase pool (or full playlist)
  const playRandomTrack = useCallback((phasePool?: string[]) => {
    if (!audioRef.current) return;
    let candidates: PlaylistTrack[];
    if (phasePool && phasePool.length > 0) {
      candidates = tracks.filter(t => phasePool.some(name => t.name.includes(name)));
      if (candidates.length === 0) candidates = tracks;
    } else {
      candidates = tracks;
    }
    // Avoid playing the same track twice in a row
    if (candidates.length > 1 && currentTrack) {
      candidates = candidates.filter(t => t.name !== currentTrack);
    }
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
    if (audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
      setMusicPaused(false);
    } else {
      audioRef.current.pause();
      setMusicPaused(true);
    }
  };

  const toggleMute = () => {
    setMusicMuted(m => {
      const next = !m;
      if (audioRef.current) audioRef.current.volume = next ? 0 : musicVolume;
      return next;
    });
  };

  // ────────────────────────────────────────────────────────────────────
  // GAME ACTIONS (host-controlled)
  // ────────────────────────────────────────────────────────────────────

  const startGame = async () => {
    if (!state || players.length < 2) return;

    // CRITICAL: play audio directly inside the click handler to satisfy
    // browser autoplay policy. Don't use setTimeout — that breaks the
    // user-gesture chain and the browser will block playback.
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

    const newState: GameState = {
      ...state,
      phase: "playing", current_round: 1, cards_in_round: 0,
      total_cards_drawn: 0, current_player_idx: 0, card_phase: "draw",
    };
    await updateRoomState(code, newState);
  };

  const drawNewCard = async () => {
    if (drawingRef.current) return;
    // Read the freshest state via ref — the caller may not have the latest
    const curState = stateRef.current;
    const curPlayers = playersRef.current;
    if (!curState || curPlayers.length === 0) return;
    if (curState.card_phase !== "draw") return;

    drawingRef.current = true;
    try {
      const isGroomTurn = curPlayers[curState.current_player_idx]?.is_groom || false;
      const card = drawCard({ currentRound: curState.current_round, isGroomTurn, bossFightCooldown: 99 });
      setVoteTally({});
      setActedPlayerIds(new Set());

      // Boss Fight: kick off Matijamon battle
      if (card.card_type === "boss_fight" && curPlayers.length >= 2) {
        const p1 = curPlayers[curState.current_player_idx];
        const others = curPlayers.filter(p => p.id !== p1.id);
        const p2 = others[Math.floor(Math.random() * others.length)];
        const battleState = createBattleState(p1.fighter_id, p2.fighter_id);
        const initialMessage = `${p1.name} VS ${p2.name}! ${p1.name}, odaberi potez!`;
        const newBattle: LocalBattle = {
          state: battleState,
          p1Player: p1,
          p2Player: p2,
          p1Move: null,
          p2Move: null,
          selectingFor: "p1",
          selectedMoveIdx: 0,
          message: initialMessage,
          resolved: false,
        };
        setBattle(newBattle);
        battleRef.current = newBattle;
        const battleSync = syncFromBattle(
          battleState,
          p1.id, p2.id,
          p1.name, p2.name,
          "p1",
          null,
          initialMessage,
          false,
        );
        await updateRoomState(code, { ...curState, current_card: card, card_phase: "show", battle: battleSync });
        const battleTracks = ["Thunderstruck", "Killing In", "Enter Sandman", "Mortal Kombat"];
        playRandomTrack(battleTracks);
        return;
      }

      await updateRoomState(code, { ...curState, current_card: card, card_phase: "show", battle: null });
    } finally {
      drawingRef.current = false;
    }
  };

  // Battle handlers
  const handleBattleMoveSelect = (idx: number) => {
    if (!battle) return;
    setBattle({ ...battle, selectedMoveIdx: idx });
  };

  // Submit a move (used by both host TV and phones via action handler).
  // Uses refs so concurrent TV + phone submits see the same snapshot and
  // the double-fire guard short-circuits the second one.
  const submitBattleMove = useCallback(async (moveIdx: number) => {
    if (submittingMoveRef.current) return;
    const curBattle = battleRef.current;
    const curState = stateRef.current;
    const curPlayers = playersRef.current;
    if (!curBattle || !curState) return;
    if (curBattle.resolved) return;

    submittingMoveRef.current = true;
    try {
      if (curBattle.selectingFor === "p1") {
        // Lock p1 move, switch to p2
        const updated: LocalBattle = {
          ...curBattle,
          p1Move: moveIdx,
          selectingFor: "p2",
          selectedMoveIdx: 0,
          message: `${curBattle.p2Player.name}, odaberi potez!`,
        };
        setBattle(updated);
        battleRef.current = updated;
        const sync = syncFromBattle(
          updated.state,
          updated.p1Player.id, updated.p2Player.id,
          updated.p1Player.name, updated.p2Player.name,
          "p2",
          moveIdx,
          updated.message,
          false,
        );
        await updateRoomState(code, { ...curState, battle: sync });
        return;
      }

      // Both moves picked → resolve turn
      const p1MoveIdx = curBattle.p1Move ?? 0;
      const p2MoveIdx = moveIdx;
      executeTurn(curBattle.state, p1MoveIdx, p2MoveIdx);
      const lastEvents = curBattle.state.log.slice(-8).filter(e => e.text);
      const message = lastEvents.map(e => e.text).join(" ");

      // Drink triggers from move events
      const drinkEvents = curBattle.state.log.slice(-12).filter(e => e.type === "drink_trigger");
      const penalties: DrinkPenalty[] = [];
      for (const ev of drinkEvents) {
        if (!ev.drinkAmount) continue;
        if (ev.drinkTarget === "attacker") {
          penalties.push({ player_name: curBattle.p1Player.name, sips: ev.drinkAmount, shots: 0, reason: ev.text || "" });
        } else if (ev.drinkTarget === "defender") {
          penalties.push({ player_name: curBattle.p2Player.name, sips: ev.drinkAmount, shots: 0, reason: ev.text || "" });
        } else if (ev.drinkTarget === "spectators") {
          for (const p of curPlayers) {
            if (p.id !== curBattle.p1Player.id && p.id !== curBattle.p2Player.id) {
              penalties.push({ player_name: p.name, sips: ev.drinkAmount, shots: 0, reason: ev.text || "" });
            }
          }
        }
      }
      if (penalties.length > 0) {
        const withMates = applyMates(penalties, curPlayers);
        const withTax = applyGroomTax(withMates, curPlayers, curState.current_round);
        await applyDrinks(code, withTax);
      }

      if (curBattle.state.isOver) {
        const winnerName = curBattle.state.winnerId === curBattle.p1Player.fighter_id ? curBattle.p1Player.name : curBattle.p2Player.name;
        const loserName = curBattle.state.winnerId === curBattle.p1Player.fighter_id ? curBattle.p2Player.name : curBattle.p1Player.name;
        const koPenalties: DrinkPenalty[] = [{
          player_name: loserName, sips: 3, shots: 0, reason: `Gubitnik MATIJAMON borbe pije 3!`,
        }];
        const withMates = applyMates(koPenalties, curPlayers);
        const withTax = applyGroomTax(withMates, curPlayers, curState.current_round);
        await applyDrinks(code, withTax);

        const finalMessage = `${winnerName} POBJEDJUJE! ${loserName} pije 3.`;
        const updated: LocalBattle = {
          ...curBattle,
          message: finalMessage,
          resolved: true,
          p1Move: null,
          selectingFor: "p1",
          selectedMoveIdx: 0,
        };
        setBattle(updated);
        battleRef.current = updated;
        const sync = syncFromBattle(
          curBattle.state,
          curBattle.p1Player.id, curBattle.p2Player.id,
          curBattle.p1Player.name, curBattle.p2Player.name,
          "p1",
          null,
          finalMessage,
          true,
        );
        await updateRoomState(code, { ...curState, battle: sync });
      } else {
        const continueMessage = message || `Sljedeci red. ${curBattle.p1Player.name}, odaberi potez!`;
        const updated: LocalBattle = {
          ...curBattle,
          message: continueMessage,
          p1Move: null,
          selectingFor: "p1",
          selectedMoveIdx: 0,
        };
        setBattle(updated);
        battleRef.current = updated;
        const sync = syncFromBattle(
          curBattle.state,
          curBattle.p1Player.id, curBattle.p2Player.id,
          curBattle.p1Player.name, curBattle.p2Player.name,
          "p1",
          null,
          continueMessage,
          false,
        );
        await updateRoomState(code, { ...curState, battle: sync });
      }
    } finally {
      submittingMoveRef.current = false;
    }
  }, [code]);

  const handleBattleMoveConfirm = async () => {
    const curBattle = battleRef.current;
    if (!curBattle) return;
    await submitBattleMove(curBattle.selectedMoveIdx);
  };

  const finishBattle = async () => {
    const curState = stateRef.current;
    if (!curState) return;
    // Sync first, clear local only if the write succeeded — stops phones
    // and TV from getting out of sync when the network flakes.
    try {
      await updateRoomState(code, { ...curState, battle: null });
    } catch (err) {
      console.error("finishBattle sync failed:", err);
      return;
    }
    setBattle(null);
    battleRef.current = null;
    await advanceTurnRef.current();
  };

  const advanceTurn = useCallback(async () => {
    if (advancingRef.current) return;
    const curState = stateRef.current;
    const curPlayers = playersRef.current;
    if (!curState || curPlayers.length === 0) return;

    advancingRef.current = true;
    try {
      const newCardsInRound = curState.cards_in_round + 1;
      let newRound = curState.current_round;
      let cardsInRound = newCardsInRound;
      let phase: GameState["phase"] = curState.phase;

      if (newCardsInRound >= CARDS_PER_ROUND) {
        if (curState.current_round < 3) {
          newRound = curState.current_round + 1;
          cardsInRound = 0;
          const phasePools: Record<number, string[]> = {
            2: ["Killing In", "Thunderstruck", "Faint", "Bodies"],
            3: ["Enter Sandman", "Chop Suey", "Duality", "Through The Fire"],
          };
          playRandomTrack(phasePools[newRound]);
        } else {
          phase = "ended";
          playRandomTrack(["We Are The Champions"]);
        }
      }
      // Clamp player index defensively in case a player got kicked mid-turn
      const safeIdx = curPlayers.length > 0
        ? (curState.current_player_idx + 1) % curPlayers.length
        : 0;
      await updateRoomState(code, {
        ...curState, current_player_idx: safeIdx, cards_in_round: cardsInRound,
        total_cards_drawn: curState.total_cards_drawn + 1, current_round: newRound,
        current_card: null, card_phase: "draw", vote_state: null, phase,
      });
      setVoteTally({});
      setActedPlayerIds(new Set());
      actedPlayerIdsRef.current = new Set();
    } finally {
      advancingRef.current = false;
    }
  }, [code, playRandomTrack]);

  // Apply drinks helper — reads from refs so it stays callable from the
  // (single, code-only) action subscription.
  const applyAndAdvance = useCallback(async (penalties: DrinkPenalty[]) => {
    const curState = stateRef.current;
    const curPlayers = playersRef.current;
    if (!curState) return;
    const withMates = applyMates(penalties, curPlayers);
    const withTax = applyGroomTax(withMates, curPlayers, curState.current_round);
    await applyDrinks(code, withTax);
    await advanceTurn();
  }, [code, advanceTurn]);

  // Keep ref pointers fresh so the action handler can call the latest closure
  useEffect(() => { advanceTurnRef.current = advanceTurn; }, [advanceTurn]);
  useEffect(() => { submitBattleMoveRef.current = submitBattleMove; }, [submitBattleMove]);
  useEffect(() => { applyAndAdvanceRef.current = applyAndAdvance; }, [applyAndAdvance]);

  // Admin actions
  const skipCard = async () => {
    if (!state) return;
    await advanceTurn();
  };

  const restartGame = () => {
    setConfirmDialog({
      message: "Sigurno restartati igru? Svi gutljaji se brisu, runda 1 ispocetka.",
      onYes: async () => {
        await resetRoomToLobby(code);
        if (audioRef.current) audioRef.current.pause();
        setVoteTally({});
        setActedPlayerIds(new Set());
        setConfirmDialog(null);
      },
    });
  };

  const endGameNow = () => {
    setConfirmDialog({
      message: "Sigurno zavrsiti igru? Idemo na rezultate.",
      onYes: async () => {
        if (state) await updateRoomState(code, { ...state, phase: "ended" });
        playRandomTrack(["We Are The Champions"]);
        setConfirmDialog(null);
      },
    });
  };

  const exitToHome = () => {
    setConfirmDialog({
      message: "Sigurno izaci? Soba se brise i svi se izbacuju.",
      onYes: async () => {
        if (audioRef.current) audioRef.current.pause();
        await deleteRoom(code);
        router.push("/");
      },
    });
  };

  const handleKickPlayer = (player: PlayerRow) => {
    setConfirmDialog({
      message: `Izbaciti ${player.name}?`,
      onYes: async () => {
        await kickPlayer(player.id);
        setConfirmDialog(null);
        setShowKickMenu(false);
      },
    });
  };

  const backToLobby = () => {
    setConfirmDialog({
      message: "Vratiti se u predvorje? Igraci ostaju ali se gutljaji brisu.",
      onYes: async () => {
        await resetRoomToLobby(code);
        if (audioRef.current) audioRef.current.pause();
        setVoteTally({});
        setActedPlayerIds(new Set());
        setConfirmDialog(null);
      },
    });
  };

  // ────────────────────────────────────────────────────────────────────
  // PLAYER ACTION HANDLER
  //
  // This subscribes ONCE per room code. Everything inside reads from refs
  // so the closure never goes stale, and actions never get dropped during
  // re-subscription churn. All side effects live OUTSIDE setState updaters
  // so React strict-mode double-invocation can't double-apply drinks.
  // ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    return subscribeToActions(code, async (action) => {
      // Hot path: short-circuit when not playing
      if (stateRef.current?.phase !== "playing") return;

      // Always re-fetch the freshest room/players for the actual operation
      const room = await getRoom(code);
      if (!room) return;
      const fresh = room.state;
      const ps = await getPlayers(code);
      const card = fresh.current_card;

      // 1. Player triggered "draw card" from their phone
      if (action.action_type === "draw_card" && fresh.card_phase === "draw") {
        await drawNewCardForState(fresh, ps);
        return;
      }

      if (!card) return;
      if (ps.length === 0) return;

      // 2. NHIE — collect "did/didn't" from everyone
      if (card.card_type === "nhie" && action.action_type === "nhie_done") {
        const did = (action.payload as { did?: boolean }).did;
        const player = ps.find(p => p.id === action.player_id);
        if (did && player) {
          const penalties: DrinkPenalty[] = [{
            player_name: player.name,
            sips: card.drink_penalty,
            shots: 0,
            reason: "Ja sam!",
          }];
          const withMates = applyMates(penalties, ps);
          const withTax = applyGroomTax(withMates, ps, fresh.current_round);
          await applyDrinks(code, withTax);
        }
        // Compute "everyone acted" BEFORE setState — strict mode safe
        const prevSet = actedPlayerIdsRef.current;
        if (prevSet.has(action.player_id)) return;
        const next = new Set(prevSet);
        next.add(action.player_id);
        actedPlayerIdsRef.current = next;
        setActedPlayerIds(next);
        if (next.size >= ps.length) {
          await advanceTurnRef.current();
        }
        return;
      }

      // 3. Truth/Dare/Groom Special
      if ((card.card_type === "truth" || card.card_type === "dare" || card.card_type === "groom_special")
          && (action.action_type === "did_it" || action.action_type === "chicken")) {
        const player = ps.find(p => p.id === action.player_id);
        if (action.action_type === "chicken" && player) {
          // Track chickened_out_count for the credits screen achievements
          try {
            const { supabase } = await import("@/lib/supabase");
            await supabase
              .from("players")
              .update({ chickened_out_count: (player.chickened_out_count || 0) + 1 })
              .eq("id", player.id);
          } catch {}
          const penalties: DrinkPenalty[] = [{
            player_name: player.name,
            sips: card.drink_penalty_skip,
            shots: 0,
            reason: "KUKAVICA!",
          }];
          await applyAndAdvanceRef.current(penalties);
        } else {
          // Groom special: groom drinks even if did
          if (card.card_type === "groom_special" && player?.is_groom) {
            const penalties: DrinkPenalty[] = [{
              player_name: player.name,
              sips: card.drink_penalty,
              shots: 0,
              reason: "Mladozenja pije svejedno!",
            }];
            await applyAndAdvanceRef.current(penalties);
          } else {
            await advanceTurnRef.current();
          }
        }
        return;
      }

      // 4. Pick (who_in_room, mate)
      if ((card.card_type === "who_in_room" || card.card_type === "mate") && action.action_type === "pick") {
        const targetName = (action.payload as { target_name?: string }).target_name;
        const targetId = (action.payload as { target_id?: string }).target_id;
        if (card.card_type === "who_in_room" && targetName) {
          const penalties: DrinkPenalty[] = [{
            player_name: targetName,
            sips: card.drink_penalty,
            shots: 0,
            reason: `${targetName} pije ${card.drink_penalty}!`,
          }];
          await applyAndAdvanceRef.current(penalties);
        } else if (card.card_type === "mate" && targetName && targetId) {
          const picker = ps.find(p => p.id === action.player_id);
          const target = ps.find(p => p.id === targetId);
          if (picker && target) {
            const pickerMates = [...(picker.mates || []), target.name];
            const targetMates = [...(target.mates || []), picker.name];
            const { supabase } = await import("@/lib/supabase");
            await Promise.all([
              supabase.from("players").update({ mates: pickerMates }).eq("id", picker.id),
              supabase.from("players").update({ mates: targetMates }).eq("id", target.id),
            ]);
          }
          await advanceTurnRef.current();
        }
        return;
      }

      // 5. Binary vote (wyr, hot_take)
      if ((card.card_type === "wyr" || card.card_type === "hot_take") && action.action_type === "vote") {
        const choice = (action.payload as { choice?: string }).choice;
        if (!choice) return;
        // Update tally
        setVoteTally(prev => {
          const next = { ...prev };
          next[choice] = (next[choice] || 0) + 1;
          return next;
        });
        // Compute everyone-voted BEFORE setState (strict mode safe)
        const prevSet = actedPlayerIdsRef.current;
        if (prevSet.has(action.player_id)) return;
        const nextActed = new Set(prevSet);
        nextActed.add(action.player_id);
        actedPlayerIdsRef.current = nextActed;
        setActedPlayerIds(nextActed);
        if (nextActed.size >= ps.length) {
          try {
            const { supabase } = await import("@/lib/supabase");
            const { data: allActions } = await supabase
              .from("player_actions")
              .select("player_id, payload")
              .eq("room_code", code)
              .eq("card_id", card.id)
              .eq("action_type", "vote");
            if (!Array.isArray(allActions)) { await advanceTurnRef.current(); return; }
            const aCount = allActions.filter((a: { payload: { choice?: string } }) => a.payload.choice === "a").length;
            const bCount = allActions.filter((a: { payload: { choice?: string } }) => a.payload.choice === "b").length;
            let losers: PlayerRow[] = [];
            if (aCount === bCount) losers = ps;
            else if (aCount < bCount) losers = ps.filter(p => allActions.find((a: { player_id: string; payload: { choice?: string } }) => a.player_id === p.id)?.payload.choice === "a");
            else losers = ps.filter(p => allActions.find((a: { player_id: string; payload: { choice?: string } }) => a.player_id === p.id)?.payload.choice === "b");
            const penalties = losers.map(p => ({ player_name: p.name, sips: card.drink_penalty, shots: 0, reason: "MANJINA PIJE!" }));
            await applyAndAdvanceRef.current(penalties);
          } catch (err) {
            console.error("Vote tally failed:", err);
            await advanceTurnRef.current();
          }
        }
        return;
      }

      // 6. Most Likely To — group vote for a target
      if (card.card_type === "most_likely" && action.action_type === "vote") {
        const targetName = (action.payload as { target_name?: string }).target_name;
        if (!targetName) return;
        setVoteTally(prev => {
          const next = { ...prev };
          next[targetName] = (next[targetName] || 0) + 1;
          return next;
        });
        const prevSet = actedPlayerIdsRef.current;
        if (prevSet.has(action.player_id)) return;
        const nextActed = new Set(prevSet);
        nextActed.add(action.player_id);
        actedPlayerIdsRef.current = nextActed;
        setActedPlayerIds(nextActed);
        if (nextActed.size >= ps.length) {
          try {
            const { supabase } = await import("@/lib/supabase");
            const { data: allActions } = await supabase
              .from("player_actions")
              .select("player_id, payload")
              .eq("room_code", code)
              .eq("card_id", card.id)
              .eq("action_type", "vote");
            if (!Array.isArray(allActions)) { await advanceTurnRef.current(); return; }
            const tally: Record<string, number> = {};
            for (const a of allActions) {
              const t = (a.payload as { target_name?: string }).target_name;
              if (t) tally[t] = (tally[t] || 0) + 1;
            }
            if (Object.keys(tally).length > 0) {
              const max = Math.max(...Object.values(tally));
              const winners = Object.entries(tally).filter(([, c]) => c === max).map(([n]) => n);
              const penalties = winners.map(name => ({ player_name: name, sips: card.drink_penalty, shots: 0, reason: `${max} glasova!` }));
              await applyAndAdvanceRef.current(penalties);
            } else {
              await advanceTurnRef.current();
            }
          } catch (err) {
            console.error("Most Likely tally failed:", err);
            await advanceTurnRef.current();
          }
        }
        return;
      }

      // 7. Categories / Chaos / Rule — acknowledge to advance
      if (action.action_type === "acknowledge") {
        const player = ps.find(p => p.id === action.player_id);
        if (player && ps[fresh.current_player_idx]?.id === player.id) {
          await advanceTurnRef.current();
        }
        return;
      }

      // 8. Battle move from a phone
      if (action.action_type === "battle_move" && card.card_type === "boss_fight") {
        const moveIdx = (action.payload as { move_idx?: number }).move_idx;
        if (typeof moveIdx !== "number") return;
        const curBattle = battleRef.current;
        if (!curBattle) return;
        const expectedPlayerId = curBattle.selectingFor === "p1" ? curBattle.p1Player.id : curBattle.p2Player.id;
        if (action.player_id !== expectedPlayerId) return;
        await submitBattleMoveRef.current(moveIdx);
        return;
      }
    });
    // ⚠ Subscribe ONCE per code — refs handle the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Helper used by phone-triggered draw — same logic as drawNewCard but
  // operates on a state snapshot we already have.
  async function drawNewCardForState(fresh: GameState, ps: PlayerRow[]) {
    if (drawingRef.current) return;
    if (fresh.card_phase !== "draw") return;
    drawingRef.current = true;
    try {
      const isGroomTurn = ps[fresh.current_player_idx]?.is_groom || false;
      const card = drawCard({ currentRound: fresh.current_round, isGroomTurn, bossFightCooldown: 99 });

      if (card.card_type === "boss_fight" && ps.length >= 2) {
        const p1 = ps[fresh.current_player_idx];
        const others = ps.filter(p => p.id !== p1.id);
        const p2 = others[Math.floor(Math.random() * others.length)];
        const battleState = createBattleState(p1.fighter_id, p2.fighter_id);
        const initialMessage = `${p1.name} VS ${p2.name}! ${p1.name}, odaberi potez!`;
        const newBattle: LocalBattle = {
          state: battleState,
          p1Player: p1, p2Player: p2,
          p1Move: null, p2Move: null,
          selectingFor: "p1",
          selectedMoveIdx: 0,
          message: initialMessage,
          resolved: false,
        };
        setBattle(newBattle);
        battleRef.current = newBattle;
        const battleSync = syncFromBattle(battleState, p1.id, p2.id, p1.name, p2.name, "p1", null, initialMessage, false);
        await updateRoomState(code, { ...fresh, current_card: card, card_phase: "show", battle: battleSync });
        const battleTracks = ["Thunderstruck", "Killing In", "Enter Sandman", "Mortal Kombat"];
        playRandomTrack(battleTracks);
        return;
      }

      setVoteTally({});
      setActedPlayerIds(new Set());
      actedPlayerIdsRef.current = new Set();
      await updateRoomState(code, { ...fresh, current_card: card, card_phase: "show", battle: null });
    } finally {
      drawingRef.current = false;
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────

  // We assemble each phase into `phaseContent`, then return once at the
  // bottom with a SINGLE persistent <audio> element. Without this the
  // audio DOM node unmounts on every phase transition (lobby→playing→
  // ended) and the music briefly stops + restarts.
  let phaseContent: React.ReactNode = null;

  if (!state) {
    phaseContent = <div className="min-h-screen flex items-center justify-center bg-[#0c0c14] text-white">Ucitavanje...</div>;
  } else if (state.phase === "lobby") {
    phaseContent = (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c14] text-white p-8">
        <h1 className="text-6xl md:text-8xl font-bold text-[#FFC828] mb-2 tracking-wider">BACHELOR</h1>
        <h2 className="text-5xl md:text-7xl font-bold text-[#DC3232] mb-12 tracking-wider">SPECIAL</h2>

        <div className="flex flex-col md:flex-row gap-12 items-center">
          <div className="bg-white p-6 rounded-2xl">
            <QRCodeSVG value={joinUrl} size={280} level="H" />
          </div>
          <div className="text-center md:text-left">
            <p className="text-zinc-400 text-sm mb-2">SKENIRAJ S MOBITELOM</p>
            <p className="text-zinc-400 text-sm mb-4">ili udji na:</p>
            <p className="text-xl text-[#FFC828] mb-2 break-all">{joinUrl}</p>
            <p className="text-zinc-500 text-xs mt-4 mb-2">KOD SOBE</p>
            <p className="text-7xl md:text-9xl font-bold text-[#FFC828] tracking-[0.2em]">{code}</p>
          </div>
        </div>

        <div className="mt-12 w-full max-w-4xl">
          <p className="text-center text-zinc-400 mb-4">IGRACI: {players.length} / 15</p>
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
          <button onClick={startGame}
            className="mt-8 bg-[#FFC828] text-black font-bold py-4 px-12 text-2xl rounded-lg hover:bg-[#FFD850] active:scale-95 transition shadow-2xl animate-pulse-glow">
            POKRENI IGRU
          </button>
        )}

        {/* Lobby admin: exit + kick */}
        <div className="mt-8 flex gap-3">
          <button onClick={() => setShowKickMenu(s => !s)}
            className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm px-4 py-2 rounded">
            👥 Igraci ({players.length})
          </button>
          <button onClick={exitToHome}
            className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm px-4 py-2 rounded">
            ❌ Izlaz
          </button>
        </div>

        {/* Kick menu in lobby */}
        {showKickMenu && players.length > 0 && (
          <div className="mt-3 p-3 bg-[#1a1a28] border border-zinc-700 rounded max-w-sm w-full">
            <p className="text-xs text-zinc-500 mb-2 text-center">KLIKNI ZA IZBACITI</p>
            {players.map(p => (
              <button key={p.id} onClick={() => handleKickPlayer(p)}
                className="w-full flex items-center gap-2 text-sm py-1.5 px-2 hover:bg-zinc-800 rounded">
                <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-6 h-6 pixel-art" />
                <span className="text-white truncate flex-1 text-left">{p.is_groom && "★"}{p.name}</span>
                <span className="text-red-500">×</span>
              </button>
            ))}
          </div>
        )}

        {/* Confirmation dialog */}
        {confirmDialog && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
            <div className="bg-[#1a1a28] border-4 border-[#FFC828] rounded-2xl p-8 max-w-md text-center">
              <p className="text-xl text-white mb-6">{confirmDialog.message}</p>
              <div className="flex gap-4 justify-center">
                <button onClick={confirmDialog.onYes}
                  className="bg-[#DC3232] hover:bg-[#FF4848] text-white font-bold py-3 px-8 rounded-lg">DA</button>
                <button onClick={() => setConfirmDialog(null)}
                  className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-8 rounded-lg">NE</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } else if (state.phase === "playing") {
    // Clamp in case a player was kicked mid-turn and the stored idx is stale
    const safeIdx = players.length > 0 ? state.current_player_idx % players.length : 0;
    const currentPlayer = players[safeIdx];
    const card = state.current_card;

    phaseContent = (
      <div className="min-h-screen flex flex-col bg-[#0c0c14] text-white relative">
        {/* TOP BAR */}
        <div className="px-6 py-3 bg-black/60 flex justify-between items-center border-b border-[#FFC828]/30">
          <div className="text-base">
            <span className="text-zinc-400">Runda </span>
            <span className="text-[#FFC828] font-bold">{state.current_round}</span>
            <span className="text-zinc-400">: </span>
            <span className="text-[#FFC828]">{ROUND_NAMES[state.current_round]}</span>
          </div>
          <div className="text-base text-zinc-400">
            Karta <span className="text-white">{state.cards_in_round + 1}</span>/{CARDS_PER_ROUND}
          </div>
          <button
            onClick={() => setShowAdminPanel(p => !p)}
            className="text-sm text-zinc-500 hover:text-white px-3 py-1 border border-zinc-700 rounded">
            {showAdminPanel ? "Sakrij" : "Admin"}
          </button>
        </div>

        {/* WHOSE TURN — BIG INDICATOR */}
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

        {/* MAIN CONTENT */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-4">
          {state.card_phase === "draw" && currentPlayer && (
            <div className="text-center">
              <p className="text-2xl text-zinc-400 mb-6">Cekamo da {currentPlayer.name} izvuce kartu...</p>
              <button onClick={drawNewCard}
                className="bg-[#FFC828] text-black font-bold py-6 px-12 text-3xl rounded-xl hover:bg-[#FFD850] transition animate-pulse-glow">
                🎴 VUCI KARTU
              </button>
            </div>
          )}

          {state.card_phase === "show" && card && !battle && (
            <CardDisplay card={card} voteTally={voteTally} actedCount={actedPlayerIds.size} totalPlayers={players.length} />
          )}

          {state.card_phase === "show" && card && battle && (
            <div className="w-full max-w-5xl">
              <div className="text-center mb-3">
                <p className="text-zinc-500 text-xs">BOSS FIGHT</p>
                <p className="text-2xl text-[#FFC828]">
                  {battle.selectingFor === "p1" ? battle.p1Player.name : battle.p2Player.name}, odaberi potez!
                </p>
              </div>
              <BattleScene
                state={battle.selectingFor === "p1" || battle.resolved
                  ? battle.state
                  : { ...battle.state, player1: battle.state.player2, player2: battle.state.player1 }}
                showMoves={!battle.resolved}
                selectedMoveIdx={battle.selectedMoveIdx}
                onMoveSelect={handleBattleMoveSelect}
                onMoveConfirm={handleBattleMoveConfirm}
                currentMessage={battle.message}
                mode="host"
              />
              {battle.resolved && (
                <div className="text-center mt-4">
                  <button onClick={finishBattle}
                    className="bg-[#FFC828] text-black font-bold py-4 px-12 text-2xl rounded-xl hover:bg-[#FFD850] active:scale-95">
                    KRAJ BORBE
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* BOTTOM HUD — Players */}
        <PlayerHUD players={players} currentPlayerName={currentPlayer?.name} actedPlayerIds={actedPlayerIds} />

        {/* ADMIN PANEL — Right side */}
        {showAdminPanel && (
          <div className="fixed top-20 right-4 bg-black/90 border-2 border-[#FFC828]/50 rounded-lg p-4 w-96 z-40 max-h-[calc(100vh-100px)] overflow-y-auto shadow-2xl">
            <p className="text-base text-[#FFC828] mb-3 font-bold flex items-center justify-between">
              ADMIN <span className="text-xs text-zinc-500">SOBA: {code}</span>
            </p>

            {/* Game flow controls */}
            <p className="text-xs text-zinc-500 mb-2 mt-2 tracking-wider">TIJEK IGRE</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={drawNewCard}
                disabled={state.card_phase !== "draw"}
                className="bg-[#28A050] hover:bg-[#3CB464] text-white text-sm py-2.5 rounded disabled:opacity-30 disabled:cursor-not-allowed">
                🎴 Vuci kartu
              </button>
              <button onClick={skipCard}
                className="bg-[#28508C] hover:bg-[#3264B4] text-white text-sm py-2.5 rounded">
                ⏭ Preskoci
              </button>
            </div>

            {/* Game state controls */}
            <p className="text-xs text-zinc-500 mb-2 mt-4 tracking-wider">UPRAVLJANJE</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowKickMenu(s => !s)}
                className="bg-[#7828A0] hover:bg-[#9438C0] text-white text-sm py-2.5 rounded">
                👥 Igraci ({players.length})
              </button>
              <button onClick={backToLobby}
                className="bg-[#B46414] hover:bg-[#D47828] text-white text-sm py-2.5 rounded">
                🏠 Predvorje
              </button>
              <button onClick={restartGame}
                className="bg-[#B46414] hover:bg-[#D47828] text-white text-sm py-2.5 rounded">
                🔄 Restartaj
              </button>
              <button onClick={endGameNow}
                className="bg-[#DC3232] hover:bg-[#FF4848] text-white text-sm py-2.5 rounded">
                🏁 Zavrsi
              </button>
              <button onClick={exitToHome}
                className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm py-2.5 rounded col-span-2">
                ❌ Izlaz iz igre
              </button>
            </div>

            {/* Player list / kick menu */}
            {showKickMenu && (
              <div className="mt-3 p-2 bg-zinc-900 rounded border border-zinc-700">
                <p className="text-xs text-zinc-500 mb-1">KLIKNI ZA IZBACITI</p>
                {players.map(p => (
                  <button key={p.id} onClick={() => handleKickPlayer(p)}
                    className="w-full flex items-center gap-2 text-sm py-1.5 px-2 hover:bg-zinc-800 rounded">
                    <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-6 h-6 pixel-art" />
                    <span className="text-white truncate flex-1 text-left">{p.is_groom && "★ "}{p.name}</span>
                    <span className="text-zinc-500 text-xs">{p.total_sips}g</span>
                    <span className="text-red-500 text-base">×</span>
                  </button>
                ))}
              </div>
            )}

            {/* Music controls */}
            <p className="text-xs text-zinc-500 mb-2 mt-4 tracking-wider">MUZIKA</p>
            <div className="bg-black/50 rounded-lg px-3 py-2 mb-2 h-9 overflow-hidden border border-zinc-800 flex items-center">
              {currentTrack
                ? <ScrollingText text={`♪ ${currentTrack}`} />
                : <p className="text-sm text-zinc-600">— nema pjesme —</p>}
            </div>
            <div className="flex gap-1.5 mb-2">
              <button onClick={prevTrack} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-base py-2 rounded" title="Prosla">⏮</button>
              <button onClick={togglePause} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-base py-2 rounded" title={musicPaused ? "Reproduciraj" : "Pauziraj"}>{musicPaused ? "▶" : "⏸"}</button>
              <button onClick={nextTrack} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-base py-2 rounded" title="Sljedeca">⏭</button>
              <button onClick={toggleMute} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-base py-2 rounded" title={musicMuted ? "Ukljuci zvuk" : "Iskljuci zvuk"}>{musicMuted ? "🔇" : "🔊"}</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 w-10 text-right">{Math.round(musicVolume * 100)}%</span>
              <input type="range" min="0" max="100" value={musicVolume * 100}
                onChange={(e) => {
                  const v = parseInt(e.target.value) / 100;
                  setMusicVolume(v);
                  if (audioRef.current && !musicMuted) audioRef.current.volume = v;
                }}
                className="flex-1 accent-[#FFC828]" />
            </div>
            <p className="text-xs text-zinc-600 mt-2 text-center">{tracks.length} pjesama u listi</p>
          </div>
        )}

        {/* Confirmation dialog overlay */}
        {confirmDialog && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
            <div className="bg-[#1a1a28] border-4 border-[#FFC828] rounded-2xl p-8 max-w-md text-center">
              <p className="text-xl text-white mb-6">{confirmDialog.message}</p>
              <div className="flex gap-4 justify-center">
                <button onClick={confirmDialog.onYes}
                  className="bg-[#DC3232] hover:bg-[#FF4848] text-white font-bold py-3 px-8 rounded-lg">
                  DA
                </button>
                <button onClick={() => setConfirmDialog(null)}
                  className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-8 rounded-lg">
                  NE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } else if (state.phase === "ended") {
    const newGameAction = async () => {
      await resetRoomToLobby(code);
      if (audioRef.current) audioRef.current.pause();
      setVoteTally({});
      setActedPlayerIds(new Set());
      actedPlayerIdsRef.current = new Set();
    };
    phaseContent = (
      <>
        <CreditsScreen
          players={players}
          actions={
            <>
              <button onClick={newGameAction}
                className="bg-[#28A050] hover:bg-[#3CB464] text-white font-bold py-3 px-6 rounded-lg">
                🔄 NOVA IGRA
              </button>
              <button onClick={newGameAction}
                className="bg-[#28508C] hover:bg-[#3264B4] text-white font-bold py-3 px-6 rounded-lg">
                🏠 U PREDVORJE
              </button>
              <button onClick={exitToHome}
                className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-6 rounded-lg">
                ❌ IZLAZ
              </button>
            </>
          }
        />
        {confirmDialog && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
            <div className="bg-[#1a1a28] border-4 border-[#FFC828] rounded-2xl p-8 max-w-md text-center">
              <p className="text-xl text-white mb-6">{confirmDialog.message}</p>
              <div className="flex gap-4 justify-center">
                <button onClick={confirmDialog.onYes}
                  className="bg-[#DC3232] hover:bg-[#FF4848] text-white font-bold py-3 px-8 rounded-lg">DA</button>
                <button onClick={() => setConfirmDialog(null)}
                  className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-8 rounded-lg">NE</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {phaseContent}
      {/* Single persistent audio element — outside phase switches so the
          current track keeps playing through lobby → playing → ended. */}
      <audio ref={audioRef} onEnded={nextTrack} />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ScrollingText - marquee for long track names
// ────────────────────────────────────────────────────────────────────────────

function ScrollingText({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);

  useEffect(() => {
    if (!ref.current || !innerRef.current) return;
    const measure = () => {
      if (!ref.current || !innerRef.current) return;
      const containerW = ref.current.clientWidth;
      const textW = innerRef.current.scrollWidth;
      setNeedsScroll(textW > containerW + 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div ref={ref} className="relative w-full h-full overflow-hidden whitespace-nowrap flex items-center">
      <div
        ref={innerRef}
        className={`text-sm text-zinc-200 inline-block ${needsScroll ? "animate-marquee" : ""}`}
        style={needsScroll ? { paddingLeft: "100%" } : {}}
      >
        {text}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CARD DISPLAY (the big TV view)
// ────────────────────────────────────────────────────────────────────────────

function CardDisplay({ card, voteTally, actedCount, totalPlayers }: {
  card: GameCard; voteTally: Record<string, number>; actedCount: number; totalPlayers: number;
}) {
  const colors = CARD_COLORS[card.card_type as keyof typeof CARD_COLORS];

  return (
    <div className="w-full max-w-5xl">
      <div
        className="rounded-2xl border-4 p-12 shadow-2xl"
        style={{
          backgroundColor: colors?.bg || "#333",
          borderColor: colors?.accent || "#888",
          color: colors?.text || "#fff",
        }}
      >
        <h2 className="text-3xl md:text-5xl font-bold text-center mb-2 tracking-wider">{card.title}</h2>
        <div className="border-t-2 my-6 opacity-50" style={{ borderColor: colors?.accent }} />

        <p className="text-2xl md:text-4xl text-center leading-relaxed py-8">{card.content}</p>

        {card.content_b && (
          <>
            <p className="text-center text-xl my-4 opacity-70">— ILI —</p>
            <p className="text-2xl md:text-4xl text-center leading-relaxed py-8">{card.content_b}</p>
          </>
        )}

        {card.instruction && (
          <p className="text-center text-xl mt-6" style={{ color: colors?.accent }}>{card.instruction}</p>
        )}

        {card.is_groom_targeted && (
          <p className="text-center text-2xl mt-4 text-[#FFC828] animate-pulse">★ MLADOZENJA ★</p>
        )}
      </div>

      {/* Live vote tally for vote cards */}
      {(card.card_type === "wyr" || card.card_type === "hot_take") && Object.keys(voteTally).length > 0 && (
        <div className="mt-6 flex justify-center gap-8 text-2xl">
          <div className="text-[#28A050]">
            {card.card_type === "hot_take" ? "ZA" : "A"}: {voteTally.a || 0}
          </div>
          <div className="text-[#DC3232]">
            {card.card_type === "hot_take" ? "PROTIV" : "B"}: {voteTally.b || 0}
          </div>
        </div>
      )}

      {/* Most Likely live tally */}
      {card.card_type === "most_likely" && Object.keys(voteTally).length > 0 && (
        <div className="mt-6 max-w-md mx-auto">
          {Object.entries(voteTally).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
            <div key={name} className="flex items-center gap-3 mb-1">
              <span className="text-white text-lg w-32 truncate">{name}</span>
              <div className="flex-1 bg-zinc-800 rounded h-3">
                <div className="bg-[#FFC828] h-3 rounded" style={{ width: `${(count / totalPlayers) * 100}%` }} />
              </div>
              <span className="text-[#FFC828] text-lg w-8">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action progress for any voting card */}
      {(card.card_type === "nhie" || card.card_type === "wyr" || card.card_type === "hot_take" || card.card_type === "most_likely") && (
        <p className="text-center text-zinc-400 mt-4 text-sm">
          {actedCount} / {totalPlayers} glasovalo
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PLAYER HUD (bottom of TV)
// ────────────────────────────────────────────────────────────────────────────

function PlayerHUD({ players, currentPlayerName, actedPlayerIds }: {
  players: PlayerRow[]; currentPlayerName?: string; actedPlayerIds: Set<string>;
}) {
  return (
    <div className="bg-black/80 border-t-2 border-[#FFC828] py-2 px-2">
      <div className="flex gap-1 justify-around overflow-x-auto">
        {players.map((p) => {
          const isCurrent = p.name === currentPlayerName;
          const hasActed = actedPlayerIds.has(p.id);
          return (
            <div key={p.id}
              className={`flex flex-col items-center min-w-[64px] px-1 py-1 rounded transition ${
                isCurrent ? "bg-[#FFC828]/20 border border-[#FFC828]" : ""
              } ${hasActed ? "opacity-100" : "opacity-80"}`}>
              <div className="relative">
                <img src={spriteUrl(p.fighter_id)} alt={p.name} className="w-10 h-10 pixel-art" />
                {hasActed && (
                  <span className="absolute -top-1 -right-1 text-green-400 text-xs">✓</span>
                )}
              </div>
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

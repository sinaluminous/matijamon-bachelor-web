// Room management — create rooms, join, sync state to Supabase.

import { supabase, type GameState, type RoomRow, type PlayerRow, type GameCard, type DrinkPenalty } from "./supabase";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 to avoid typos

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export function getOrCreateSessionToken(): string {
  if (typeof window === "undefined") return "server";
  let token = localStorage.getItem("matijamon_session_token");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("matijamon_session_token", token);
  }
  return token;
}

export function emptyGameState(): GameState {
  return {
    phase: "lobby",
    current_round: 1,
    cards_in_round: 0,
    total_cards_drawn: 0,
    current_player_idx: 0,
    current_card: null,
    card_phase: "draw",
    active_rules: [],
    pending_drinks: [],
    vote_state: null,
    music_track: null,
  };
}

export async function createRoom(): Promise<{ code: string; hostId: string }> {
  // Try a few times in case of code collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const hostId = crypto.randomUUID();
    const { error } = await supabase
      .from("rooms")
      .insert({
        code,
        state: emptyGameState(),
        host_id: hostId,
      })
      .select()
      .single();
    if (!error) return { code, hostId };
  }
  throw new Error("Could not create room after 5 attempts");
}

export async function getRoom(code: string): Promise<RoomRow | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data as RoomRow | null;
}

export async function updateRoomState(code: string, state: GameState): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({
      state,
      updated_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
    })
    .eq("code", code);
  if (error) throw error;
}

export async function joinRoom(
  code: string,
  name: string,
  fighterId: string,
  isGroom: boolean,
  isKum: boolean,
): Promise<PlayerRow> {
  const sessionToken = getOrCreateSessionToken();

  // Try to find existing player with this session token (rejoin)
  const { data: existing } = await supabase
    .from("players")
    .select("*")
    .eq("room_code", code)
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (existing) {
    // Update last_seen and return
    await supabase
      .from("players")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", existing.id);
    return existing as PlayerRow;
  }

  // New player
  const { data, error } = await supabase
    .from("players")
    .insert({
      room_code: code,
      name: name.toUpperCase().slice(0, 12),
      fighter_id: fighterId,
      is_groom: isGroom,
      is_kum: isKum,
      session_token: sessionToken,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PlayerRow;
}

export async function getPlayers(roomCode: string): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("room_code", roomCode)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data || []) as PlayerRow[];
}

export async function applyDrinks(
  roomCode: string,
  penalties: DrinkPenalty[],
): Promise<void> {
  const players = await getPlayers(roomCode);
  for (const pen of penalties) {
    const player = players.find(p => p.name === pen.player_name);
    if (!player) continue;
    await supabase
      .from("players")
      .update({
        total_sips: player.total_sips + pen.sips,
        total_shots: player.total_shots + pen.shots,
      })
      .eq("id", player.id);
  }
}

export async function recordPlayerAction(
  roomCode: string,
  playerId: string,
  actionType: string,
  payload: Record<string, unknown> = {},
  cardId: string | null = null,
): Promise<void> {
  await supabase.from("player_actions").insert({
    room_code: roomCode,
    player_id: playerId,
    action_type: actionType,
    payload,
    card_id: cardId,
  });
}

export async function clearActionsForCard(roomCode: string, cardId: string): Promise<void> {
  await supabase.from("player_actions").delete()
    .eq("room_code", roomCode)
    .eq("card_id", cardId);
}

export async function resetRoomToLobby(roomCode: string): Promise<void> {
  await updateRoomState(roomCode, emptyGameState());
  // Reset all player stats
  await supabase
    .from("players")
    .update({
      total_sips: 0,
      total_shots: 0,
      chickened_out_count: 0,
      drinks_caused: 0,
      cards_drawn: 0,
      mates: [],
    })
    .eq("room_code", roomCode);
  // Clear all actions
  await supabase.from("player_actions").delete().eq("room_code", roomCode);
}

export async function deleteRoom(roomCode: string): Promise<void> {
  await supabase.from("rooms").delete().eq("code", roomCode);
}

export async function kickPlayer(playerId: string): Promise<void> {
  await supabase.from("players").delete().eq("id", playerId);
}

export function subscribeToRoom(
  roomCode: string,
  onChange: (state: GameState) => void,
) {
  const channel = supabase
    .channel(`room:${roomCode}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "rooms",
        filter: `code=eq.${roomCode}`,
      },
      (payload) => {
        if (payload.new && (payload.new as RoomRow).state) {
          onChange((payload.new as RoomRow).state);
        }
      },
    )
    .subscribe();
  return () => {
    channel.unsubscribe();
  };
}

export function subscribeToPlayers(
  roomCode: string,
  onChange: (players: PlayerRow[]) => void,
) {
  const refresh = async () => {
    const players = await getPlayers(roomCode);
    onChange(players);
  };

  refresh();

  const channel = supabase
    .channel(`players:${roomCode}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players",
        filter: `room_code=eq.${roomCode}`,
      },
      () => refresh(),
    )
    .subscribe();
  return () => {
    channel.unsubscribe();
  };
}

export function subscribeToActions(
  roomCode: string,
  onAction: (action: { player_id: string; action_type: string; payload: Record<string, unknown>; card_id: string | null }) => void,
) {
  const channel = supabase
    .channel(`actions:${roomCode}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "player_actions",
        filter: `room_code=eq.${roomCode}`,
      },
      (payload) => {
        onAction(payload.new as { player_id: string; action_type: string; payload: Record<string, unknown>; card_id: string | null });
      },
    )
    .subscribe();
  return () => {
    channel.unsubscribe();
  };
}

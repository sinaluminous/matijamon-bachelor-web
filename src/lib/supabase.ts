import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !key) {
  throw new Error("Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
}

export const supabase = createClient(url, key, {
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Database types
export interface RoomRow {
  code: string;
  state: GameState;
  host_id: string | null;
  created_at: string;
  updated_at: string;
  last_activity: string;
}

export interface PlayerRow {
  id: string;
  room_code: string;
  name: string;
  fighter_id: string;
  is_groom: boolean;
  is_kum: boolean;
  total_sips: number;
  total_shots: number;
  chickened_out_count: number;
  drinks_caused: number;
  cards_drawn: number;
  mates: string[];
  joined_at: string;
  last_seen: string;
  session_token: string;
}

export interface PlayerActionRow {
  id: string;
  room_code: string;
  player_id: string;
  action_type: string;
  payload: Json;
  card_id: string | null;
  created_at: string;
}

// Game state stored as JSON in rooms.state
export interface GameState {
  phase: "lobby" | "intro" | "playing" | "round_transition" | "ended";
  current_round: number;
  cards_in_round: number;
  total_cards_drawn: number;
  current_player_idx: number;
  current_card: GameCard | null;
  card_phase: "draw" | "show" | "vote" | "result";
  active_rules: string[];
  pending_drinks: DrinkPenalty[];
  vote_state: VoteState | null;
  music_track: string | null;
}

export interface GameCard {
  id: string;
  card_type: string;
  title: string;
  content: string;
  content_b?: string;
  instruction: string;
  drink_penalty: number;
  drink_penalty_skip: number;
  is_groom_targeted: boolean;
  target_type: string;
  effect?: string;
  sub_type?: string;
}

export interface DrinkPenalty {
  player_name: string;
  sips: number;
  shots: number;
  reason: string;
}

export interface VoteState {
  type: "single_pick" | "group_pick" | "binary";
  options?: { label: string; color: [number, number, number] }[];
  votes: Record<string, string>; // player_id -> their vote
  required_voters?: string[]; // player IDs who need to vote (group votes)
}

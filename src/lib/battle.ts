// MATIJAMON battle engine — TypeScript port of battle_engine.py
// Pokemon FireRed-style turn-based combat with substance types.
//
// Simplified port:
//  - Full damage formula with STAB, type chart, crit, accuracy, random factor
//  - Stat stages -4 to +4
//  - Status effects (drunk, stoned, wired, asleep, silenced, burned)
//  - Iconic character passives (Matija beer phases, Pasko jack-of-all, Covic immune,
//    Fixx overclock, Sina endless roll, Goran 5-stack, Marin bad trip, Denis dad energy)
//  - Move resolution with miss/crit/super effective messaging
//  - Battle log with structured events for UI to consume

import charactersData from "@/data/characters.json";

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

export type SubstanceType = "alcohol" | "weed" | "amphetamines" | "psychedelics" | "neutral" | "all";
export type MoveCategory = "physical" | "special" | "status";

export interface MoveData {
  name: string;
  type: SubstanceType;
  category: MoveCategory;
  power: number;
  accuracy?: number;
  description?: string;
  pp?: number;
  max_pp?: number;
}

export interface FighterData {
  id: string;
  name: string;
  title: string;
  types: SubstanceType[];
  tags?: string[];
  passive?: string;
  passive_desc?: string;
  stats: { HP: number; Atk: number; Def: number; SpA: number; SpD: number; Spe: number };
  flavor?: string;
  moves: MoveData[];
}

export interface BattleFighter {
  id: string;
  name: string;
  title: string;
  types: SubstanceType[];
  tags: string[];
  passive: string;
  // Base stats
  base: { HP: number; Atk: number; Def: number; SpA: number; SpD: number; Spe: number };
  max_hp: number;
  current_hp: number;
  // Stat stages (-4 to +4)
  stages: { atk: number; def: number; spa: number; spd: number; spe: number };
  // Status effects
  status: {
    drunk: boolean;
    stoned: boolean;
    wired: boolean;
    asleep: boolean;
    silenced: boolean;
    burned: boolean;
  };
  status_turns: { drunk: number; stoned: number; wired: number; asleep: number; silenced: number; burned: number };
  // Substance counters (for Beer Phases, Endless Roll, etc)
  substance: { alcohol: number; weed: number; amphetamines: number; psychedelics: number };
  // Volatile flags (one-turn effects)
  volatile: {
    blackout_used: boolean;
    overclock_used: boolean;
    next_attack_crit: boolean;
    next_attack_miss: boolean;
    skip_next_turn: boolean;
    ratchet_mode: boolean;
  };
  // Available moves for this battle (4 random from move pool)
  moves: MoveData[];
}

export interface BattleEvent {
  type: "msg" | "damage" | "heal" | "miss" | "crit" | "super_effective" | "not_very_effective"
        | "ko" | "stat_change" | "status_apply" | "status_proc" | "draw" | "drink_trigger"
        | "blackout" | "passive";
  text?: string;
  attacker?: string;
  defender?: string;
  damage?: number;
  effectiveness?: number;
  // For drink triggers — these are real-life sip penalties tied to the in-game event
  drinkTarget?: "attacker" | "defender" | "all" | "spectators";
  drinkAmount?: number;
}

export interface TurnResult {
  events: BattleEvent[];
  isOver: boolean;
  winnerId: string | null;
}

export interface BattleState {
  player1: BattleFighter;
  player2: BattleFighter;
  turn: number;
  isOver: boolean;
  winnerId: string | null;
  log: BattleEvent[];
}

// ────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

export const TYPE_CHART: Record<string, number> = {
  // Super effective: weed > alcohol > psychedelics > amphetamines > weed
  "weed:alcohol": 2.0,
  "alcohol:psychedelics": 2.0,
  "psychedelics:amphetamines": 2.0,
  "amphetamines:weed": 2.0,
  // Same-type (resisted)
  "weed:weed": 0.5,
  "alcohol:alcohol": 0.5,
  "psychedelics:psychedelics": 0.5,
  "amphetamines:amphetamines": 0.5,
  // Reverse (resisted)
  "weed:amphetamines": 0.5,
  "alcohol:weed": 0.5,
  "psychedelics:alcohol": 0.5,
  "amphetamines:psychedelics": 0.5,
};

const STAGE_MULTIPLIERS: Record<number, number> = {
  [-4]: 0.33, [-3]: 0.40, [-2]: 0.50, [-1]: 0.66,
  [0]: 1.0,
  [1]: 1.5, [2]: 2.0, [3]: 2.5, [4]: 3.0,
};

export const TYPE_COLORS: Record<string, string> = {
  alcohol:      "#C83232",
  amphetamines: "#E6B41E",
  psychedelics: "#9632C8",
  weed:         "#32B432",
  all:          "#C8C8C8",
  neutral:      "#A0A0A0",
};

// ────────────────────────────────────────────────────────────────────────────
// FIGHTER FACTORY
// ────────────────────────────────────────────────────────────────────────────

const FIGHTERS: Record<string, FighterData> = {};
for (const f of charactersData as FighterData[]) {
  FIGHTERS[f.id] = f;
}

export function getFighterData(id: string): FighterData | undefined {
  return FIGHTERS[id];
}

export function listAllFighters(): FighterData[] {
  return Object.values(FIGHTERS);
}

/** Pick N random moves from the fighter's pool, ensuring at least one damaging move if possible. */
function pickRandomMoves(pool: MoveData[], count: number = 4): MoveData[] {
  if (pool.length <= count) return [...pool];
  const damaging = pool.filter(m => m.power > 0);
  const status = pool.filter(m => m.power === 0);
  const picks: MoveData[] = [];

  // Guarantee at least one damaging move
  if (damaging.length > 0) {
    picks.push(damaging[Math.floor(Math.random() * damaging.length)]);
  }
  // Fill rest with random from full pool
  const remaining = pool.filter(m => !picks.includes(m));
  while (picks.length < count && remaining.length > 0) {
    const idx = Math.floor(Math.random() * remaining.length);
    picks.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picks;
}

export function createBattleFighter(id: string): BattleFighter {
  const data = FIGHTERS[id];
  if (!data) throw new Error(`Fighter not found: ${id}`);

  const max_hp = data.stats.HP * 25;

  const moves = pickRandomMoves(data.moves, 4).map(m => ({
    ...m,
    pp: m.pp ?? defaultPP(m),
    max_pp: m.max_pp ?? defaultPP(m),
  }));

  return {
    id: data.id,
    name: data.name,
    title: data.title,
    types: data.types,
    tags: data.tags || [],
    passive: data.passive || "",
    base: { ...data.stats },
    max_hp,
    current_hp: max_hp,
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    status: { drunk: false, stoned: false, wired: false, asleep: false, silenced: false, burned: false },
    status_turns: { drunk: 0, stoned: 0, wired: 0, asleep: 0, silenced: 0, burned: 0 },
    substance: { alcohol: 0, weed: 0, amphetamines: 0, psychedelics: 0 },
    volatile: { blackout_used: false, overclock_used: false, next_attack_crit: false, next_attack_miss: false, skip_next_turn: false, ratchet_mode: false },
    moves,
  };
}

function defaultPP(move: MoveData): number {
  if (move.pp != null) return move.pp;
  const power = move.power || 0;
  const cat = (move.category || "").toLowerCase();
  if (cat === "status" || power <= 0) return 11;
  if (power >= 110) return 4;
  if (power >= 90) return 7;
  if (power >= 70) return 11;
  if (power >= 50) return 15;
  return 19;
}

// ────────────────────────────────────────────────────────────────────────────
// STAT CALCULATION
// ────────────────────────────────────────────────────────────────────────────

export function getEffectiveStat(f: BattleFighter, stat: "atk" | "def" | "spa" | "spd" | "spe"): number {
  const baseMap = { atk: f.base.Atk, def: f.base.Def, spa: f.base.SpA, spd: f.base.SpD, spe: f.base.Spe };
  let value = baseMap[stat];

  // Apply stat stages
  const stage = f.stages[stat];
  value = Math.round(value * STAGE_MULTIPLIERS[stage] || 1);

  // Status modifiers
  if (stat === "spe" && f.status.drunk) value = Math.round(value * 0.7);
  if (stat === "spe" && f.status.stoned) value = Math.round(value * 0.8);
  if (stat === "spe" && f.status.wired) value = Math.round(value * 1.5);
  if (stat === "atk" && f.status.burned) value = Math.round(value * 0.7);
  if (stat === "atk" && f.status.asleep) value = Math.round(value * 0.5);

  // Matija beer phase: 3-4 alcohol = +2 to all (god mode)
  if (f.id === "matija") {
    const beers = f.substance.alcohol;
    if (beers >= 3 && beers <= 4) value = Math.round(value * 1.5);
    else if (beers >= 5) value = Math.round(value * 1.2); // chaos mode, slightly degraded
  }

  // Bliki loose cannon: 3+ alcohol = atk +3 def -2
  if (f.id === "bliki") {
    if (f.substance.alcohol >= 3 && stat === "atk") value = Math.round(value * 1.5);
    if (f.substance.alcohol >= 3 && stat === "def") value = Math.round(value * 0.7);
  }

  return Math.max(1, value);
}

// ────────────────────────────────────────────────────────────────────────────
// TYPE EFFECTIVENESS
// ────────────────────────────────────────────────────────────────────────────

export function getTypeEffectiveness(moveType: SubstanceType, defenderTypes: SubstanceType[]): number {
  if (moveType === "neutral") return 1.0;

  let mult = 1.0;
  for (const defType of defenderTypes) {
    // "all" type takes neutral damage from everything
    if (defType === "all") continue;
    const key = `${moveType}:${defType}`;
    if (TYPE_CHART[key]) mult *= TYPE_CHART[key];
  }
  return mult;
}

// ────────────────────────────────────────────────────────────────────────────
// DAMAGE CALCULATION
// ────────────────────────────────────────────────────────────────────────────

export function calculateDamage(
  attacker: BattleFighter,
  defender: BattleFighter,
  move: MoveData,
): { damage: number; events: BattleEvent[]; wasCrit: boolean; effectiveness: number } {
  const events: BattleEvent[] = [];
  let power = move.power;

  if (power <= 0) {
    return { damage: 0, events, wasCrit: false, effectiveness: 1.0 };
  }

  const moveType = move.type;

  // Sina endless roll: weed moves x2 after 3 weed moves
  if (attacker.id === "sina" && moveType === "weed" && attacker.substance.weed >= 3) {
    power = power * 2;
  }

  // Braovic ratchet mode: alcohol +50%, non-alcohol -50%
  if (attacker.volatile.ratchet_mode) {
    if (moveType === "alcohol") power = Math.round(power * 1.5);
    else if (moveType !== "neutral") power = Math.round(power * 0.5);
  }

  // Physical vs Special
  const aStat = move.category === "physical" ? getEffectiveStat(attacker, "atk") : getEffectiveStat(attacker, "spa");
  const dStat = move.category === "physical" ? getEffectiveStat(defender, "def") : getEffectiveStat(defender, "spd");

  // Base damage
  let damage = (power * aStat / Math.max(1, dStat)) / 3.7;

  // STAB
  let stab = 1.0;
  if (attacker.types.includes("all")) stab = 1.35;
  else if (attacker.types.includes(moveType)) stab = 1.5;

  // Type effectiveness
  const eff = getTypeEffectiveness(moveType, defender.types);
  if (eff >= 2.0) events.push({ type: "super_effective", text: "Super ucinkovito!" });
  else if (eff > 0 && eff < 1.0) events.push({ type: "not_very_effective", text: "Nije bas ucinkovito..." });

  // Critical hit (6.25% base, or forced)
  let critRoll = Math.random() < 0.0625;

  // Fixx overclock: first attack always crit
  if (attacker.id === "fixx" && !attacker.volatile.overclock_used) {
    critRoll = true;
    attacker.volatile.overclock_used = true;
    events.push({ type: "passive", text: `${attacker.name}'s Overclock! First strike crit!` });
  }
  // Pasko (all type): 50% chance overclock too
  if (attacker.types.includes("all") && !attacker.volatile.overclock_used && Math.random() < 0.5) {
    critRoll = true;
    attacker.volatile.overclock_used = true;
  }

  // Forced crit from previous move
  if (attacker.volatile.next_attack_crit) {
    critRoll = true;
    attacker.volatile.next_attack_crit = false;
  }

  // Covic crit immunity: until 2 alcohol stacks
  if (defender.id === "covic" && defender.substance.alcohol < 2) {
    critRoll = false;
  }

  const critMult = critRoll ? 1.5 : 1.0;
  if (critRoll) events.push({ type: "crit", text: "KRITICAN UDARAC!" });

  // Random factor (0.85 - 1.0)
  const rand = 0.85 + Math.random() * 0.15;

  damage = damage * stab * eff * critMult * rand;
  damage = Math.max(1, Math.round(damage));

  // Marin bad trip: 2x damage from psychedelics
  if (defender.id === "marin" && moveType === "psychedelics") {
    damage = damage * 2;
    events.push({ type: "passive", text: "Marin's BAD TRIP! Double damage." });
  }

  // Denis dad energy: 10% reduction from all damage
  if (defender.id === "denis") {
    damage = Math.max(1, Math.round(damage * 0.9));
  }

  return { damage, events, wasCrit: critRoll, effectiveness: eff };
}

// ────────────────────────────────────────────────────────────────────────────
// MOVE EXECUTION
// ────────────────────────────────────────────────────────────────────────────

export function executeMove(attacker: BattleFighter, defender: BattleFighter, move: MoveData): BattleEvent[] {
  const events: BattleEvent[] = [];
  events.push({ type: "msg", text: `${attacker.name} koristi ${move.name}!`, attacker: attacker.id });

  // Skip turn (asleep, drunk-skip, etc)
  if (attacker.volatile.skip_next_turn) {
    attacker.volatile.skip_next_turn = false;
    events.push({ type: "msg", text: `${attacker.name} preskace red...` });
    return events;
  }
  if (attacker.status.asleep) {
    if (Math.random() < 0.5) {
      events.push({ type: "msg", text: `${attacker.name} spava...` });
      return events;
    } else {
      attacker.status.asleep = false;
      events.push({ type: "msg", text: `${attacker.name} se probudio!` });
    }
  }
  if (attacker.status.silenced && move.category === "special") {
    events.push({ type: "msg", text: `${attacker.name} je usutkan, ne moze koristit ${move.name}!` });
    return events;
  }

  // Track substance use
  if (move.type === "alcohol") attacker.substance.alcohol++;
  if (move.type === "weed") attacker.substance.weed++;
  if (move.type === "amphetamines") attacker.substance.amphetamines++;
  if (move.type === "psychedelics") attacker.substance.psychedelics++;

  // PP tick
  if (move.pp != null && move.pp > 0) move.pp--;

  // Status moves: heal/stat changes
  if (move.category === "status" || move.power <= 0) {
    return handleStatusMove(attacker, defender, move, events);
  }

  // Accuracy check
  let accuracy = move.accuracy ?? 100;
  // Drunk -20% accuracy
  if (attacker.status.drunk) accuracy -= 20;
  // Rukavina -10% accuracy on everything
  if (attacker.id === "rukavina") accuracy -= 10;

  // Roll for hit
  if (!attacker.volatile.next_attack_miss && Math.random() * 100 > accuracy) {
    events.push({ type: "miss", text: `${attacker.name} promasio!` });
    events.push({ type: "drink_trigger", drinkTarget: "attacker", drinkAmount: 1, text: "Promasio = pije 1!" });
    return events;
  }
  attacker.volatile.next_attack_miss = false;

  // Calculate damage
  const { damage, events: dmgEvents, wasCrit, effectiveness } = calculateDamage(attacker, defender, move);
  events.push(...dmgEvents);

  // Apply damage
  if (damage > 0) {
    // Blackout: alcohol fighters survive 1 KO at 1 HP
    const wouldKO = defender.current_hp - damage <= 0;
    if (wouldKO && defender.types.includes("alcohol") && !defender.volatile.blackout_used) {
      defender.current_hp = 1;
      defender.volatile.blackout_used = true;
      events.push({ type: "blackout", text: `${defender.name} je blackout-ao na 1 HP!` });
      events.push({ type: "damage", damage, defender: defender.id });
    } else {
      defender.current_hp = Math.max(0, defender.current_hp - damage);
      events.push({ type: "damage", damage, defender: defender.id });
    }
  }

  // Drink triggers
  if (wasCrit) {
    events.push({ type: "drink_trigger", drinkTarget: "defender", drinkAmount: 1, text: "KRIT! Brani pije 1!" });
  }
  if (effectiveness >= 2.0) {
    events.push({ type: "drink_trigger", drinkTarget: "spectators", drinkAmount: 1, text: "Super ucinkovito! Spectatori piju 1!" });
  }

  // Check faint
  if (defender.current_hp <= 0) {
    events.push({ type: "ko", text: `${defender.name} se srusio!`, defender: defender.id });
    events.push({ type: "drink_trigger", drinkTarget: "defender", drinkAmount: 3, text: "KO! Gubitnik pije 3!" });
  }

  return events;
}

function handleStatusMove(attacker: BattleFighter, defender: BattleFighter, move: MoveData, events: BattleEvent[]): BattleEvent[] {
  const desc = (move.description || "").toLowerCase();

  // Heal moves
  if (desc.includes("heal")) {
    const heal = Math.round(attacker.max_hp * 0.25);
    attacker.current_hp = Math.min(attacker.max_hp, attacker.current_hp + heal);
    events.push({ type: "heal", text: `${attacker.name} se izlijecio (+${heal} HP)`, defender: attacker.id });
    return events;
  }

  // Beer chug = alcohol stack + sometimes heal
  if (move.name.toLowerCase().includes("beer") || move.name.toLowerCase().includes("chug")) {
    attacker.substance.alcohol++;
    const heal = Math.round(attacker.max_hp * 0.10);
    attacker.current_hp = Math.min(attacker.max_hp, attacker.current_hp + heal);
    events.push({ type: "heal", text: `${attacker.name} chuga pivo (+${heal} HP, +1 alkohol)`, defender: attacker.id });
    return events;
  }

  // Stat boost moves
  for (const [keyword, stat] of [["atk", "atk"], ["spa", "spa"], ["def", "def"], ["spd", "spd"], ["spe", "spe"]] as const) {
    if (desc.includes(`${keyword}+`) || desc.includes(`+${keyword}`) || desc.includes(`${keyword} +`)) {
      const stage = attacker.stages[stat];
      attacker.stages[stat] = Math.min(4, stage + 1);
      events.push({ type: "stat_change", text: `${attacker.name} ${keyword.toUpperCase()} +1`, attacker: attacker.id });
      return events;
    }
  }

  // Status apply
  if (desc.includes("drunk")) { defender.status.drunk = true; defender.status_turns.drunk = 3; events.push({ type: "status_apply", text: `${defender.name} je pijan!` }); return events; }
  if (desc.includes("stone") || desc.includes("smoke")) { defender.status.stoned = true; defender.status_turns.stoned = 3; events.push({ type: "status_apply", text: `${defender.name} je drogiran!` }); return events; }
  if (desc.includes("sleep") || desc.includes("knockout")) { defender.status.asleep = true; defender.status_turns.asleep = 2; events.push({ type: "status_apply", text: `${defender.name} je zaspao!` }); return events; }

  // Default: just a flavor message
  events.push({ type: "msg", text: `${move.name}!` });
  return events;
}

// ────────────────────────────────────────────────────────────────────────────
// TURN EXECUTION (both fighters' moves)
// ────────────────────────────────────────────────────────────────────────────

export function executeTurn(
  state: BattleState,
  p1MoveIdx: number,
  p2MoveIdx: number,
): TurnResult {
  const events: BattleEvent[] = [];
  state.turn++;

  events.push({ type: "msg", text: `── Runda ${state.turn} ──` });

  // Get moves
  const p1Move = state.player1.moves[p1MoveIdx] || state.player1.moves[0];
  const p2Move = state.player2.moves[p2MoveIdx] || state.player2.moves[0];

  // Determine order by speed
  const p1Speed = getEffectiveStat(state.player1, "spe");
  const p2Speed = getEffectiveStat(state.player2, "spe");
  const p1First = p1Speed > p2Speed || (p1Speed === p2Speed && Math.random() < 0.5);

  const order: Array<[BattleFighter, BattleFighter, MoveData]> = p1First
    ? [[state.player1, state.player2, p1Move], [state.player2, state.player1, p2Move]]
    : [[state.player2, state.player1, p2Move], [state.player1, state.player2, p1Move]];

  for (const [att, def, move] of order) {
    if (state.isOver) break;
    if (att.current_hp <= 0) continue;

    const moveEvents = executeMove(att, def, move);
    events.push(...moveEvents);

    if (def.current_hp <= 0 && !state.isOver) {
      state.isOver = true;
      state.winnerId = att.id;
      break;
    }
  }

  // End-of-turn: tick statuses, apply burn damage etc
  for (const f of [state.player1, state.player2]) {
    if (f.current_hp <= 0) continue;
    if (f.status.burned) {
      const burnDmg = Math.max(1, Math.round(f.max_hp * 0.06));
      f.current_hp = Math.max(0, f.current_hp - burnDmg);
      events.push({ type: "msg", text: `${f.name} je opekao se (-${burnDmg} HP)` });
    }
    if (f.status.stoned) {
      // Munchies — heal a bit
      const heal = Math.max(1, Math.round(f.max_hp * 0.02));
      f.current_hp = Math.min(f.max_hp, f.current_hp + heal);
    }
    // Tick status counters
    for (const k of Object.keys(f.status_turns) as (keyof typeof f.status_turns)[]) {
      if (f.status_turns[k] > 0) {
        f.status_turns[k]--;
        if (f.status_turns[k] === 0 && f.status[k as keyof typeof f.status]) {
          (f.status[k as keyof typeof f.status] as boolean) = false;
        }
      }
    }
  }

  // Final check
  if (state.player1.current_hp <= 0 && !state.isOver) {
    state.isOver = true;
    state.winnerId = state.player2.id;
  }
  if (state.player2.current_hp <= 0 && !state.isOver) {
    state.isOver = true;
    state.winnerId = state.player1.id;
  }

  state.log.push(...events);

  return { events, isOver: state.isOver, winnerId: state.winnerId };
}

// ────────────────────────────────────────────────────────────────────────────
// BATTLE INIT
// ────────────────────────────────────────────────────────────────────────────

export function createBattleState(p1Id: string, p2Id: string): BattleState {
  return {
    player1: createBattleFighter(p1Id),
    player2: createBattleFighter(p2Id),
    turn: 0,
    isOver: false,
    winnerId: null,
    log: [],
  };
}

// AI move pick (for solo testing or NPC opponent — picks random damaging move)
export function aiPickMove(fighter: BattleFighter): number {
  const damaging = fighter.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.power > 0 && (m.pp ?? 0) > 0);
  if (damaging.length === 0) return 0;
  // 70% best damage, 30% random
  if (Math.random() < 0.7) {
    const sorted = [...damaging].sort((a, b) => b.m.power - a.m.power);
    return sorted[0].i;
  }
  return damaging[Math.floor(Math.random() * damaging.length)].i;
}

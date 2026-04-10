// Card logic for the bachelor drinking game.
// Mirrors bachelor_cards.py from the Python version.

import promptsData from "@/data/prompts.json";
import type { GameCard, DrinkPenalty, PlayerRow } from "./supabase";

export const CARD_TYPES = [
  "nhie", "truth", "dare", "wyr", "most_likely", "who_in_room",
  "hot_take", "categories", "rule", "mate", "groom_special",
  "boss_fight", "chaos",
] as const;

export type CardType = typeof CARD_TYPES[number];

export const CARD_COLORS: Record<CardType, { bg: string; text: string; accent: string }> = {
  nhie:         { bg: "#2850A0", text: "#FFFFFF", accent: "#64A0FF" },
  truth:        { bg: "#A02828", text: "#FFFFFF", accent: "#FF6464" },
  dare:         { bg: "#B46414", text: "#FFFFFF", accent: "#FFB43C" },
  wyr:          { bg: "#7828A0", text: "#FFFFFF", accent: "#B464FF" },
  most_likely:  { bg: "#288C50", text: "#FFFFFF", accent: "#50DC78" },
  who_in_room:  { bg: "#8C7814", text: "#FFFFFF", accent: "#DCC83C" },
  hot_take:     { bg: "#B43278", text: "#FFFFFF", accent: "#FF64B4" },
  categories:   { bg: "#28788C", text: "#FFFFFF", accent: "#50C8DC" },
  rule:         { bg: "#C8AA28", text: "#141414", accent: "#FFDC50" },
  mate:         { bg: "#B43C3C", text: "#FFFFFF", accent: "#FF7878" },
  groom_special:{ bg: "#DCB428", text: "#141414", accent: "#FFDC50" },
  boss_fight:   { bg: "#282828", text: "#FFC828", accent: "#FF3C28" },
  chaos:        { bg: "#501478", text: "#FFFFFF", accent: "#C83CFF" },
};

export const CARD_TITLES: Record<CardType, string> = {
  nhie:         "JA NIKAD NISAM",
  truth:        "ISTINA",
  dare:         "IZAZOV",
  wyr:          "STO BI RADIJE",
  most_likely:  "TKO CE NAJPRIJE...",
  who_in_room:  "TKO U SOBI...",
  hot_take:     "KONTROVERZNO",
  categories:   "KATEGORIJE",
  rule:         "NOVO PRAVILO",
  mate:         "ODABERI PAJDASA",
  groom_special:"MLADOZENJA",
  boss_fight:   "BOSS FIGHT!",
  chaos:        "KAOS",
};

export const ROUND_NAMES: Record<number, string> = {
  1: "ZAGRIJAVANJE",
  2: "MOMACKA",
  3: "SUDNJI DAN",
};

export const ROUND_SUBTITLES: Record<number, string> = {
  1: "Polako, brate",
  2: "Sad krecu pravi decki pecki",
  3: "Nema milosti",
};

// Card type weights per round
const ROUND_WEIGHTS: Record<number, Record<CardType, number>> = {
  1: { nhie: 20, truth: 15, wyr: 15, most_likely: 10, who_in_room: 10, hot_take: 5, dare: 8, categories: 5, rule: 3, mate: 3, groom_special: 4, boss_fight: 1, chaos: 3 },
  2: { nhie: 12, truth: 12, wyr: 10, most_likely: 8, who_in_room: 8, hot_take: 5, dare: 12, categories: 6, rule: 3, mate: 3, groom_special: 8, boss_fight: 4, chaos: 8 },
  3: { nhie: 8, truth: 8, wyr: 8, most_likely: 6, who_in_room: 6, hot_take: 5, dare: 12, categories: 5, rule: 2, mate: 2, groom_special: 12, boss_fight: 8, chaos: 15 },
};

const ROUND_DRINK_MULTIPLIER: Record<number, number> = { 1: 1, 2: 2, 3: 3 };

// Croatian pluralization
export function gutljaj(n: number): string {
  if (n === 1) return `${n} gutljaj`;
  return `${n} gutljaja`;
}

export function shotic(n: number): string {
  if (n === 1) return `${n} shot`;
  if (n >= 2 && n <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return `${n} shota`;
  return `${n} shotova`;
}

export function formatDrinks(sips: number, shots: number): string {
  const parts: string[] = [];
  if (sips > 0) parts.push(gutljaj(sips));
  if (shots > 0) parts.push(shotic(shots));
  return parts.join(" + ") || "0 gutljaja";
}

// Simple weighted random
function weightedRandom<T extends string>(weights: Record<T, number>): T {
  const total = Object.values(weights).reduce((a, b) => (a as number) + (b as number), 0) as number;
  let r = Math.random() * total;
  for (const [key, weight] of Object.entries(weights) as [T, number][]) {
    r -= weight;
    if (r <= 0) return key;
  }
  return Object.keys(weights)[0] as T;
}

// Used-prompts tracking (per session)
const usedPrompts: Record<string, Set<number>> = {};

function pickUnused(poolKey: string, poolSize: number): number {
  if (!usedPrompts[poolKey]) usedPrompts[poolKey] = new Set();
  const used = usedPrompts[poolKey];
  if (used.size >= poolSize) used.clear();
  let idx: number;
  do {
    idx = Math.floor(Math.random() * poolSize);
  } while (used.has(idx));
  used.add(idx);
  return idx;
}

interface DrawContext {
  currentRound: number;
  isGroomTurn: boolean;
  bossFightCooldown: number;
}

let bossFightCooldown = 0;

export function drawCard(ctx: DrawContext): GameCard {
  const round = ctx.currentRound;
  const weights = { ...ROUND_WEIGHTS[round] || ROUND_WEIGHTS[3] };
  const drinkMult = ROUND_DRINK_MULTIPLIER[round] || 3;

  // Boss fight cooldown
  if (bossFightCooldown < 12) weights.boss_fight = 0;
  bossFightCooldown++;

  // Boost groom_special on groom's turn
  if (ctx.isGroomTurn) {
    weights.groom_special *= 5;
  }

  const cardType = weightedRandom(weights);

  if (cardType === "boss_fight") bossFightCooldown = 0;

  return buildCard(cardType, drinkMult, ctx);
}

function buildCard(cardType: CardType, mult: number, ctx: DrawContext): GameCard {
  const id = `card_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const colors = CARD_COLORS[cardType];

  switch (cardType) {
    case "nhie": {
      const idx = pickUnused("nhie", promptsData.NEVER_HAVE_I_EVER.length);
      const item = promptsData.NEVER_HAVE_I_EVER[idx];
      return {
        id, card_type: "nhie", title: CARD_TITLES.nhie,
        content: "Ja nikad nisam " + item.text.replace(/^\.\.\./, "").trim(),
        instruction: `Tko JE to napravio: PIJE ${gutljaj(mult)}!`,
        drink_penalty: mult, drink_penalty_skip: 0,
        is_groom_targeted: item.is_groom_targeted, target_type: "all",
      };
    }
    case "truth": {
      const idx = pickUnused("truth", promptsData.TRUTHS.length);
      const item = promptsData.TRUTHS[idx];
      return {
        id, card_type: "truth", title: CARD_TITLES.truth,
        content: item.text,
        instruction: `Odgovori iskreno ili PIJE ${gutljaj(mult * 3)}!`,
        drink_penalty: 0, drink_penalty_skip: mult * 3,
        is_groom_targeted: item.is_groom_targeted, target_type: "current",
      };
    }
    case "dare": {
      const idx = pickUnused("dare", promptsData.DARES.length);
      const item = promptsData.DARES[idx];
      return {
        id, card_type: "dare", title: CARD_TITLES.dare,
        content: item.text,
        instruction: `Napravi to ili PIJE ${gutljaj(mult * 3)}!`,
        drink_penalty: 0, drink_penalty_skip: mult * 3,
        is_groom_targeted: item.is_groom_targeted, target_type: "current",
      };
    }
    case "wyr": {
      const idx = pickUnused("wyr", promptsData.WOULD_YOU_RATHER.length);
      const item = promptsData.WOULD_YOU_RATHER[idx];
      return {
        id, card_type: "wyr", title: CARD_TITLES.wyr,
        content: item.option_a, content_b: item.option_b,
        instruction: `Manjina pije ${gutljaj(mult)}!`,
        drink_penalty: mult, drink_penalty_skip: 0,
        is_groom_targeted: false, target_type: "vote",
      };
    }
    case "most_likely": {
      const idx = pickUnused("most_likely", promptsData.MOST_LIKELY_TO.length);
      return {
        id, card_type: "most_likely", title: CARD_TITLES.most_likely,
        content: promptsData.MOST_LIKELY_TO[idx],
        instruction: `Svi glasaju! Najvise glasova pije ${gutljaj(mult * 2)}!`,
        drink_penalty: mult * 2, drink_penalty_skip: 0,
        is_groom_targeted: false, target_type: "vote",
      };
    }
    case "who_in_room": {
      const idx = pickUnused("who_in_room", promptsData.WHO_IN_THE_ROOM.length);
      return {
        id, card_type: "who_in_room", title: CARD_TITLES.who_in_room,
        content: promptsData.WHO_IN_THE_ROOM[idx],
        instruction: `Odaberi nekog! Pije ${gutljaj(mult)}!`,
        drink_penalty: mult, drink_penalty_skip: 0,
        is_groom_targeted: false, target_type: "pick",
      };
    }
    case "hot_take": {
      const idx = pickUnused("hot_take", promptsData.HOT_TAKES.length);
      return {
        id, card_type: "hot_take", title: CARD_TITLES.hot_take,
        content: promptsData.HOT_TAKES[idx],
        instruction: `Glasaj ZA/PROTIV! Manjina pije ${gutljaj(mult)}!`,
        drink_penalty: mult, drink_penalty_skip: 0,
        is_groom_targeted: false, target_type: "vote",
      };
    }
    case "categories": {
      const idx = pickUnused("categories", promptsData.CATEGORIES.length);
      return {
        id, card_type: "categories", title: CARD_TITLES.categories,
        content: promptsData.CATEGORIES[idx],
        instruction: `Nabrajajte! Tko zasteka pije ${gutljaj(mult * 2)}!`,
        drink_penalty: mult * 2, drink_penalty_skip: 0,
        is_groom_targeted: false, target_type: "all",
      };
    }
    case "rule": {
      const idx = pickUnused("rule_examples", promptsData.RULE_EXAMPLES.length);
      return {
        id, card_type: "rule", title: CARD_TITLES.rule,
        content: "Ti si KRALJ! Smisli pravilo koje traje do sljedece karte.",
        content_b: `Primjer: "${promptsData.RULE_EXAMPLES[idx]}"`,
        instruction: "Prekrsaj = 1 gutljaj!",
        drink_penalty: 0, drink_penalty_skip: 0,
        is_groom_targeted: false, target_type: "current",
      };
    }
    case "mate": {
      return {
        id, card_type: "mate", title: CARD_TITLES.mate,
        content: "Odaberi pajdasa. Od sad, kad ti pijes - on/ona pije.",
        instruction: "Biraj pametno... il zlocesto.",
        drink_penalty: 0, drink_penalty_skip: 0,
        is_groom_targeted: false, target_type: "pick",
      };
    }
    case "groom_special": {
      const idx = pickUnused("groom_special", promptsData.GROOM_SPECIALS.length);
      const item = promptsData.GROOM_SPECIALS[idx];
      const skipPenalty = ["dare", "challenge"].includes(item.sub_type) ? mult * 3 : mult * 2;
      return {
        id, card_type: "groom_special", title: CARD_TITLES.groom_special,
        content: item.text,
        instruction: `Mladozenja MORA! Preskoci = PIJE ${gutljaj(skipPenalty)}!`,
        drink_penalty: mult, drink_penalty_skip: skipPenalty,
        is_groom_targeted: true, target_type: "groom", sub_type: item.sub_type,
      };
    }
    case "boss_fight": {
      return {
        id, card_type: "boss_fight", title: CARD_TITLES.boss_fight,
        content: "MATIJAMON BORBA!",
        instruction: "2 igraca se bore! Gubitnik pije 3, pobjednik dijeli 3!",
        drink_penalty: 3, drink_penalty_skip: 0,
        is_groom_targeted: false, target_type: "all",
      };
    }
    case "chaos": {
      const idx = pickUnused("chaos", promptsData.CHAOS_CARDS.length);
      const item = promptsData.CHAOS_CARDS[idx];
      return {
        id, card_type: "chaos", title: CARD_TITLES.chaos,
        content: item.text, instruction: "",
        drink_penalty: mult, drink_penalty_skip: 0,
        is_groom_targeted: false, target_type: "all", effect: item.effect,
      };
    }
  }
}

// Drink resolution
export function applyGroomTax(penalties: DrinkPenalty[], players: PlayerRow[], round: number): DrinkPenalty[] {
  const groom = players.find(p => p.is_groom);
  if (!groom) return penalties;

  const otherSips = penalties
    .filter(p => p.player_name !== groom.name)
    .reduce((sum, p) => sum + p.sips, 0);

  if (otherSips > 0) {
    const roundPct = ({ 1: 0.5, 2: 0.75, 3: 1.0 } as Record<number, number>)[round] || 0.5;
    const tax = Math.max(1, Math.floor(otherSips * roundPct));
    return [
      ...penalties,
      {
        player_name: groom.name,
        sips: tax,
        shots: 0,
        reason: "POREZ MLADOZENJE!",
      },
    ];
  }
  return penalties;
}

export function applyMates(penalties: DrinkPenalty[], players: PlayerRow[]): DrinkPenalty[] {
  const matePenalties: DrinkPenalty[] = [];
  for (const pen of penalties) {
    const player = players.find(p => p.name === pen.player_name);
    if (!player || !player.mates) continue;
    for (const mateName of player.mates) {
      matePenalties.push({
        player_name: mateName,
        sips: pen.sips,
        shots: 0,
        reason: `PAJDAS sa ${pen.player_name}!`,
      });
    }
  }
  return [...penalties, ...matePenalties];
}

export function getDrunkComment(totalSips: number, totalShots: number): string {
  const total = totalSips + totalShots * 3;
  if (total === 0) return "Trijezan ko sudac";
  if (total < 5) return "Tek poceo...";
  if (total < 10) return "Zagrijava se";
  if (total < 20) return "Pijan, potvrdjeno";
  if (total < 30) return "GOTOV";
  return "TOTALNO UNISTEN";
}

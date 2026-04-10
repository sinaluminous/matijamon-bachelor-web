// The 15 MATIJAMON fighters — used for character selection

export interface Fighter {
  id: string;
  name: string;
  title: string;
  is_groom?: boolean;
  is_kum?: boolean;
  has_sprite: boolean;
}

export const FIGHTERS: Fighter[] = [
  { id: "matija",   name: "MATIJA",   title: "Mladozenja",                is_groom: true,  has_sprite: true },
  { id: "pasko",    name: "PASKO",    title: "Kum / The Junkie Rockstar", is_kum: true,    has_sprite: true },
  { id: "sandro",   name: "SANDRO",   title: "The Third Eye Charmer",                      has_sprite: true },
  { id: "bliki",    name: "BLIKI",    title: "The Loose Cannon",                           has_sprite: true },
  { id: "fixx",     name: "FIXX",     title: "The Drum & Baseline",                        has_sprite: true },
  { id: "covic",    name: "COVIC",    title: "The Demi-God",                               has_sprite: true },
  { id: "denis",    name: "DENIS",    title: "The Sleepy Grappler",                        has_sprite: true },
  { id: "stipe",    name: "STIPE",    title: "The Cosmic Salad Chef",                      has_sprite: true },
  { id: "marin",    name: "MARIN",    title: "The Doctor of Substances",                   has_sprite: false },
  { id: "goran",    name: "GORAN",    title: "The Retired Champion",                       has_sprite: true },
  { id: "sasa",     name: "SASA",     title: "The Angry Stoner Coder",                     has_sprite: false },
  { id: "rukavina", name: "RUKAVINA", title: "The Law",                                    has_sprite: true },
  { id: "sina",     name: "SINA",     title: "The Tower of Smoke",                         has_sprite: true },
  { id: "mislav",   name: "MISLAV",   title: "The IT Berserker",                           has_sprite: true },
  { id: "braovic",  name: "BRAOVIC",  title: "The Sensei",                                 has_sprite: true },
];

export function getFighter(id: string): Fighter | undefined {
  return FIGHTERS.find(f => f.id === id);
}

// Fallback sprite when a fighter has no artwork — use matija1.png which is
// an RGBA PNG with proper transparency (unlike matijamon.png which is 8-bit RGB).
export const FALLBACK_SPRITE = "/sprites/matija1.png";

export function spriteUrl(fighterId: string): string {
  const fighter = getFighter(fighterId);
  if (fighter && !fighter.has_sprite) return FALLBACK_SPRITE;
  return `/sprites/${fighterId}1.png`;
}

// Card flow metadata — describes what each card type expects from each role.
// Used by both host and player pages to render the right UI in sync.

export type Role = "host" | "active" | "spectator" | "groom";

export interface CardFlow {
  /** Who can take action: "current_only" / "all" / "groom_only" / "passive" */
  participants: "current_only" | "all" | "groom_only" | "passive";
  /** Phone shows action buttons or "look at TV" */
  phoneNeedsButtons: boolean;
  /** Description of what each role sees */
  hostBigText?: string;
  /** Show vote tally on host? */
  showsLiveTally?: boolean;
}

export const CARD_FLOWS: Record<string, CardFlow> = {
  nhie: {
    participants: "all",
    phoneNeedsButtons: true,
    hostBigText: "Tko je to napravio?",
  },
  truth: {
    participants: "current_only",
    phoneNeedsButtons: true,
    hostBigText: "ISTINA",
  },
  dare: {
    participants: "current_only",
    phoneNeedsButtons: true,
    hostBigText: "IZAZOV",
  },
  wyr: {
    participants: "all",
    phoneNeedsButtons: true,
    showsLiveTally: true,
  },
  most_likely: {
    participants: "all",
    phoneNeedsButtons: true,
    showsLiveTally: true,
  },
  who_in_room: {
    participants: "current_only",
    phoneNeedsButtons: true,
  },
  hot_take: {
    participants: "all",
    phoneNeedsButtons: true,
    showsLiveTally: true,
  },
  categories: {
    participants: "all",
    phoneNeedsButtons: false, // honor system, host advances
  },
  rule: {
    participants: "current_only",
    phoneNeedsButtons: true,
  },
  mate: {
    participants: "current_only",
    phoneNeedsButtons: true,
  },
  groom_special: {
    participants: "groom_only",
    phoneNeedsButtons: true,
  },
  boss_fight: {
    participants: "passive",
    phoneNeedsButtons: false,
    hostBigText: "BOSS FIGHT!",
  },
  chaos: {
    participants: "all",
    phoneNeedsButtons: false, // host advances after applying effect
  },
};

export function getCardFlow(cardType: string): CardFlow {
  return CARD_FLOWS[cardType] || {
    participants: "passive",
    phoneNeedsButtons: false,
  };
}

/** Determines what the player should see on their phone for the current card */
export function getPlayerRole(
  cardType: string,
  isCurrentPlayer: boolean,
  isGroom: boolean,
): Role {
  const flow = getCardFlow(cardType);
  if (flow.participants === "groom_only") {
    return isGroom ? "groom" : "spectator";
  }
  if (flow.participants === "current_only") {
    return isCurrentPlayer ? "active" : "spectator";
  }
  if (flow.participants === "all") {
    return "active"; // everyone is active
  }
  return "spectator";
}

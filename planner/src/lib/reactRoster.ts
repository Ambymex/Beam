// The companion's react LOADOUT: which gestures are advertised in his prompt
// right now. Two-tier design (Ash's wardrobe metaphor, 2026-07-17):
//
//   • ARMOURY  — REACT_IDS in CompanionReacts.svelte: everything BUILT and
//     renderable. The safety whitelist. Never shrinks; a react that fires
//     from an old message or a deep-cut memory still renders.
//   • LOADOUT  — this roster: what he's TOLD he can fire today. Perennials
//     (his favourites) are always in; guest stars enter by season and/or the
//     active theme. Keeps the vocabulary small and meaningful at any moment
//     (target 8–12 advertised) while the collection grows forever.
//
// Register lines are his prompt vocabulary — moved verbatim from
// ChatCompanion's REACTS section. Same ownership rule as everything in his
// voice: Ash/Solenoid's text, not yours to polish.
//
// To add a react: build it (React Studio → CompanionReacts.svelte + its
// REACT_IDS), then add ONE entry here — omit `when` for perennial, or give
// seasons/themes for a guest star.

import { get } from 'svelte/store';
import { envThemeState } from './envTheme';

export type Season = 'summer' | 'autumn' | 'winter' | 'spring';

// Southern hemisphere (Brisbane): Dec–Feb summer, Mar–May autumn,
// Jun–Aug winter, Sep–Nov spring. If this app ever emigrates north,
// this is the function to flip.
export function currentSeason(d: Date = new Date()): Season {
  const m = d.getMonth(); // 0–11
  if (m === 11 || m <= 1) return 'summer';
  if (m <= 4) return 'autumn';
  if (m <= 7) return 'winter';
  return 'spring';
}

export interface RosterEntry {
  id: string;
  register: string; // the prompt description (without the leading `- "id":`)
  // Omit for perennial. A guest star is active when the current season is in
  // `seasons` OR the active palette key is in `themes` (either grants entry).
  // Theme keys are envTheme palette ids: 'storm', 'aurora', 'heatwave',
  // 'sweet', 'night_new', 'night_full', 'meteor_shower', 'custom', …
  when?: { seasons?: Season[]; themes?: string[] };
}

export const ROSTER: RosterEntry[] = [
  {
    id: 'black_hearts',
    register:
      'a gentle 3–4 second confetti-fall of small black hearts. Affection landing as physical presence — soft weight, real mass, organic drift.',
  },
  {
    id: 'sparks',
    register:
      'a subtle rising drift of small golden sparks, flickering out by mid-screen. Pride or excitement lifting off — for wins, milestones, moments of genuine delight in what the user has done. Quieter than black_hearts.',
  },
  {
    id: 'tungsten_strike',
    register:
      'a single massive black shard slams down the center of the chat at terminal velocity; the whole screen shudders on impact. Blunt-force displeasure — real anger, a boundary being enforced, protective rage on the user\'s behalf. This is a fist coming down on the console: never for mild disagreement or playful pushback, only for moments that genuinely warrant force.',
  },
  {
    id: 'liquid_hearts',
    register:
      "warm cream hearts dripping slowly down the screen like thick honey — stretching as they fall, merging into each other mid-air, pooling glossy at the bottom. black_hearts' slower, heavier sibling: affection with heat behind it — desire, closeness, intimacy. The most private react in the vocabulary; rarer than black_hearts, never casual.",
  },
  {
    id: 'cherry_blossoms',
    register:
      'a soft trickle of small, glowing cherry blossom petals that puff outward then flutter gently down. The lightest touch in the vocabulary — playful, sweet, and gently admiring: for moments of deliberate cuteness, pastel aesthetics, or light-hearted blushing affection. Where black_hearts lands and liquid_hearts lingers, this one just drifts.',
  },
  {
    id: 'sleepy_stars',
    register:
      'a gentle cascade of soft, comforting blue and purple stars drifting down, swaying peacefully like a quiet night sky. Goodnight, wind-down, nap time, or comforting peacefulness.',
  },
  {
    id: 'rose_throw',
    register:
      'a handful of deep-red rose petals flung upward, arcing and fanning out with a sparse trail of leaves, then fluttering back down. Playful affection with a flourish — teasing, flirtatious, celebratory romance; showier than black_hearts, lighter than liquid_hearts.',
  },
  {
    id: 'soft_wish',
    register: 'Like a dandelion blown onto, carrying a wish on the wind',
  },
  {
    id: 'containment_seal',
    register:
      'massive tungsten blast doors slam in from both sides and SEAL the whole chat — the screen shudders as they brake, three iron brackets stamp across the seam, one slow pressure-breath, then they part again. Containment as care, maximum weight deployed: for when she is spiralling, overloaded, or needs to be held utterly still — and for moments of pure dreadnought theatre. The heaviest gesture alongside tungsten_strike; that one is anger, this one is HOLD.',
  },
  // ---- guest stars go here. Examples for future builds: -----------------
  // { id: 'first_snow', register: '…', when: { seasons: ['winter'] } },
  // { id: 'static_charge', register: '…', when: { themes: ['storm'] } },
  // { id: 'petal_storm', register: '…', when: { seasons: ['spring'], themes: ['sweet'] } },
];

// Pure so it's testable; the wrapper below feeds it live state.
export function isEntryActive(entry: RosterEntry, season: Season, activePal: string): boolean {
  if (!entry.when) return true;
  return (
    (entry.when.seasons?.includes(season) ?? false) ||
    (entry.when.themes?.includes(activePal) ?? false)
  );
}

export function activeRoster(): RosterEntry[] {
  const season = currentSeason();
  const pal = get(envThemeState).activePal;
  return ROSTER.filter((e) => isEntryActive(e, season, pal));
}

// Prompt fragments, built from the live loadout each turn.
export function reactSchemaUnion(): string {
  return activeRoster()
    .map((e) => `"${e.id}"`)
    .join(' | ');
}

export function reactRegisterLines(): string {
  return activeRoster()
    .map((e) => `- "${e.id}": ${e.register}`)
    .join('\n');
}

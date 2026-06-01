// Vibe categories (§6) — a two-level palette. The 77 hand-written vibes turned
// out internally consistent enough to CLUSTER, so we group them: tap a category
// to arm it as-is ("just use housework"), or expand it for the precise member.
//
// Hard rule (§2): a category never invents a new hue. Its swatch is one of its
// OWN member hexes (`repId`) — a representative drawn from the user's DB, so all
// colour still originates there. A category is itself an armable vibe with id
// `cat:<name>`, which keeps "all my housework blocks" a searchable field (§6/§12).
//
// Every one of the 77 ids appears in exactly one category (checked at the
// bottom in dev).

import { VIBES, VIBES_BY_ID, type Vibe } from './vibes';
import { CUSTOM_BY_ID } from './customVibes';

export interface Category {
  id: string; // 'cat:washing'
  label: string;
  icon: string; // emoji — a glyph, not a meaningful hue
  repId: string; // member whose hex becomes the category swatch
  memberIds: string[];
}

// Ordered as shown. Desire & flirtation is grouped and placed LAST (discreet).
export const CATEGORIES: Category[] = [
  { id: 'cat:washing', label: 'Washing & laundry', icon: '🧺', repId: 'a24df0',
    memberIds: ['a24df0', 'b19fe2', 'cc80ff'] },
  { id: 'cat:housework', label: 'Housework & cleaning', icon: '🧽', repId: '8f88fc',
    memberIds: ['8f88fc', '3a0066', '1d1d1b', 'a37cb0', '6905e0'] },
  { id: 'cat:cooking', label: 'Cooking & meals', icon: '🍳', repId: '20c96d',
    memberIds: ['20c96d', '05e0b8', 'b0ffad', '95e8a9', '85edc7'] },
  { id: 'cat:selfcare', label: 'Self care & health', icon: '🛁', repId: 'f97a80',
    memberIds: ['f97a80', 'a709ca', '42e5ba', 'f2a1d8', 'ffb86b', 'aa36e3'] },
  { id: 'cat:exercise', label: 'Exercise', icon: '🏃', repId: '17594a',
    memberIds: ['17594a', '138d67', '76a85d'] },
  { id: 'cat:admin', label: 'Admin & paperwork', icon: '📋', repId: 'ffeeaa',
    memberIds: ['ffeeaa', 'f7be42', '3767d6', 'fff86c', 'f5ed65'] },
  { id: 'cat:childcare', label: 'Childcare & parenting', icon: '🧸', repId: '24b3e0',
    memberIds: ['24b3e0', '6deef2', '72a2bf', '9bd3f5', 'c9e4e7', '3a6eb9', 'b2c3ff'] },
  { id: 'cat:travel', label: 'Out & travel', icon: '🚪', repId: 'fc844f',
    memberIds: ['fc844f', 'c29786', 'ff9200'] },
  { id: 'cat:organising', label: 'Organising & errands', icon: '🗂', repId: 'ffda8a',
    memberIds: ['ffda8a', 'f5f2f1'] },
  { id: 'cat:affection', label: 'Affection & warmth', icon: '🌸', repId: 'ffb3b3',
    memberIds: ['ffb3b3', 'ffd1dc', 'f9b7c4', 'f7c2cf', 'ffd2c4'] },
  { id: 'cat:sadness', label: 'Sadness & low', icon: '🌧', repId: '6666aa',
    memberIds: ['6666aa', 'bebebe', 'e8e0d4', '3c3238', '3d3c6b', '121212', 'bfbfbf'] },
  { id: 'cat:anger', label: 'Anger & friction', icon: '⚡', repId: 'e00000',
    memberIds: ['e00000', '422c1e', '241f20', '60412c', 'a15c32', '5e463a', '613124', 'ec6601'] },
  { id: 'cat:aversion', label: 'Aversion & murk', icon: '🦠', repId: 'd4cf6c',
    memberIds: ['d4cf6c', 'fca672', '61336b', '0b4d91'] },
  { id: 'cat:calm', label: 'Calm & neutral', icon: '🕊', repId: 'fff27c',
    memberIds: ['fff27c', 'fcfcf7', '373832', 'bcd4c3'] },
  { id: 'cat:desire', label: 'Desire & flirtation', icon: '🔥', repId: 'd61029',
    memberIds: ['d61029', 'de3e3e', 'ff3434', 'cc6a72', 'b84c2e', 'c98a1c', '10061f', '140306', '904955', 'f4f6eb'] },
];

export const CATEGORY_BY_ID: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

// A category as an armable vibe: its hex is the representative member's hex
// (never an invented colour), its "emotion" text is the category label.
export function categoryVibe(cat: Category): Vibe {
  const rep = VIBES_BY_ID[cat.repId];
  return { id: cat.id, hex: rep.hex, emotion: cat.label };
}

export function membersOf(cat: Category): Vibe[] {
  return cat.memberIds.map((id) => VIBES_BY_ID[id]).filter(Boolean);
}

// Canonical resolver: a stored vibeId may be a real member id, a `cat:*` id,
// or a `custom:*` user-created id. Everything that renders a fill/readout uses it.
export function resolveVibe(id: string | null | undefined): Vibe | null {
  if (!id) return null;
  if (VIBES_BY_ID[id]) return VIBES_BY_ID[id];
  if (CUSTOM_BY_ID[id]) return CUSTOM_BY_ID[id];
  const cat = CATEGORY_BY_ID[id];
  return cat ? categoryVibe(cat) : null;
}

// Which category does a member id belong to (for highlighting the active group)?
export function categoryOf(memberId: string): Category | null {
  return CATEGORIES.find((c) => c.memberIds.includes(memberId)) ?? null;
}

// Dev-only integrity check: every vibe is categorised exactly once.
if (import.meta.env?.DEV) {
  const all = CATEGORIES.flatMap((c) => c.memberIds);
  const set = new Set(all);
  if (set.size !== all.length) console.warn('[categories] duplicate member id');
  for (const v of VIBES) if (!set.has(v.id)) console.warn('[categories] uncategorised vibe', v.id);
  if (all.length !== VIBES.length) console.warn('[categories] count mismatch', all.length, VIBES.length);
}

// Vibe categories (§6) — a two-level palette, now EXTENSIBLE.
//
// The built-in 15 over the original 77 are a static BASE. The user can:
//   • add a new colour/task to an existing category (a custom vibe with a
//     categoryId), and
//   • add whole new categories (customCategories).
// Both layer ON TOP of the base — built-in data is never mutated, so additions
// are reversible and export cleanly.
//
// Hard rule (§2): a category never invents a hue. Its swatch is one of its OWN
// member hexes. A category is itself an armable vibe with id `cat:*`, keeping
// "all my housework blocks" a searchable field (§6/§12).
//
// resolveVibe() stays PURE + sync (blocks render through it) by reading the
// store mirrors (CUSTOM_BY_ID / CUSTOM_CATS_BY_ID). The Palette UI consumes the
// reactive `categoryList` store.

import { derived } from 'svelte/store';
import { VIBES, VIBES_BY_ID, type Vibe } from './vibes';
import { customVibes, CUSTOM_BY_ID, type CustomVibe } from './customVibes';
import { customCategories, CUSTOM_CATS_BY_ID } from './customCategories';

const NEUTRAL = '#6a6a78';

export interface Category {
  id: string; // 'cat:washing'
  label: string;
  icon: string; // emoji — a glyph, not a meaningful hue
  repId: string; // base member whose hex becomes the category swatch
  memberIds: string[];
}

// A category resolved for display: members already resolved to Vibes, including
// any custom vibes filed under it; repHex chosen from its own members.
export interface ResolvedCategory {
  id: string;
  label: string;
  icon: string;
  repHex: string;
  members: Vibe[];
  custom: boolean;
}

// Ordered as shown. Desire & flirtation is last among the built-ins (discreet);
// user-created categories append after.
export const BASE_CATEGORIES: Category[] = [
  { id: 'cat:washing', label: 'Washing & laundry', icon: '', repId: 'a24df0',
    memberIds: ['a24df0', 'b19fe2', 'cc80ff'] },
  { id: 'cat:housework', label: 'Housework & cleaning', icon: '', repId: '8f88fc',
    memberIds: ['8f88fc', '3a0066', '1d1d1b', 'a37cb0', '6905e0'] },
  { id: 'cat:cooking', label: 'Cooking & meals', icon: '', repId: '20c96d',
    memberIds: ['20c96d', '05e0b8', 'b0ffad', '95e8a9', '85edc7'] },
  { id: 'cat:selfcare', label: 'Self care & health', icon: '', repId: 'f97a80',
    memberIds: ['f97a80', 'a709ca', '42e5ba', 'f2a1d8', 'ffb86b', 'aa36e3'] },
  { id: 'cat:exercise', label: 'Exercise', icon: '', repId: '17594a',
    memberIds: ['17594a', '138d67', '76a85d'] },
  { id: 'cat:admin', label: 'Admin & paperwork', icon: '', repId: 'ffeeaa',
    memberIds: ['ffeeaa', 'f7be42', '3767d6', 'fff86c', 'f5ed65'] },
  { id: 'cat:childcare', label: 'Childcare & parenting', icon: '', repId: '24b3e0',
    memberIds: ['24b3e0', '6deef2', '72a2bf', '9bd3f5', 'c9e4e7', '3a6eb9', 'b2c3ff'] },
  { id: 'cat:travel', label: 'Out & travel', icon: '', repId: 'fc844f',
    memberIds: ['fc844f', 'c29786', 'ff9200'] },
  { id: 'cat:organising', label: 'Organising & errands', icon: '', repId: 'ffda8a',
    memberIds: ['ffda8a', 'f5f2f1'] },
  { id: 'cat:affection', label: 'Affection & warmth', icon: '', repId: 'ffb3b3',
    memberIds: ['ffb3b3', 'ffd1dc', 'f9b7c4', 'f7c2cf', 'ffd2c4'] },
  { id: 'cat:sadness', label: 'Sadness & low', icon: '', repId: '6666aa',
    memberIds: ['6666aa', 'bebebe', 'e8e0d4', '3c3238', '3d3c6b', '121212', 'bfbfbf'] },
  { id: 'cat:anger', label: 'Anger & friction', icon: '', repId: 'e00000',
    memberIds: ['e00000', '422c1e', '241f20', '60412c', 'a15c32', '5e463a', '613124', 'ec6601'] },
  { id: 'cat:aversion', label: 'Aversion & murk', icon: '', repId: 'd4cf6c',
    memberIds: ['d4cf6c', 'fca672', '61336b', '0b4d91'] },
  { id: 'cat:calm', label: 'Calm & neutral', icon: '', repId: 'fff27c',
    memberIds: ['fff27c', 'fcfcf7', '373832', 'bcd4c3'] },
  { id: 'cat:desire', label: 'Desire & flirtation', icon: '', repId: 'd61029',
    memberIds: ['d61029', 'de3e3e', 'ff3434', 'cc6a72', 'b84c2e', 'c98a1c', '10061f', '140306', '904955', 'f4f6eb'] },
];

const BASE_BY_ID: Record<string, Category> = Object.fromEntries(BASE_CATEGORIES.map((c) => [c.id, c]));

// ----- pure sync helpers (no store subscription) — backed by the mirrors -----

// Custom vibes filed under a category id, in creation order.
function customMembersFor(catId: string): CustomVibe[] {
  return Object.values(CUSTOM_BY_ID).filter((v) => v.categoryId === catId);
}

// All members of a category id (base + custom), resolved to Vibes.
export function membersOfId(catId: string): Vibe[] {
  const base = (BASE_BY_ID[catId]?.memberIds ?? []).map((id) => VIBES_BY_ID[id]).filter(Boolean);
  return [...base, ...customMembersFor(catId)];
}

// The category's representative hex — always one of its OWN members (§2).
export function categoryRepHex(catId: string): string {
  const base = BASE_BY_ID[catId];
  if (base && VIBES_BY_ID[base.repId]) return VIBES_BY_ID[base.repId].hex;
  return membersOfId(catId)[0]?.hex ?? NEUTRAL;
}

function categoryMeta(catId: string): { label: string; icon: string; custom: boolean } | null {
  const base = BASE_BY_ID[catId];
  if (base) return { label: base.label, icon: base.icon, custom: false };
  const c = CUSTOM_CATS_BY_ID[catId];
  if (c) return { label: c.label, icon: c.icon, custom: true };
  return null;
}

// A category as an armable vibe (id cat:*, hex = own rep, text = label).
export function categoryVibeById(catId: string): Vibe | null {
  const meta = categoryMeta(catId);
  if (!meta) return null;
  return { id: catId, hex: categoryRepHex(catId), emotion: meta.label };
}

// Canonical resolver: vibeId may be a member id, a `custom:*` vibe, or a
// `cat:*` category (base or custom). Pure + sync — blocks render through it.
export function resolveVibe(id: string | null | undefined): Vibe | null {
  if (!id) return null;
  if (VIBES_BY_ID[id]) return VIBES_BY_ID[id];
  if (CUSTOM_BY_ID[id]) return CUSTOM_BY_ID[id];
  if (id.startsWith('cat:')) return categoryVibeById(id);
  return null;
}

// ----- reactive list for the palette UI -----
// Recomputes whenever custom vibes or custom categories change. Built-ins first
// (desire last among them), then user categories.
export const categoryList = derived(
  [customVibes, customCategories],
  ([, $cats]): ResolvedCategory[] => {
    const build = (id: string): ResolvedCategory => {
      const meta = categoryMeta(id)!;
      return { id, label: meta.label, icon: meta.icon, custom: meta.custom, repHex: categoryRepHex(id), members: membersOfId(id) };
    };
    return [...BASE_CATEGORIES.map((c) => build(c.id)), ...$cats.map((c) => build(c.id))];
  },
);

// Dev-only integrity check: every built-in vibe is in exactly one base category.
if (import.meta.env?.DEV) {
  const all = BASE_CATEGORIES.flatMap((c) => c.memberIds);
  const set = new Set(all);
  if (set.size !== all.length) console.warn('[categories] duplicate member id');
  for (const v of VIBES) if (!set.has(v.id)) console.warn('[categories] uncategorised vibe', v.id);
  if (all.length !== VIBES.length) console.warn('[categories] count mismatch', all.length, VIBES.length);
}

// Bridge between the ring (which owns the live working copy of the day's blocks)
// and the BlockEditor panel rendered elsewhere in the layout. RadialCanvas
// publishes the selected block here and registers the mutation actions; the
// editor reads the block and calls the actions. Keeps selection state in one
// owner without a heavier store refactor.

import { writable } from 'svelte/store';
import type { Block } from './blocks';

export const selectedBlockStore = writable<Block | null>(null);

export interface BlockActions {
  setLabel: (text: string) => void;
  toggleDone: () => void;
  remove: () => void;
  deselect: () => void;
}

export const blockActions = writable<BlockActions | null>(null);

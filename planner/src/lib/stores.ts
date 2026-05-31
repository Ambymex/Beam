import { writable } from 'svelte/store';
import type { Vibe } from './vibes';

// The currently "armed" vibe (spec §5.1: arm a colour/vibe from the palette
// with one tap, then drag it onto the ring). null = nothing armed yet.
export const armedVibe = writable<Vibe | null>(null);

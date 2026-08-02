// Bridge between the ring (which owns the live working copy of the day's blocks)
// and the BlockEditor panel rendered elsewhere in the layout. RadialCanvas
// publishes the selected block here and registers the mutation actions; the
// editor reads the block and calls the actions. Keeps selection state in one
// owner without a heavier store refactor.

import { writable } from 'svelte/store';
import type { Block } from './blocks';
import type { Symptom, SymptomCategory } from './symptoms';

export const selectedBlockStore = writable<Block | null>(null);
export const selectedSymptomStore = writable<Symptom | null>(null);

export interface BlockActions {
  setLabel: (text: string) => void;
  toggleDone: () => void;
  remove: () => void;
  // Precise numeric time entry (start + core-end, in hours-from-midnight). The
  // taper length is preserved. Gesture stays the default; this is the opt-in
  // "exactly 2 min" path (§0.3 was "never DEMAND precision", not "never allow").
  setTimes: (startHours: number, coreEndHours: number) => void;
  setTravelTimes: (beforeHours: number, afterHours: number) => void;
  setVibe: (vibeId: string | null) => void;
  // Link/unlink the selected block to a recurring-task rule (§ repeats). Used
  // when turning a task into a repeat (stamp the id so its anchor-day instance
  // isn't duplicated by materializeRepeats) or detaching it back to a one-off.
  setRepeatId: (repeatId: string | null) => void;
  deselect: () => void;
  addBlock: (
    laneId: string,
    startHours: number,
    endHours: number,
    vibeId: string | null,
    isAppointmentBlock?: boolean,
    travelBeforeHours?: number,
    travelAfterHours?: number
  ) => void;
}

export const blockActions = writable<BlockActions | null>(null);

export interface SymptomActions {
  addSymptom: (timeHours: number, severity: 1 | 2 | 3 | 4 | 5, category: SymptomCategory) => void;
  updateSymptom: (severity: 1 | 2 | 3 | 4 | 5, category: SymptomCategory, timeHours: number, note?: string) => void;
  remove: () => void;
  deselect: () => void;
}

export const symptomActions = writable<SymptomActions | null>(null);

// Cascade vs nudge (§9). Default OFF = "nudge just this" (drag moves only the
// grabbed block). When ON = "push my day": dragging a block also shoves
// downstream SAME-LANE soft blocks forward, halting at the next hard edge.
export const cascadeMode = writable(false);

// Appointment-draw mode (§8). When ON, a sweep on the main lane creates a
// hard-edged appointment (no taper) with default travel-time wings, instead of
// a normal soft block. The wings can then be dragged via their handles.
export const appointmentMode = writable(false);

// MCAS symptom tracker (§ new). Each symptom entry lives on the innermost ring
// and correlates with activity blocks — the spatial proximity is the data.
//
// Severity maps to opacity (0.2→1.0), fill is a neutral grey so it never
// collides with the sacred vibe hues (§2). Categories are the user's actual
// MCAS symptom set — not a generic medical menu.

export type SymptomCategory =
  | 'sneezing'
  | 'stuffy_nose'
  | 'joint_muscle_pain'
  | 'hives'
  | 'skin_itchiness'
  | 'itchy_eyes';

export const SYMPTOM_CATEGORIES: { id: SymptomCategory; label: string }[] = [
  { id: 'sneezing', label: 'Sneezing' },
  { id: 'stuffy_nose', label: 'Stuffy nose' },
  { id: 'joint_muscle_pain', label: 'Joint / muscle pain' },
  { id: 'hives', label: 'Hives' },
  { id: 'skin_itchiness', label: 'Skin itchiness' },
  { id: 'itchy_eyes', label: 'Itchy eyes' },
];

export interface Symptom {
  id: number;
  timeHours: number;              // hours-from-midnight (0–24)
  severity: 1 | 2 | 3 | 4 | 5;  // maps to opacity: severity * 0.2
  category: SymptomCategory;
  note?: string;                  // optional free-text ("took antihistamine")
}

// The symptom ring's fill borrows the active theme's glass HUE (stripped of
// the glass token's own alpha, so severity→opacity stays legible) — still
// never a sacred vibe hue, but it follows the theme, including custom ones.
export const SYMPTOM_FILL = 'rgb(from var(--glass-bg, #8a8a96) r g b / 1)';

// Each symptom occupies this many hours of arc width on the ring, centred on
// its timeHours. Wide enough to tap on mobile, narrow enough to see patterns.
export const SYMPTOM_ARC_HOURS = 0.5; // 30 minutes

// Opacity for a given severity level.
export function severityOpacity(severity: number): number {
  return Math.max(0.2, Math.min(1.0, severity * 0.2));
}

// Next unique ID for a symptom within a day's array.
export function nextSymptomId(symptoms: Symptom[]): number {
  return symptoms.length === 0 ? 1 : Math.max(...symptoms.map((s) => s.id)) + 1;
}

// Hit-test: is a given radius and hour inside this symptom's angular arc?
export function symptomContains(s: Symptom, r: number, hours: number, laneInner: number, laneOuter: number): boolean {
  if (r < laneInner || r > laneOuter) return false;
  // Arc is centred on s.timeHours, width is SYMPTOM_ARC_HOURS
  const half = SYMPTOM_ARC_HOURS / 2;
  const start = s.timeHours - half;
  const end = s.timeHours + half;
  
  // Handle cross-midnight for the arc (e.g. at 23:45 or 00:15)
  if (hours >= start && hours <= end) return true;
  if (hours + 24 >= start && hours + 24 <= end) return true;
  if (hours - 24 >= start && hours - 24 <= end) return true;
  
  return false;
}

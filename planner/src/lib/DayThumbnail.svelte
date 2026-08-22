<script lang="ts">
  // A small static render of a day's ring for the gallery (§12 tier 1 — visual
  // flick-back: find days by SHAPE and COLOUR, no AI). Same drawing helpers as
  // the live ring, so a thumbnail looks exactly like its day — and themed the
  // same way (structural marks via the palette store; vibe fills untouched).
  import { C, blockFill, corePath, taperSegments } from './blocks';
  import { LANES, RIM_RADIUS } from './lanes';
  import { palette } from './theme';
  import { annularSector, hoursToAngle } from './geometry';
  import { SYMPTOM_ARC_HOURS, SYMPTOM_FILL, severityOpacity } from './symptoms';
  import type { DayData } from './daydata';

  export let day: DayData;
  export let isToday = false;

  $: pal = $palette;
  const symLane = LANES.find((l) => l.id === 'symptom')!;
</script>

<svg viewBox="0 0 400 400" class:today={isToday}>
  <circle cx={C} cy={C} r={RIM_RADIUS} fill={pal.ringDisc} stroke={pal.ringStroke} stroke-width="1" />
  {#each LANES as lane}
    <circle cx={C} cy={C} r={lane.rOuter} fill="none" stroke={pal.laneInner} stroke-width="1" />
  {/each}
  {#each day.blocks as b (b.id)}
    <path d={corePath(b)} fill={blockFill(b)} opacity={b.done ? 0.4 : 0.9} />
    {#each taperSegments(b) as seg}
      <path d={seg.d} fill={blockFill(b)} opacity={b.done ? seg.opacity * 0.45 : seg.opacity} />
    {/each}
  {/each}
  <!-- MCAS/histamine symptom markers on the innermost ring — same render as the
       live canvas so a day's symptom load reads at a glance in the gallery. -->
  {#each day.symptoms ?? [] as s (s.id)}
    <path
      d={annularSector(C, C, symLane.rInner, symLane.rOuter, hoursToAngle(s.timeHours - SYMPTOM_ARC_HOURS / 2), hoursToAngle(s.timeHours + SYMPTOM_ARC_HOURS / 2))}
      fill={SYMPTOM_FILL}
      opacity={severityOpacity(s.severity)}
    />
  {/each}
  <!-- "today" marked by a non-colour cue: a luminous rim (signal), never a hue
       (§2) — drawn in-SVG so it inverts with the theme like every other mark. -->
  {#if isToday}
    <circle cx={C} cy={C} r={RIM_RADIUS - 1} fill="none" stroke={pal.signal} stroke-width="3" opacity="0.7" />
  {/if}
</svg>

<style>
  svg {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 12px;
  }
</style>

<script lang="ts">
  // A small static render of a day's ring for the gallery (§12 tier 1 — visual
  // flick-back: find days by SHAPE and COLOUR, no AI). Same drawing helpers as
  // the live ring, so a thumbnail looks exactly like its day.
  import { C, blockFill, corePath, taperSegments } from './blocks';
  import { LANES, RIM_RADIUS } from './lanes';
  import type { DayData } from './daydata';

  export let day: DayData;
  export let isToday = false;
</script>

<svg viewBox="0 0 400 400" class:today={isToday}>
  <circle cx={C} cy={C} r={RIM_RADIUS} fill="#101014" stroke="#26262e" stroke-width="1" />
  {#each LANES as lane}
    <circle cx={C} cy={C} r={lane.rOuter} fill="none" stroke="#1d1d24" stroke-width="1" />
  {/each}
  {#each day.blocks as b (b.id)}
    <path d={corePath(b)} fill={blockFill(b)} opacity={b.done ? 0.4 : 0.9} />
    {#each taperSegments(b) as seg}
      <path d={seg.d} fill={blockFill(b)} opacity={b.done ? seg.opacity * 0.45 : seg.opacity} />
    {/each}
  {/each}
</svg>

<style>
  svg {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 12px;
  }
  /* "today" marked by a non-colour cue: a luminous rim, never a hue (§2). */
  svg.today {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.55);
  }
</style>

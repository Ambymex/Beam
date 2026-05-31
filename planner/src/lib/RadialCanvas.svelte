<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    hoursToAngle,
    angleToHours,
    polar,
    pointToAngle,
    pointRadius,
    annularSector,
    pieSector,
  } from './geometry';
  import { LANES, laneAtRadius, HUB_RADIUS, RIM_RADIUS, LABEL_RADIUS } from './lanes';

  const SIZE = 400;
  const C = SIZE / 2; // centre

  // ----- live "now" (spec §14): not a clock hand — a consumed-vs-remaining
  // wedge that fills in BEHIND now as the day burns down. -----
  let now = new Date();
  let timer: ReturnType<typeof setInterval>;
  onMount(() => {
    timer = setInterval(() => (now = new Date()), 15000);
  });
  onDestroy(() => clearInterval(timer));

  $: nowHours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  // Un-wrapped angle so the consumed wedge grows monotonically from midnight.
  $: nowAngleRaw = 180 + (nowHours / 24) * 360;
  $: nowTickAngle = hoursToAngle(nowHours);
  $: nowWedge = pieSector(C, C, RIM_RADIUS, 180, nowAngleRaw);
  $: nowTick = (() => {
    const a = polar(C, C, RIM_RADIUS, nowTickAngle);
    const b = polar(C, C, HUB_RADIUS, nowTickAngle);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  })();

  const dateFmt = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  $: hubDate = dateFmt.format(now);

  // ----- placed blocks. Colour is a NEUTRAL placeholder until the hex/vibe DB
  // lands — no hue is used, because any hue already means a vibe (§2). -----
  interface Block {
    id: number;
    laneId: string;
    startHours: number;
    endHours: number;
  }
  let blocks: Block[] = [];
  let nextId = 1;

  function blockPath(b: Block): string {
    const lane = LANES.find((l) => l.id === b.laneId)!;
    return annularSector(
      C,
      C,
      lane.rInner,
      lane.rOuter,
      hoursToAngle(b.startHours),
      hoursToAngle(b.endHours),
    );
  }

  // ----- drag-to-place gesture (spec §5.2): radial finger position picks the
  // lane (snap to nearest); the angular sweep sets start→end. -----
  let svgEl: SVGSVGElement;
  let drag: { laneId: string; startHours: number; sweepDeg: number; lastAngle: number } | null =
    null;

  function localPoint(ev: PointerEvent) {
    const rect = svgEl.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * SIZE,
      y: ((ev.clientY - rect.top) / rect.height) * SIZE,
    };
  }

  function onPointerDown(ev: PointerEvent) {
    const { x, y } = localPoint(ev);
    const r = pointRadius(C, C, x, y);
    const innermost = LANES[LANES.length - 1].rInner;
    if (r < innermost || r > RIM_RADIUS) return; // ignore hub + outside the rim
    const angle = pointToAngle(C, C, x, y);
    drag = {
      laneId: laneAtRadius(r).id,
      startHours: angleToHours(angle),
      sweepDeg: 0,
      lastAngle: angle,
    };
    svgEl.setPointerCapture(ev.pointerId);
  }

  function onPointerMove(ev: PointerEvent) {
    if (!drag) return;
    const { x, y } = localPoint(ev);
    const angle = pointToAngle(C, C, x, y);
    let delta = angle - drag.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    drag.sweepDeg = Math.min(360, Math.max(0, drag.sweepDeg + delta));
    drag.lastAngle = angle;
    drag = drag; // poke Svelte reactivity
  }

  function onPointerUp() {
    if (!drag) return;
    if (drag.sweepDeg > 1.5) {
      blocks = [
        ...blocks,
        {
          id: nextId++,
          laneId: drag.laneId,
          startHours: drag.startHours,
          endHours: drag.startHours + (drag.sweepDeg / 360) * 24,
        },
      ];
    }
    drag = null;
  }

  $: dragLane = drag ? LANES.find((l) => l.id === drag!.laneId)! : null;
  $: dragPath =
    drag && dragLane
      ? annularSector(
          C,
          C,
          dragLane.rInner,
          dragLane.rOuter,
          hoursToAngle(drag.startHours),
          hoursToAngle(drag.startHours) + drag.sweepDeg,
        )
      : '';

  // ----- static geometry, computed once -----
  // 96 fifteen-minute ticks; every 4th is an hour spoke (§2).
  const ticks = Array.from({ length: 96 }, (_, i) => {
    const angle = 180 + (i / 96) * 360;
    const isHour = i % 4 === 0;
    const outer = polar(C, C, RIM_RADIUS, angle);
    const inner = polar(C, C, isHour ? HUB_RADIUS : RIM_RADIUS - 7, angle);
    return { x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y, isHour };
  });

  // Civilian numbering, 1–12 twice; never 24h/military (§2).
  const hourLabels = Array.from({ length: 24 }, (_, h) => {
    const p = polar(C, C, LABEL_RADIUS, hoursToAngle(h));
    return {
      x: p.x,
      y: p.y,
      label: String(h % 12 === 0 ? 12 : h % 12),
      marker: h === 0 || h === 12, // midnight / noon get a touch more weight
    };
  });
</script>

<svg
  bind:this={svgEl}
  viewBox="0 0 {SIZE} {SIZE}"
  on:pointerdown={onPointerDown}
  on:pointermove={onPointerMove}
  on:pointerup={onPointerUp}
  on:pointercancel={onPointerUp}
>
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <radialGradient id="hubFade" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#16161b" />
      <stop offset="100%" stop-color="#0d0d10" />
    </radialGradient>
  </defs>

  <!-- backdrop disc -->
  <circle cx={C} cy={C} r={RIM_RADIUS} fill="#101014" stroke="#26262e" stroke-width="1" />

  <!-- consumed-vs-remaining wedge: luminosity only, never a hue (§2/§14) -->
  <path d={nowWedge} fill="#ffffff" opacity="0.05" />

  <!-- lane band outlines -->
  {#each LANES as lane}
    <circle cx={C} cy={C} r={lane.rOuter} fill="none" stroke="#23232b" stroke-width="1" />
    <circle cx={C} cy={C} r={lane.rInner} fill="none" stroke="#1a1a20" stroke-width="1" />
  {/each}

  <!-- 15-min ticks + hour spokes -->
  {#each ticks as t}
    <line
      x1={t.x1}
      y1={t.y1}
      x2={t.x2}
      y2={t.y2}
      stroke={t.isHour ? '#33333d' : '#26262e'}
      stroke-width={t.isHour ? 1 : 0.6}
    />
  {/each}

  <!-- placed blocks (neutral placeholder fill until the palette lands) -->
  {#each blocks as b (b.id)}
    <path d={blockPath(b)} fill="#6a6a78" opacity="0.85" stroke="#9a9aa8" stroke-width="0.5" />
  {/each}

  <!-- live drag preview: signalled by luminosity/glow, not colour -->
  {#if drag && drag.sweepDeg > 0}
    <path d={dragPath} fill="#b9b9c8" opacity="0.55" filter="url(#glow)" />
  {/if}

  <!-- now tick: faint glowing radial line (non-colour signal, §14) -->
  <line
    x1={nowTick.x1}
    y1={nowTick.y1}
    x2={nowTick.x2}
    y2={nowTick.y2}
    stroke="#fdfdff"
    stroke-width="1.4"
    opacity="0.9"
    filter="url(#glow)"
  />

  <!-- hour labels: civilian 1–12 twice (§2) -->
  {#each hourLabels as l}
    <text
      x={l.x}
      y={l.y}
      text-anchor="middle"
      dominant-baseline="central"
      font-size="9"
      fill={l.marker ? '#cfcfd6' : '#7c7c88'}
      font-weight={l.marker ? 600 : 400}>{l.label}</text
    >
  {/each}

  <!-- hub: current date + (later) spatial cycle position (§6/§11) -->
  <circle cx={C} cy={C} r={HUB_RADIUS} fill="url(#hubFade)" stroke="#2c2c35" stroke-width="1" />
  <text x={C} y={C - 5} text-anchor="middle" font-size="11" fill="#e7e7ea" font-weight="600"
    >{hubDate}</text
  >
  <text x={C} y={C + 11} text-anchor="middle" font-size="7.5" fill="#5d5d68" letter-spacing="0.5"
    >cycle · later</text
  >
</svg>

<style>
  svg {
    width: min(92vw, 92vh);
    height: min(92vw, 92vh);
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  text {
    pointer-events: none;
  }
</style>

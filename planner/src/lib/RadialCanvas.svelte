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
  import { armedVibe } from './stores';
  import { VIBES_BY_ID } from './vibes';

  const NEUTRAL = '#6a6a78'; // placeholder fill when no vibe is armed
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

  // ----- placed blocks. Each carries the armed vibe at placement time; its hex
  // comes from the vibe DB. This is the ONE sanctioned use of meaningful hue
  // (§4) — everything else signals through non-colour channels.
  //
  // The taper grammar (§4) is the honesty layer: a block is solid through its
  // CONFIDENT part (start → coreEnd), then fades to nothing across the predicted
  // overage (coreEnd → taperEnd). taperEnd === coreEnd means a HARD EDGE — "the
  // world's deadline," not mine to estimate. All hours are kept un-wrapped
  // (start in [0,24); coreEnd/taperEnd may exceed 24 for cross-midnight blocks).
  interface Block {
    id: number;
    laneId: string;
    startHours: number;
    coreEndHours: number;
    taperEndHours: number;
    vibeId: string | null;
  }
  let blocks: Block[] = [];
  let nextId = 1;
  let selectedId: number | null = null;

  const MIN_SWEEP_DEG = 1.5; // ignore an accidental tap-as-drag
  const DEFAULT_TAPER_FRAC = 0.4; // born soft — the fade was everywhere on paper
  const MAX_TAPER_HOURS = 6; // a "maybe it runs over" only stretches so far
  const HARD_EDGE_EPS = 0.03; // < ~2 min of taper reads as a hard edge
  const HANDLE_HIT = 13; // viewBox-unit grab radius for the taper handle

  const laneFor = (b: Block) => LANES.find((l) => l.id === b.laneId)!;
  const taperLen = (b: Block) => b.taperEndHours - b.coreEndHours;
  const isHardEdge = (b: Block) => taperLen(b) < HARD_EDGE_EPS;

  function blockFill(b: Block): string {
    return b.vibeId && VIBES_BY_ID[b.vibeId] ? VIBES_BY_ID[b.vibeId].hex : NEUTRAL;
  }

  // Solid, confident core.
  function corePath(b: Block): string {
    const lane = laneFor(b);
    return annularSector(
      C,
      C,
      lane.rInner,
      lane.rOuter,
      hoursToAngle(b.startHours),
      hoursToAngle(b.coreEndHours),
    );
  }

  // The fade: stepped-opacity arc segments (§2/§4 — SVG handles the taper
  // natively this way). Opacity eases from the core's down toward nothing, like
  // a coloured pencil lifting off the page.
  function taperSegments(b: Block): { d: string; opacity: number }[] {
    const span = taperLen(b);
    if (span < HARD_EDGE_EPS) return [];
    const a0 = hoursToAngle(b.coreEndHours);
    const aSpan = (span / 24) * 360;
    const lane = laneFor(b);
    const n = Math.max(6, Math.round(span * 14)); // a step roughly every ~4 min
    const overlap = (aSpan / n) * 0.14; // hairline-killing seam overlap
    const segs: { d: string; opacity: number }[] = [];
    for (let i = 0; i < n; i++) {
      const s = a0 + (aSpan * i) / n;
      const e = a0 + (aSpan * (i + 1)) / n + overlap;
      const t = (i + 0.5) / n; // midpoint keeps it continuous with the core
      const opacity = 0.9 * Math.pow(1 - t, 1.4);
      segs.push({ d: annularSector(C, C, lane.rInner, lane.rOuter, s, e), opacity });
    }
    return segs;
  }

  // The luminous taper handle sits at the tail, on the lane's mid-line.
  function handlePos(b: Block): { x: number; y: number } {
    const lane = laneFor(b);
    const rMid = (lane.rInner + lane.rOuter) / 2;
    return polar(C, C, rMid, hoursToAngle(b.taperEndHours));
  }

  // Is point (in hours, within a lane) inside this block's full angular span?
  function blockContains(b: Block, r: number, hours: number): boolean {
    const lane = laneFor(b);
    if (r < lane.rInner || r > lane.rOuter) return false;
    const s = b.startHours;
    const e = b.taperEndHours;
    return (hours >= s && hours <= e) || (hours + 24 >= s && hours + 24 <= e);
  }

  // ----- gestures (spec §5): all gestural, no number pads. Three intents off a
  // single pointer-down — drag the taper handle, select a block, or draw a new
  // one on empty ring. -----
  let svgEl: SVGSVGElement;
  type CreateDrag = { laneId: string; startHours: number; sweepDeg: number; lastAngle: number };
  let create: CreateDrag | null = null;
  let taperDragId: number | null = null;

  function localPoint(ev: PointerEvent) {
    // Use the SVG's own screen transform so the mapping respects the viewBox
    // AND preserveAspectRatio (xMidYMid meet) — the element isn't square, so
    // scaling x/y independently would skew the radius and break lane hit-testing.
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return { x: SIZE / 2, y: SIZE / 2 };
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }

  function onPointerDown(ev: PointerEvent) {
    const { x, y } = localPoint(ev);
    const r = pointRadius(C, C, x, y);
    const angle = pointToAngle(C, C, x, y);
    const hours = angleToHours(angle);

    // 1. Grabbing the selected block's taper handle?
    const sel = blocks.find((b) => b.id === selectedId);
    if (sel) {
      const h = handlePos(sel);
      if (Math.hypot(x - h.x, y - h.y) <= HANDLE_HIT) {
        taperDragId = sel.id;
        svgEl.setPointerCapture(ev.pointerId);
        return;
      }
    }

    // 2. Tapping an existing block selects it (top-most wins).
    const hit = [...blocks].reverse().find((b) => blockContains(b, r, hours));
    if (hit) {
      selectedId = hit.id;
      svgEl.setPointerCapture(ev.pointerId);
      return;
    }

    // 3. Empty lane → start drawing a new block.
    const innermost = LANES[LANES.length - 1].rInner;
    if (r < innermost || r > RIM_RADIUS) {
      selectedId = null; // tap in the hub/void deselects
      return;
    }
    selectedId = null;
    create = { laneId: laneAtRadius(r).id, startHours: hours, sweepDeg: 0, lastAngle: angle };
    svgEl.setPointerCapture(ev.pointerId);
  }

  function onPointerMove(ev: PointerEvent) {
    const { x, y } = localPoint(ev);
    const angle = pointToAngle(C, C, x, y);

    if (taperDragId !== null) {
      const b = blocks.find((bl) => bl.id === taperDragId);
      if (!b) return;
      // Unwrap the pointer angle forward from coreEnd, then clamp the fade.
      let target = angleToHours(angle);
      while (target < b.coreEndHours) target += 24;
      const span = Math.min(MAX_TAPER_HOURS, Math.max(0, target - b.coreEndHours));
      b.taperEndHours = b.coreEndHours + span;
      blocks = blocks; // poke reactivity
      return;
    }

    if (create) {
      let delta = angle - create.lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      create.sweepDeg = Math.min(360, Math.max(0, create.sweepDeg + delta));
      create.lastAngle = angle;
      create = create;
    }
  }

  function onPointerUp() {
    if (taperDragId !== null) {
      taperDragId = null;
      return;
    }
    if (create) {
      if (create.sweepDeg > MIN_SWEEP_DEG) {
        const coreLen = (create.sweepDeg / 360) * 24;
        const coreEnd = create.startHours + coreLen;
        const id = nextId++;
        blocks = [
          ...blocks,
          {
            id,
            laneId: create.laneId,
            startHours: create.startHours,
            coreEndHours: coreEnd,
            // Born soft (§4 / paper habit): a gentle default fade you can adjust
            // or pull back to a hard edge via the handle.
            taperEndHours: coreEnd + Math.min(MAX_TAPER_HOURS, coreLen * DEFAULT_TAPER_FRAC),
            vibeId: $armedVibe ? $armedVibe.id : null,
          },
        ];
        selectedId = id; // select so the taper handle is immediately grabbable
      }
      create = null;
    }
  }

  $: createLane = create ? LANES.find((l) => l.id === create!.laneId)! : null;
  $: createPath =
    create && createLane
      ? annularSector(
          C,
          C,
          createLane.rInner,
          createLane.rOuter,
          hoursToAngle(create.startHours),
          hoursToAngle(create.startHours) + create.sweepDeg,
        )
      : '';

  $: selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;

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

  <!-- placed blocks: solid core in the vibe hex (the one sanctioned use of
       meaningful colour, §4), then the taper fading to nothing = my estimate. -->
  {#each blocks as b (b.id)}
    <path d={corePath(b)} fill={blockFill(b)} opacity="0.9" />
    {#each taperSegments(b) as seg}
      <path d={seg.d} fill={blockFill(b)} opacity={seg.opacity} />
    {/each}
  {/each}

  <!-- selection: NON-colour signal only (§2) — a luminous outline on the core
       plus the grabbable taper handle. -->
  {#if selectedBlock}
    <path
      d={corePath(selectedBlock)}
      fill="none"
      stroke="#ffffff"
      stroke-width="1.1"
      opacity="0.55"
      filter="url(#glow)"
    />
    {@const h = handlePos(selectedBlock)}
    <circle cx={h.x} cy={h.y} r="5.5" fill="#fdfdff" filter="url(#glow)" />
    <circle cx={h.x} cy={h.y} r="2.4" fill="#0d0d10" />
    {#if isHardEdge(selectedBlock)}
      <!-- hard edge: a crisp notch at the tail says "the world's deadline" -->
      {@const lane = laneFor(selectedBlock)}
      {@const a = hoursToAngle(selectedBlock.coreEndHours)}
      {@const p1 = polar(C, C, lane.rInner, a)}
      {@const p2 = polar(C, C, lane.rOuter, a)}
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="#ffffff"
        stroke-width="1.6"
        opacity="0.85"
      />
    {/if}
  {/if}

  <!-- live drag preview: shows the armed vibe's hue being painted; glow is the
       non-colour "active" cue (§2). -->
  {#if create && create.sweepDeg > 0}
    <path
      d={createPath}
      fill={$armedVibe ? $armedVibe.hex : '#b9b9c8'}
      opacity="0.6"
      filter="url(#glow)"
    />
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
    /* Bounded square: leaves vertical room for the palette tray and, crucially,
       gives the SVG a definite size so it can't enter the flex intrinsic-width
       blowup that the wide palette grid would otherwise trigger. */
    width: min(94vw, 64vh);
    height: min(94vw, 64vh);
    display: block;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  text {
    pointer-events: none;
  }
</style>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { hoursToAngle, angleToHours, polar, pointToAngle, pointRadius, annularSector, pieSector } from './geometry';
  import { LANES, laneAtRadius, HUB_RADIUS, RIM_RADIUS, LABEL_RADIUS } from './lanes';
  import { armedVibe } from './stores';
  import {
    SIZE,
    C,
    isHardEdge,
    laneFor,
    blockFill,
    corePath,
    taperSegments,
    handlePos,
    blockContains,
    type Block,
  } from './blocks';
  import { currentKey, currentDay, saveDay } from './days';
  import { todayKey } from './days';

  // ----- live "now" (spec §14): not a clock hand — a consumed-vs-remaining
  // wedge that fills in BEHIND now as the day burns down. -----
  let now = new Date();
  let timer: ReturnType<typeof setInterval>;
  onMount(() => {
    timer = setInterval(() => (now = new Date()), 15000);
  });
  onDestroy(() => clearInterval(timer));

  // The now-wedge/tick only mean anything on TODAY's ring.
  $: viewingToday = $currentKey === todayKey();
  $: nowHours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  $: nowAngleRaw = 180 + (nowHours / 24) * 360;
  $: nowTickAngle = hoursToAngle(nowHours);
  $: nowWedge = pieSector(C, C, RIM_RADIUS, 180, nowAngleRaw);
  $: nowTick = (() => {
    const a = polar(C, C, RIM_RADIUS, nowTickAngle);
    const b = polar(C, C, HUB_RADIUS, nowTickAngle);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  })();

  const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  $: hubDate = dateFmt.format(viewingToday ? now : parseKeyLocal($currentKey));
  function parseKeyLocal(k: string): Date {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // ----- local working copy of the current day's blocks. Synced from the store
  // when the day changes; written back on every committed mutation. Live drags
  // mutate the local copy only, then persist on pointer-up. -----
  let blocks: Block[] = [];
  let nextId = 1;
  let loadedKey = '';
  let selectedId: number | null = null;

  $: if ($currentKey !== loadedKey) {
    blocks = structuredClone($currentDay.blocks);
    nextId = $currentDay.nextId;
    selectedId = null;
    loadedKey = $currentKey;
  }

  function persist() {
    saveDay(loadedKey, structuredClone(blocks), nextId);
  }

  const MIN_SWEEP_DEG = 1.5; // ignore an accidental tap-as-drag
  const DEFAULT_TAPER_FRAC = 0.4; // born soft — the fade was everywhere on paper
  const MAX_TAPER_HOURS = 6; // a "maybe it runs over" only stretches so far
  const HANDLE_HIT = 13; // viewBox-unit grab radius for the taper handle

  // ----- gestures (spec §5): all gestural, no number pads. -----
  let svgEl: SVGSVGElement;
  type CreateDrag = { laneId: string; startHours: number; sweepDeg: number; lastAngle: number };
  let create: CreateDrag | null = null;
  let taperDragId: number | null = null;
  let tapCandidateId: number | null = null; // a block tapped without dragging

  function localPoint(ev: PointerEvent) {
    // Use the SVG's own screen transform so the mapping respects the viewBox AND
    // preserveAspectRatio — the element isn't square, so scaling x/y separately
    // would skew the radius and break lane hit-testing.
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
    tapCandidateId = null;

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

    // 2. Tapping a block: select it; a second tap on an already-selected block
    // toggles done (interim tick-off until the text headers land — §6).
    const hit = [...blocks].reverse().find((b) => blockContains(b, r, hours));
    if (hit) {
      wasAlreadySelected = hit.id === selectedId; // before we change selection
      tapCandidateId = hit.id; // resolved on pointer-up if no drag happened
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
      let target = angleToHours(angle);
      while (target < b.coreEndHours) target += 24;
      const span = Math.min(MAX_TAPER_HOURS, Math.max(0, target - b.coreEndHours));
      b.taperEndHours = b.coreEndHours + span;
      blocks = blocks;
      return;
    }

    if (create) {
      let delta = angle - create.lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      create.sweepDeg = Math.min(360, Math.max(0, create.sweepDeg + delta));
      create.lastAngle = angle;
      tapCandidateId = null;
      create = create;
    } else if (tapCandidateId !== null) {
      // any meaningful move cancels the "tap" interpretation
      tapCandidateId = null;
    }
  }

  function onPointerUp() {
    if (taperDragId !== null) {
      taperDragId = null;
      persist();
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
            // Born soft (§4 / paper habit): a gentle default fade.
            taperEndHours: coreEnd + Math.min(MAX_TAPER_HOURS, coreLen * DEFAULT_TAPER_FRAC),
            vibeId: $armedVibe ? $armedVibe.id : null,
            done: false,
          },
        ];
        selectedId = id;
        persist();
      }
      create = null;
      return;
    }

    // A clean tap on an already-selected block toggles its done state. The
    // first tap only selects; the second (block was already selected) ticks it.
    if (tapCandidateId !== null) {
      const b = blocks.find((bl) => bl.id === tapCandidateId);
      if (b && b.id === selectedId && wasAlreadySelected) {
        b.done = !b.done;
        blocks = blocks;
        persist();
      }
      tapCandidateId = null;
    }
  }

  // Was the tapped block selected BEFORE this gesture? Set in onPointerDown.
  let wasAlreadySelected = false;

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

  // ----- static geometry -----
  const ticks = Array.from({ length: 96 }, (_, i) => {
    const angle = 180 + (i / 96) * 360;
    const isHour = i % 4 === 0;
    const outer = polar(C, C, RIM_RADIUS, angle);
    const inner = polar(C, C, isHour ? HUB_RADIUS : RIM_RADIUS - 7, angle);
    return { x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y, isHour };
  });

  const hourLabels = Array.from({ length: 24 }, (_, h) => {
    const p = polar(C, C, LABEL_RADIUS, hoursToAngle(h));
    return { x: p.x, y: p.y, label: String(h % 12 === 0 ? 12 : h % 12), marker: h === 0 || h === 12 };
  });

  // A done block's "tick": two short luminous strokes across its core mid-line.
  function doneTick(b: Block): { x1: number; y1: number; x2: number; y2: number } {
    const lane = laneFor(b);
    const rMid = (lane.rInner + lane.rOuter) / 2;
    const aMid = hoursToAngle((b.startHours + b.coreEndHours) / 2);
    const p1 = polar(C, C, rMid - 5, aMid);
    const p2 = polar(C, C, rMid + 5, aMid);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }
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
  {#if viewingToday}
    <path d={nowWedge} fill="#ffffff" opacity="0.05" />
  {/if}

  <!-- lane band outlines -->
  {#each LANES as lane}
    <circle cx={C} cy={C} r={lane.rOuter} fill="none" stroke="#23232b" stroke-width="1" />
    <circle cx={C} cy={C} r={lane.rInner} fill="none" stroke="#1a1a20" stroke-width="1" />
  {/each}

  <!-- 15-min ticks + hour spokes -->
  {#each ticks as t}
    <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.isHour ? '#33333d' : '#26262e'} stroke-width={t.isHour ? 1 : 0.6} />
  {/each}

  <!-- placed blocks: solid core in the vibe hex (the one sanctioned use of
       meaningful colour, §4), then the taper fading to nothing = my estimate.
       Done blocks dim back and carry a luminous tick (non-colour, interim). -->
  {#each blocks as b (b.id)}
    <path d={corePath(b)} fill={blockFill(b)} opacity={b.done ? 0.4 : 0.9} />
    {#each taperSegments(b) as seg}
      <path d={seg.d} fill={blockFill(b)} opacity={b.done ? seg.opacity * 0.45 : seg.opacity} />
    {/each}
    {#if b.done}
      {@const tk = doneTick(b)}
      <line x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} stroke="#fdfdff" stroke-width="1.5" opacity="0.8" filter="url(#glow)" />
    {/if}
  {/each}

  <!-- selection: NON-colour signal only (§2) — a luminous outline + handle. -->
  {#if selectedBlock}
    <path d={corePath(selectedBlock)} fill="none" stroke="#ffffff" stroke-width="1.1" opacity="0.55" filter="url(#glow)" />
    {@const h = handlePos(selectedBlock)}
    <circle cx={h.x} cy={h.y} r="5.5" fill="#fdfdff" filter="url(#glow)" />
    <circle cx={h.x} cy={h.y} r="2.4" fill="#0d0d10" />
    {#if isHardEdge(selectedBlock)}
      {@const lane = laneFor(selectedBlock)}
      {@const a = hoursToAngle(selectedBlock.coreEndHours)}
      {@const p1 = polar(C, C, lane.rInner, a)}
      {@const p2 = polar(C, C, lane.rOuter, a)}
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#ffffff" stroke-width="1.6" opacity="0.85" />
    {/if}
  {/if}

  <!-- live drag preview -->
  {#if create && create.sweepDeg > 0}
    <path d={createPath} fill={$armedVibe ? $armedVibe.hex : '#b9b9c8'} opacity="0.6" filter="url(#glow)" />
  {/if}

  <!-- now tick: faint glowing radial line (non-colour signal, §14) -->
  {#if viewingToday}
    <line x1={nowTick.x1} y1={nowTick.y1} x2={nowTick.x2} y2={nowTick.y2} stroke="#fdfdff" stroke-width="1.4" opacity="0.9" filter="url(#glow)" />
  {/if}

  <!-- hour labels: civilian 1–12 twice (§2) -->
  {#each hourLabels as l}
    <text x={l.x} y={l.y} text-anchor="middle" dominant-baseline="central" font-size="9" fill={l.marker ? '#cfcfd6' : '#7c7c88'} font-weight={l.marker ? 600 : 400}>{l.label}</text>
  {/each}

  <!-- hub: current date + (later) spatial cycle position (§6/§11) -->
  <circle cx={C} cy={C} r={HUB_RADIUS} fill="url(#hubFade)" stroke="#2c2c35" stroke-width="1" />
  <text x={C} y={C - 5} text-anchor="middle" font-size="11" fill="#e7e7ea" font-weight="600">{hubDate}</text>
  <text x={C} y={C + 11} text-anchor="middle" font-size="7.5" fill="#5d5d68" letter-spacing="0.5">
    {viewingToday ? 'cycle · later' : 'past day'}
  </text>
</svg>

<style>
  svg {
    /* Bounded square: leaves room for the palette and gives the SVG a definite
       size so it can't enter the flex intrinsic-width blowup the wide palette
       grid would otherwise trigger. */
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

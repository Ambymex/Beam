<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { hoursToAngle, angleToHours, polar, pointToAngle, pointRadius, annularSector, pieSector } from './geometry';
  import { LANES, laneAtRadius, HUB_RADIUS, RIM_RADIUS, LABEL_RADIUS } from './lanes';
  import { armedVibe } from './stores';
  import {
    SIZE,
    C,
    isHardEdge,
    isAppointment,
    laneFor,
    blockFill,
    corePath,
    taperSegments,
    handlePos,
    blockContains,
    prependWingSegments,
    appendWingSegments,
    departureHours,
    TRAVEL_HEX,
    DEFAULT_TRAVEL_HOURS,
    MAX_TRAVEL_HOURS,
    type Block,
  } from './blocks';
  import { currentKey, currentDay, saveDay } from './days';
  import { todayKey } from './days';
  import { selectedBlockStore, blockActions, cascadeMode, appointmentMode } from './daystate';
  import { computeMove, computeResizeStart, computeResizeCore, angDiffHours } from './cascade';

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
  const EDGE_HIT_HOURS = 0.6; // how close (in hours) to a core edge counts as grabbing it

  // ----- gestures (spec §5): all gestural, no number pads. -----
  let svgEl: SVGSVGElement;
  type CreateDrag = { laneId: string; startHours: number; sweepDeg: number; lastAngle: number };
  let create: CreateDrag | null = null;
  let taperDragId: number | null = null;
  let tapCandidateId: number | null = null; // a block tapped without dragging

  // Editing an existing block (spec §9): move the whole block, or resize an edge.
  // We recompute from a grab-time SNAPSHOT each move (no accumulation drift).
  type EditKind = 'move' | 'resizeStart' | 'resizeCore';
  type EditDrag = { id: number; kind: EditKind; grabHours: number; snapshot: Block[] };
  let edit: EditDrag | null = null;
  let cascadeBlockedId: number | null = null; // hard edge that halted a cascade

  // Dragging an appointment's travel-time wing endpoint (§8): 'before' = the
  // departure ("leave by") edge, 'after' = the "get home" edge.
  let wingDrag: { id: number; which: 'before' | 'after' } | null = null;

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
      // 1a-wing. An appointment's travel-wing endpoints take precedence over the
      // (meaningless) taper handle, since appointments are hard-edged (§8).
      if (isAppointment(sel)) {
        const bp = wingHandlePos(sel, 'before');
        const ap = wingHandlePos(sel, 'after');
        if (bp && Math.hypot(x - bp.x, y - bp.y) <= HANDLE_HIT) {
          wingDrag = { id: sel.id, which: 'before' };
          svgEl.setPointerCapture(ev.pointerId);
          return;
        }
        if (ap && Math.hypot(x - ap.x, y - ap.y) <= HANDLE_HIT) {
          wingDrag = { id: sel.id, which: 'after' };
          svgEl.setPointerCapture(ev.pointerId);
          return;
        }
      }
      const h = handlePos(sel);
      if (!isAppointment(sel) && Math.hypot(x - h.x, y - h.y) <= HANDLE_HIT) {
        taperDragId = sel.id;
        svgEl.setPointerCapture(ev.pointerId);
        return;
      }
      // 1b. Grabbing a core EDGE of the selected block (resize), or its BODY
      // (move). Only the selected block is editable, so edits never fire by
      // accident on an unselected one. (spec §9)
      const selLane = laneFor(sel);
      if (r >= selLane.rInner && r <= selLane.rOuter && blockContains(sel, r, hours)) {
        const dStart = Math.abs(angDiffHours(hours, sel.startHours));
        const dCore = Math.abs(angDiffHours(hours, sel.coreEndHours));
        let kind: EditKind = 'move';
        if (dStart <= EDGE_HIT_HOURS && dStart <= dCore) kind = 'resizeStart';
        else if (dCore <= EDGE_HIT_HOURS) kind = 'resizeCore';
        edit = { id: sel.id, kind, grabHours: hours, snapshot: structuredClone(blocks) };
        cascadeBlockedId = null;
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

    if (wingDrag) {
      // Drag a travel wing's outer endpoint (§8). The fade still means "my guess"
      // — for travel the guess lives on the outside of the fixed appointment bar.
      const b = blocks.find((bl) => bl.id === wingDrag!.id);
      if (!b) return;
      const t = angleToHours(angle);
      if (wingDrag.which === 'before') {
        // departure is BEFORE the start; unwrap backward.
        let dep = t;
        while (dep > b.startHours) dep -= 24;
        b.travelBeforeHours = Math.min(MAX_TRAVEL_HOURS, Math.max(0, b.startHours - dep));
      } else {
        let home = t;
        while (home < b.coreEndHours) home += 24;
        b.travelAfterHours = Math.min(MAX_TRAVEL_HOURS, Math.max(0, home - b.coreEndHours));
      }
      blocks = blocks;
      return;
    }

    if (edit) {
      // Slip = signed angular distance from where the finger grabbed (§9). Recompute
      // from the snapshot so the result is a clean function of the current finger
      // position, never an accumulation of per-frame deltas.
      const slip = angDiffHours(angleToHours(angle), edit.grabHours);
      const res =
        edit.kind === 'resizeStart'
          ? computeResizeStart(edit.snapshot, edit.id, slip)
          : edit.kind === 'resizeCore'
            ? computeResizeCore(edit.snapshot, edit.id, slip)
            : computeMove(edit.snapshot, edit.id, slip, $cascadeMode);
      blocks = res.blocks;
      cascadeBlockedId = res.blockedId;
      tapCandidateId = null;
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

    if (wingDrag) {
      wingDrag = null;
      persist();
      return;
    }

    if (edit) {
      edit = null;
      cascadeBlockedId = null;
      persist();
      return;
    }

    if (create) {
      if (create.sweepDeg > MIN_SWEEP_DEG) {
        const coreLen = (create.sweepDeg / 360) * 24;
        const coreEnd = create.startHours + coreLen;
        const id = nextId++;
        if ($appointmentMode) {
          // Appointment (§8): hard-edged (no taper — not mine to estimate), with
          // default travel-time wings you can then drag.
          blocks = [
            ...blocks,
            {
              id,
              laneId: create.laneId,
              startHours: create.startHours,
              coreEndHours: coreEnd,
              taperEndHours: coreEnd, // hard edge
              vibeId: $armedVibe ? $armedVibe.id : null,
              done: false,
              kind: 'appointment',
              travelBeforeHours: DEFAULT_TRAVEL_HOURS,
              travelAfterHours: DEFAULT_TRAVEL_HOURS,
            },
          ];
        } else {
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
        }
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

  // ----- block editor actions (label / done / delete), published to a store so
  // the BlockEditor panel (rendered by App) can drive the selected block. -----
  function setSelectedLabel(text: string) {
    const b = blocks.find((x) => x.id === selectedId);
    if (!b) return;
    b.label = text;
    blocks = blocks;
    persist();
  }
  function toggleSelectedDone() {
    const b = blocks.find((x) => x.id === selectedId);
    if (!b) return;
    b.done = !b.done;
    blocks = blocks;
    persist();
  }
  function removeSelected() {
    blocks = blocks.filter((x) => x.id !== selectedId);
    selectedId = null;
    persist();
  }
  onMount(() => {
    blockActions.set({
      setLabel: setSelectedLabel,
      toggleDone: toggleSelectedDone,
      remove: removeSelected,
      deselect: () => (selectedId = null),
    });
  });
  onDestroy(() => blockActions.set(null));

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
  $: selectedBlockStore.set(selectedBlock);

  // The selected block's label chip — a "header hung off the arc" (§6), shown
  // only when selected (collapsed by default; colour identifies the rest).
  $: selectedLabel = computeSelectedLabel(selectedBlock);
  function computeSelectedLabel(b: Block | null) {
    if (!b || !b.label) return null;
    const lane = laneFor(b);
    const aMid = hoursToAngle((b.startHours + b.coreEndHours) / 2);
    const anchorPt = polar(C, C, lane.rOuter, aMid);
    const labelPt = polar(C, C, RIM_RADIUS + 17, aMid);
    return {
      text: b.label,
      x: labelPt.x,
      y: labelPt.y,
      ax: anchorPt.x,
      ay: anchorPt.y,
      right: labelPt.x >= C,
    };
  }

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

  // Edge grab-handles on the selected block (resize cues, non-colour §2).
  function edgeHandle(b: Block, which: 'start' | 'core'): { x: number; y: number } {
    const lane = laneFor(b);
    const rMid = (lane.rInner + lane.rOuter) / 2;
    const a = hoursToAngle(which === 'start' ? b.startHours : b.coreEndHours);
    return polar(C, C, rMid, a);
  }

  // Travel-wing endpoint handles for an appointment (§8): 'before' = departure
  // edge (start of prepend wing), 'after' = "home" edge (end of append wing).
  // Null when that wing has no length.
  function wingHandlePos(b: Block, which: 'before' | 'after'): { x: number; y: number } | null {
    const lane = laneFor(b);
    const rMid = (lane.rInner + lane.rOuter) / 2;
    if (which === 'before') {
      if ((b.travelBeforeHours ?? 0) < 0.05) return null;
      return polar(C, C, rMid, hoursToAngle(departureHours(b)));
    }
    if ((b.travelAfterHours ?? 0) < 0.05) return null;
    return polar(C, C, rMid, hoursToAngle(b.coreEndHours + (b.travelAfterHours ?? 0)));
  }

  // The hard-edged block a cascade ran into (flagged, not trampled — §9).
  $: blockedBlock = cascadeBlockedId !== null ? blocks.find((b) => b.id === cascadeBlockedId) ?? null : null;
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
    <!-- appointment travel wings (§8): fade AWAY from the fixed bar, in the
         travel hue. Drawn first so the solid appointment core sits on top. -->
    {#if b.kind === 'appointment'}
      {#each prependWingSegments(b) as seg}
        <path d={seg.d} fill={TRAVEL_HEX} opacity={b.done ? seg.opacity * 0.45 : seg.opacity} />
      {/each}
      {#each appendWingSegments(b) as seg}
        <path d={seg.d} fill={TRAVEL_HEX} opacity={b.done ? seg.opacity * 0.45 : seg.opacity} />
      {/each}
    {/if}
    <path d={corePath(b)} fill={blockFill(b)} opacity={b.done ? 0.4 : 0.9} />
    {#each taperSegments(b) as seg}
      <path d={seg.d} fill={blockFill(b)} opacity={b.done ? seg.opacity * 0.45 : seg.opacity} />
    {/each}
    {#if b.done}
      {@const tk = doneTick(b)}
      <line x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} stroke="#fdfdff" stroke-width="1.5" opacity="0.8" filter="url(#glow)" />
    {/if}
  {/each}

  <!-- cascade halt flag: the hard-edged block a push ran into — pulsed outline,
       non-colour, says "I stopped here, didn't trample your deadline" (§9). -->
  {#if blockedBlock}
    <path d={corePath(blockedBlock)} fill="none" stroke="#ffffff" stroke-width="2" opacity="0.95" filter="url(#glow)" />
  {/if}

  <!-- selection: NON-colour signal only (§2) — a luminous outline + handles. -->
  {#if selectedBlock}
    <path d={corePath(selectedBlock)} fill="none" stroke="#ffffff" stroke-width="1.1" opacity="0.55" filter="url(#glow)" />
    {#if isAppointment(selectedBlock)}
      <!-- appointment: crisp deadline edges + draggable travel-wing handles (§8) -->
      {@const lane = laneFor(selectedBlock)}
      {@const aS = hoursToAngle(selectedBlock.startHours)}
      {@const aE = hoursToAngle(selectedBlock.coreEndHours)}
      {@const s1 = polar(C, C, lane.rInner, aS)}
      {@const s2 = polar(C, C, lane.rOuter, aS)}
      {@const e1 = polar(C, C, lane.rInner, aE)}
      {@const e2 = polar(C, C, lane.rOuter, aE)}
      <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke="#ffffff" stroke-width="1.6" opacity="0.85" />
      <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} stroke="#ffffff" stroke-width="1.6" opacity="0.85" />
      {@const bp = wingHandlePos(selectedBlock, 'before')}
      {@const ap = wingHandlePos(selectedBlock, 'after')}
      {#if bp}
        <circle cx={bp.x} cy={bp.y} r="5" fill="#fdfdff" filter="url(#glow)" />
        <circle cx={bp.x} cy={bp.y} r="2.2" fill="#0d0d10" />
      {/if}
      {#if ap}
        <circle cx={ap.x} cy={ap.y} r="5" fill="#fdfdff" filter="url(#glow)" />
        <circle cx={ap.x} cy={ap.y} r="2.2" fill="#0d0d10" />
      {/if}
    {:else}
      {@const h = handlePos(selectedBlock)}
      <circle cx={h.x} cy={h.y} r="5.5" fill="#fdfdff" filter="url(#glow)" />
      <circle cx={h.x} cy={h.y} r="2.4" fill="#0d0d10" />
      <!-- resize edge-handles: small luminous nubs at start + core end (§9) -->
      {@const sh = edgeHandle(selectedBlock, 'start')}
      {@const ch = edgeHandle(selectedBlock, 'core')}
      <circle cx={sh.x} cy={sh.y} r="3" fill="#0d0d10" stroke="#fdfdff" stroke-width="1.4" />
      {#if !isHardEdge(selectedBlock)}
        <circle cx={ch.x} cy={ch.y} r="3" fill="#0d0d10" stroke="#fdfdff" stroke-width="1.4" />
      {/if}
      {#if isHardEdge(selectedBlock)}
        {@const lane = laneFor(selectedBlock)}
        {@const a = hoursToAngle(selectedBlock.coreEndHours)}
        {@const p1 = polar(C, C, lane.rInner, a)}
        {@const p2 = polar(C, C, lane.rOuter, a)}
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#ffffff" stroke-width="1.6" opacity="0.85" />
      {/if}
    {/if}
  {/if}

  <!-- selected block's text header, hung off the arc (§6) -->
  {#if selectedLabel}
    <line
      x1={selectedLabel.ax}
      y1={selectedLabel.ay}
      x2={selectedLabel.x}
      y2={selectedLabel.y}
      stroke="#ffffff"
      stroke-width="0.8"
      opacity="0.35"
    />
    <text
      x={selectedLabel.x}
      y={selectedLabel.y}
      text-anchor={selectedLabel.right ? 'start' : 'end'}
      dominant-baseline="central"
      font-size="10"
      fill="#f0f0f3"
      filter="url(#glow)">{selectedLabel.text}</text
    >
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

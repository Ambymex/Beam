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
  import {
    type Symptom,
    type SymptomCategory,
    SYMPTOM_ARC_HOURS,
    SYMPTOM_FILL,
    severityOpacity,
    symptomContains,
  } from './symptoms';
  import { currentKey, currentDay, saveDay } from './days';
  import { todayKey } from './days';
  import { selectedBlockStore, blockActions, cascadeMode, appointmentMode, selectedSymptomStore, symptomActions } from './daystate';
  import { computeMove, computeResizeStart, computeResizeCore, angDiffHours } from './cascade';
  import { palette, theme, moonCycle, envLabel } from './theme';
  import {
    todayGlucose,
    currentGlucose,
    beamConfig,
    mgdlToMmol,
    formatGlucose,
    glucoseForDay,
    TREND_ARROWS,
    type GlucosePoint,
  } from './glucose';

  // Themed palette for the ring's structural marks (the signal inverts on
  // light, per §2). Vibe block fills are untouched — they're the user's data.
  $: pal = $palette;

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

  // ----- SVG moon phase: white disc masked so the shadow is transparent -----
  const MOON_R = 9;
  $: moonPath = (() => {
    const c = $moonCycle;
    const illum = 0.5 - 0.5 * Math.cos(2 * Math.PI * c);
    const r = MOON_R;

    if (illum < 0.01) return '';
    if (illum > 0.99) return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${r} ${r} 0 0 1 0 ${-r} Z`;

    const tx = r * Math.abs(Math.cos(2 * Math.PI * c));
    const gibbous = illum > 0.5;

    if (c < 0.5) {
      // Waxing: lit on right — outer edge is right semicircle (clockwise)
      let d = `M 0 ${-r} A ${r} ${r} 0 0 1 ${r} 0 A ${r} ${r} 0 0 1 0 ${r}`;
      if (gibbous) {
        // Terminator past centre, on left side (clockwise back to top)
        d += ` A ${tx} ${r} 0 0 1 ${-tx} 0 A ${tx} ${r} 0 0 1 0 ${-r}`;
      } else {
        // Terminator on right side (counterclockwise back to top)
        d += ` A ${tx} ${r} 0 0 0 ${tx} 0 A ${tx} ${r} 0 0 0 0 ${-r}`;
      }
      return d + ' Z';
    } else {
      // Waning: lit on left — outer edge is left semicircle (counterclockwise)
      let d = `M 0 ${-r} A ${r} ${r} 0 0 0 ${-r} 0 A ${r} ${r} 0 0 0 0 ${r}`;
      if (gibbous) {
        // Terminator past centre, on right side (counterclockwise back to top)
        d += ` A ${tx} ${r} 0 0 0 ${tx} 0 A ${tx} ${r} 0 0 0 0 ${-r}`;
      } else {
        // Terminator on left side (clockwise back to top)
        d += ` A ${tx} ${r} 0 0 1 ${-tx} 0 A ${tx} ${r} 0 0 1 0 ${-r}`;
      }
      return d + ' Z';
    }
  })();

  // ----- CGM backdrop landscape: glucose as terrain UNDER the day. Value maps
  // to radius (higher sugar = taller terrain), time to angle like everything
  // else. In-range is pure luminosity; only out-of-range excursions borrow the
  // theme's signal colour. -----
  const GLU_MIN_MMOL = 2;
  const GLU_MAX_MMOL = 16;
  const GLU_R0 = HUB_RADIUS + 6; // terrain floor, just clear of the hub
  const GLU_R1 = RIM_RADIUS - 4; // ceiling, just inside the rim
  const GLU_GAP_MS = 15 * 60 * 1000; // >15 min without data = break the line

  let glucosePoints: GlucosePoint[] = [];
  $: if (viewingToday) glucosePoints = $todayGlucose;
  $: if (!viewingToday) loadPastGlucose($currentKey);
  function loadPastGlucose(key: string) {
    glucoseForDay(key).then((pts) => {
      // guard against the day changing again while the query ran
      if (!viewingToday && key === $currentKey) glucosePoints = pts;
    });
  }

  function gluRadius(mgdl: number): number {
    const mmol = Math.min(GLU_MAX_MMOL, Math.max(GLU_MIN_MMOL, mgdlToMmol(mgdl)));
    return GLU_R0 + ((mmol - GLU_MIN_MMOL) / (GLU_MAX_MMOL - GLU_MIN_MMOL)) * (GLU_R1 - GLU_R0);
  }
  function gluAngle(ts: number): number {
    const d = new Date(ts);
    return hoursToAngle(d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600);
  }
  function polyline(pts: { a: number; r: number }[]): string {
    return pts
      .map((p, i) => {
        const pt = polar(C, C, p.r, p.a);
        return `${i ? 'L' : 'M'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
      })
      .join(' ');
  }
  function buildGlucosePaths(
    points: GlucosePoint[],
    lowMmol: number,
    highMmol: number,
  ): { areas: string[]; lines: string[]; hot: string[] } {
    const out = { areas: [] as string[], lines: [] as string[], hot: [] as string[] };
    if (points.length < 2) return out;
    const segs: GlucosePoint[][] = [];
    let cur: GlucosePoint[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      if (points[i].ts - points[i - 1].ts > GLU_GAP_MS) {
        if (cur.length > 1) segs.push(cur);
        cur = [];
      }
      cur.push(points[i]);
    }
    if (cur.length > 1) segs.push(cur);

    for (const seg of segs) {
      const pts = seg.map((p) => ({
        a: gluAngle(p.ts),
        r: gluRadius(p.mgdl),
        mmol: mgdlToMmol(p.mgdl),
      }));
      const line = polyline(pts);
      out.lines.push(line);
      // close the area down to the terrain floor and back along its arc
      const endBase = polar(C, C, GLU_R0, pts[pts.length - 1].a);
      const startBase = polar(C, C, GLU_R0, pts[0].a);
      const largeArc = pts[pts.length - 1].a - pts[0].a > 180 ? 1 : 0;
      out.areas.push(
        `${line} L ${endBase.x.toFixed(2)} ${endBase.y.toFixed(2)} ` +
          `A ${GLU_R0} ${GLU_R0} 0 ${largeArc} 0 ${startBase.x.toFixed(2)} ${startBase.y.toFixed(2)} Z`,
      );
      // out-of-range runs get the signal stroke
      let run: { a: number; r: number }[] = [];
      for (const p of pts) {
        if (p.mmol < lowMmol || p.mmol > highMmol) {
          run.push(p);
        } else {
          if (run.length > 1) out.hot.push(polyline(run));
          run = [];
        }
      }
      if (run.length > 1) out.hot.push(polyline(run));
    }
    return out;
  }
  $: glucosePaths = buildGlucosePaths(glucosePoints, $beamConfig.lowMmol, $beamConfig.highMmol);

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
  let symptoms: Symptom[] = [];
  let nextSymptomId = 1;
  let loadedKey = '';
  let selectedId: number | null = null;
  let selectedSymptomId: number | null = null;

  // Synchronise canvas blocks and symptoms with store changes (AI companion, database updates)
  $: if (!create && !taperDragId && !edit && !wingDrag) {
    const storeBlocks = $currentDay.blocks;
    const storeSymptoms = $currentDay.symptoms || [];
    
    const blocksChanged = JSON.stringify(blocks) !== JSON.stringify(storeBlocks);
    const symptomsChanged = JSON.stringify(symptoms) !== JSON.stringify(storeSymptoms);
    const keyChanged = $currentKey !== loadedKey;

    if (blocksChanged || symptomsChanged || keyChanged) {
      blocks = structuredClone(storeBlocks);
      nextId = $currentDay.nextId;
      symptoms = structuredClone(storeSymptoms);
      nextSymptomId = $currentDay.nextSymptomId || 1;
      
      if (keyChanged) {
        selectedId = null;
        selectedSymptomId = null;
        loadedKey = $currentKey;
      }
    }
  }

  function persist() {
    saveDay(loadedKey, structuredClone(blocks), nextId, structuredClone(symptoms), nextSymptomId);
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

  // ----- zoom & pan (the ring is dense on a phone). Implemented purely as a
  // viewBox window, so every gesture above keeps mapping correctly through
  // getScreenCTM() with zero changes to hit-testing. Non-colour, no number. -----
  const MIN_ZOOM = 1; // never zoom out past the whole ring
  const MAX_ZOOM = 5;
  let view = { x: 0, y: 0, w: SIZE, h: SIZE };
  $: zoom = SIZE / view.w; // 1 = whole ring, >1 = zoomed in
  $: viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;

  // Two-finger pinch state: the active pointers (id → client coords).
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; cx: number; cy: number } | null = null;
  $: pinching = pinch !== null;
  let lastTapTime = 0;

  // Re-window the viewBox to a target zoom, keeping the content under (ax, ay)
  // — a point in *viewBox* units — anchored in place.
  function zoomTo(targetZoom: number, ax: number, ay: number) {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
    const w = SIZE / z;
    const h = SIZE / z;
    // keep (ax,ay)'s fractional position within the window constant
    const fx = view.w === 0 ? 0.5 : (ax - view.x) / view.w;
    const fy = view.h === 0 ? 0.5 : (ay - view.y) / view.h;
    let x = ax - fx * w;
    let y = ay - fy * h;
    // clamp so we never pan off the ring
    x = Math.max(0, Math.min(SIZE - w, x));
    y = Math.max(0, Math.min(SIZE - h, y));
    view = { x, y, w, h };
  }

  function resetView() {
    view = { x: 0, y: 0, w: SIZE, h: SIZE };
  }

  // Buttons step zoom around the ring centre.
  function stepZoom(factor: number) {
    zoomTo(zoom * factor, view.x + view.w / 2, view.y + view.h / 2);
  }

  // Desktop wheel: zoom anchored at the cursor.
  function onWheel(ev: WheelEvent) {
    ev.preventDefault();
    const p = clientToView(ev.clientX, ev.clientY);
    zoomTo(zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), p.x, p.y);
  }

  // Map raw client coords → viewBox units (used by pinch/wheel anchoring).
  function clientToView(clientX: number, clientY: number) {
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return { x: SIZE / 2, y: SIZE / 2 };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }

  function localPoint(ev: PointerEvent) {
    // Use the SVG's own screen transform so the mapping respects the viewBox AND
    // preserveAspectRatio — the element isn't square, so scaling x/y separately
    // would skew the radius and break lane hit-testing. Because zoom is just the
    // viewBox, this keeps working unchanged when zoomed.
    return clientToView(ev.clientX, ev.clientY);
  }

  // Begin/continue/end a two-finger pinch. Returns true while pinching so the
  // single-finger gesture handlers can bail out.
  function pinchDown(ev: PointerEvent): boolean {
    activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (activePointers.size === 2) {
      const [a, b] = [...activePointers.values()];
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
      // cancel any in-progress single-finger gesture
      create = null;
      edit = null;
      taperDragId = null;
      wingDrag = null;
      tapCandidateId = null;
      return true;
    }
    return false;
  }
  function pinchMove(ev: PointerEvent): boolean {
    if (!activePointers.has(ev.pointerId)) return pinching;
    activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && activePointers.size === 2) {
      const [a, b] = [...activePointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const anchor = clientToView(cx, cy);
      if (pinch.dist > 0) zoomTo(zoom * (dist / pinch.dist), anchor.x, anchor.y);
      pinch = { dist, cx, cy };
      return true;
    }
    return pinching;
  }
  function pinchUp(ev: PointerEvent) {
    activePointers.delete(ev.pointerId);
    if (activePointers.size < 2) pinch = null;
  }

  function onPointerDown(ev: PointerEvent) {
    const tapNow = Date.now();
    // Double-tap-to-reset must only consider SOLO taps: a second finger landing
    // arrives milliseconds after the first, and treating it as a "double tap"
    // reset the view on every pinch attempt — killing pinch-zoom entirely.
    if (activePointers.size === 0 && tapNow - lastTapTime < 280) {
      resetView();
      lastTapTime = 0;
      ev.preventDefault();
      return;
    }
    // A second finger also shouldn't SEED the double-tap timer, or the first
    // solo tap after a pinch would falsely read as its "second" tap.
    lastTapTime = activePointers.size === 0 ? tapNow : 0;

    // A second finger turns the gesture into a pinch-zoom; bail out of any
    // single-finger interaction.
    if (pinchDown(ev)) {
      svgEl.setPointerCapture(ev.pointerId);
      return;
    }
    if (pinching) return;

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

    // 2. Tapping a block/symptom: select it
    const symLane = LANES.find(l => l.id === 'symptom')!;
    const symHit = [...symptoms].reverse().find((s) => symptomContains(s, r, hours, symLane.rInner, symLane.rOuter));
    if (symHit) {
      selectedSymptomId = symHit.id;
      selectedId = null;
      svgEl.setPointerCapture(ev.pointerId);
      return;
    }
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
    // Two fingers down → pinch zoom/pan, never a single-finger gesture.
    if (pinching || activePointers.has(ev.pointerId)) {
      if (pinchMove(ev)) return;
    }

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

  function onPointerUp(ev: PointerEvent) {
    // Release any pinch-tracked finger. While still mid-pinch (one finger left),
    // don't fall through to commit a single-finger gesture.
    if (activePointers.has(ev.pointerId) || pinching) {
      const wasPinching = pinching;
      pinchUp(ev);
      if (wasPinching) return;
    }

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
  // Precise numeric time entry (real-usage need: gesture can't do "exactly 2
  // min"). Sets start + core-end in hours; the taper length rides along so the
  // fade is preserved, exactly like the resize gesture. Hard edges stay hard.
  function setSelectedTimes(startHours: number, coreEndHours: number) {
    const b = blocks.find((x) => x.id === selectedId);
    if (!b) return;
    const taper = b.taperEndHours - b.coreEndHours; // preserve fade length
    b.startHours = startHours;
    b.coreEndHours = Math.max(coreEndHours, startHours + 1 / 60); // ≥1 min long
    b.taperEndHours = b.coreEndHours + taper;
    blocks = blocks;
    persist();
  }
  function handleAddBlock(
    laneId: string,
    startHours: number,
    endHours: number,
    vibeId: string | null,
    isAppointmentBlock?: boolean,
    travelBeforeHours?: number,
    travelAfterHours?: number
  ) {
    const id = nextId++;
    const isApp = laneId === 'washer' || laneId === 'dryer';
    const coreLen = endHours - startHours;
    const newBlock: Block = {
      id,
      laneId,
      startHours,
      coreEndHours: endHours,
      taperEndHours: isApp ? endHours : endHours + Math.min(MAX_TAPER_HOURS, coreLen * DEFAULT_TAPER_FRAC),
      vibeId,
      done: false,
    };
    if (isAppointmentBlock && !isApp) {
      newBlock.kind = 'appointment';
      newBlock.travelBeforeHours = travelBeforeHours ?? DEFAULT_TRAVEL_HOURS;
      newBlock.travelAfterHours = travelAfterHours ?? DEFAULT_TRAVEL_HOURS;
      newBlock.taperEndHours = endHours;
    } else if ($appointmentMode && !isApp) {
      newBlock.kind = 'appointment';
      newBlock.travelBeforeHours = DEFAULT_TRAVEL_HOURS;
      newBlock.travelAfterHours = DEFAULT_TRAVEL_HOURS;
      newBlock.taperEndHours = endHours;
    }
    blocks = [...blocks, newBlock];
    selectedId = id;
    persist();
  }
  function setSelectedTravelTimes(beforeHours: number, afterHours: number) {
    const b = blocks.find((x) => x.id === selectedId);
    if (!b || b.kind !== 'appointment') return;
    b.travelBeforeHours = beforeHours;
    b.travelAfterHours = afterHours;
    blocks = blocks;
    persist();
  }
  function setSelectedVibe(vibeId: string | null) {
    const b = blocks.find((x) => x.id === selectedId);
    if (!b) return;
    b.vibeId = vibeId;
    blocks = blocks;
    persist();
  }
  function setSelectedRepeatId(repeatId: string | null) {
    const b = blocks.find((x) => x.id === selectedId);
    if (!b) return;
    if (repeatId) b.repeatId = repeatId;
    else delete b.repeatId;
    blocks = blocks;
    persist();
  }
  onMount(() => {
    blockActions.set({
      setLabel: setSelectedLabel,
      toggleDone: toggleSelectedDone,
      remove: removeSelected,
      setTimes: setSelectedTimes,
      setTravelTimes: setSelectedTravelTimes,
      setVibe: setSelectedVibe,
      setRepeatId: setSelectedRepeatId,
      deselect: () => (selectedId = null),
      addBlock: handleAddBlock,
    });
    symptomActions.set({
      addSymptom: (timeHours: number, severity: 1 | 2 | 3 | 4 | 5, category: SymptomCategory) => {
        const id = nextSymptomId++;
        symptoms = [...symptoms, { id, timeHours, severity, category }];
        selectedSymptomId = id;
        selectedId = null;
        persist();
      },
      updateSymptom: (severity: 1 | 2 | 3 | 4 | 5, category: SymptomCategory, timeHours: number, note?: string) => {
        const s = symptoms.find(x => x.id === selectedSymptomId);
        if (!s) return;
        s.severity = severity;
        s.category = category;
        s.timeHours = timeHours;
        s.note = note;
        symptoms = symptoms;
        persist();
      },
      remove: () => {
        symptoms = symptoms.filter(x => x.id !== selectedSymptomId);
        selectedSymptomId = null;
        persist();
      },
      deselect: () => (selectedSymptomId = null),
    });
  });
  onDestroy(() => {
    blockActions.set(null);
    symptomActions.set(null);
  });

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
  $: selectedSymptom = symptoms.find(s => s.id === selectedSymptomId) ?? null;
  $: selectedSymptomStore.set(selectedSymptom);
  const symLane = LANES.find(l => l.id === 'symptom')!;

  // The selected block's label — a floating header (§6), shown only when
  // selected. It floats OVER the ring (covering stuff is fine) with a subtle
  // backing pill for readability, and is CLAMPED to the canvas so blocks near 3
  // and 9 o'clock no longer run their text off the edge. A faint leader ties it
  // to the block.
  $: selectedLabel = computeSelectedLabel(selectedBlock);
  function computeSelectedLabel(b: Block | null) {
    if (!b || !b.label) return null;
    const lane = laneFor(b);
    const aMid = hoursToAngle((b.startHours + b.coreEndHours) / 2);
    // anchor on the block itself (lane mid-line)
    const rMid = (lane.rInner + lane.rOuter) / 2;
    const anchor = polar(C, C, rMid, aMid);
    // natural spot: just outside the block, floating over the rim
    const natural = polar(C, C, lane.rOuter + 12, aMid);

    const FONT = 10.5;
    const padX = 7;
    const charW = FONT * 0.58; // estimate (no DOM measure in SVG)
    const w = Math.min(SIZE - 12, b.label.length * charW + padX * 2);
    const h = FONT + 9;
    const margin = 5;
    // clamp the pill centre so it never leaves the canvas
    const cx = Math.max(margin + w / 2, Math.min(SIZE - margin - w / 2, natural.x));
    const cy = Math.max(margin + h / 2, Math.min(SIZE - margin - h / 2, natural.y));
    return { text: b.label, cx, cy, w, h, ax: anchor.x, ay: anchor.y, font: FONT };
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

<div class="stage">
  <svg
    bind:this={svgEl}
    {viewBox}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
    on:wheel={onWheel}
  >
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="moonGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
      <feFlood flood-color="var(--signal-glow, rgba(255,255,255,0.4))" result="color" />
      <feComposite in="color" in2="blur" operator="in" result="glow" />
      <feMerge>
        <feMergeNode in="glow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <radialGradient id="hubFade" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color={pal.hubFrom} />
      <stop offset="100%" stop-color={pal.hubTo} />
    </radialGradient>
    <!-- frosted-glass texture for the consumed "now" sweep (§14): fine
         turbulence speckle + a soft blur, so the day-so-far reads as a milky
         glass pane over the ring — a MATERIAL, not a deeper grey pigment. -->
    <filter id="frost" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
      <feColorMatrix in="noise" type="matrix"
        values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" result="speckle" />
      <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="soft" />
      <feMerge>
        <feMergeNode in="soft" />
        <feMergeNode in="speckle" />
      </feMerge>
      <feComposite in2="SourceGraphic" operator="in" />
    </filter>
  </defs>

  <!-- backdrop disc -->
  <circle cx={C} cy={C} r={RIM_RADIUS} fill={pal.ringDisc} stroke={pal.ringStroke} stroke-width="1" />

  <!-- CGM landscape (glucose-as-terrain): a faint luminous curve under the
       whole day. Hue stays reserved for vibes — only out-of-range excursions
       borrow the signal colour. -->
  {#each glucosePaths.areas as d}
    <path {d} fill="#ffffff" opacity="0.05" />
  {/each}
  {#each glucosePaths.lines as d}
    <path {d} fill="none" stroke="#ffffff" stroke-width="1.1" opacity="0.3" stroke-linejoin="round" />
  {/each}
  {#each glucosePaths.hot as d}
    <path {d} fill="none" stroke={pal.signal} stroke-width="1.6" opacity="0.75" stroke-linejoin="round" filter="url(#glow)" />
  {/each}

  <!-- consumed "now" sweep (§14): the day-so-far as a FROSTED-GLASS pane, not a
       deeper grey. A milky white veil + frost speckle = luminosity/material,
       never a hue or a heavier  <!-- now wedge -->
  {#if viewingToday}
    <path d={nowWedge} fill="#ffffff" opacity={$theme === 'force-light' ? 0.1 : 0.06} filter="url(#frost)" />
    <path d={nowWedge} fill="#ffffff" opacity={$theme === 'force-light' ? 0.03 : 0.02} />
  {/if}

  <!-- lane band outlines -->
  {#each LANES as lane}
    <circle cx={C} cy={C} r={lane.rOuter} fill="none" stroke={pal.laneOuter} stroke-width="1" />
    <circle cx={C} cy={C} r={lane.rInner} fill="none" stroke={pal.laneInner} stroke-width="1" />
  {/each}

  <!-- 15-min ticks + hour spokes -->
  {#each ticks as t}
    <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.isHour ? pal.tickHour : pal.tickMin} stroke-width={t.isHour ? 1 : 0.6} />
  {/each}

  <!-- symptoms -->
  {#each symptoms as s (s.id)}
    {@const a0 = hoursToAngle(s.timeHours - SYMPTOM_ARC_HOURS / 2)}
    {@const a1 = hoursToAngle(s.timeHours + SYMPTOM_ARC_HOURS / 2)}
    <path
      d={annularSector(C, C, symLane.rInner, symLane.rOuter, a0, a1)}
      fill={SYMPTOM_FILL}
      opacity={severityOpacity(s.severity)}
    />
    {#if s.id === selectedSymptomId}
      <path
        d={annularSector(C, C, symLane.rInner, symLane.rOuter, a0, a1)}
        fill="none"
        stroke={pal.signal}
        stroke-width="1.5"
      />
    {/if}
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
    <path d={corePath(b)} fill={blockFill(b)} opacity={b.done ? 0.4 : 1.0} />
    {#each taperSegments(b) as seg}
      <path d={seg.d} fill={blockFill(b)} opacity={b.done ? seg.opacity * 0.45 : seg.opacity} />
    {/each}
    {#if b.done}
      {@const tk = doneTick(b)}
      <line x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} stroke={pal.signal} stroke-width="1.5" opacity="0.8" filter="url(#glow)" />
    {/if}
  {/each}

  <!-- cascade halt flag: the hard-edged block a push ran into — pulsed outline,
       non-colour, says "I stopped here, didn't trample your deadline" (§9). -->
  {#if blockedBlock}
    <path d={corePath(blockedBlock)} fill="none" stroke={pal.signal} stroke-width="2" opacity="0.95" filter="url(#glow)" />
  {/if}

  <!-- selection: NON-colour signal only (§2) — a luminous outline + handles. -->
  {#if selectedBlock}
    <path d={corePath(selectedBlock)} fill="none" stroke={pal.signal} stroke-width="1.1" opacity="0.55" filter="url(#glow)" />
    {#if isAppointment(selectedBlock)}
      <!-- appointment: crisp deadline edges + draggable travel-wing handles (§8) -->
      {@const lane = laneFor(selectedBlock)}
      {@const aS = hoursToAngle(selectedBlock.startHours)}
      {@const aE = hoursToAngle(selectedBlock.coreEndHours)}
      {@const s1 = polar(C, C, lane.rInner, aS)}
      {@const s2 = polar(C, C, lane.rOuter, aS)}
      {@const e1 = polar(C, C, lane.rInner, aE)}
      {@const e2 = polar(C, C, lane.rOuter, aE)}
      <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke={pal.signal} stroke-width="1.6" opacity="0.85" />
      <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} stroke={pal.signal} stroke-width="1.6" opacity="0.85" />
      {@const bp = wingHandlePos(selectedBlock, 'before')}
      {@const ap = wingHandlePos(selectedBlock, 'after')}
      {#if bp}
        <circle cx={bp.x} cy={bp.y} r="5" fill={pal.signal} filter="url(#glow)" />
        <circle cx={bp.x} cy={bp.y} r="2.2" fill={pal.handleCore} />
      {/if}
      {#if ap}
        <circle cx={ap.x} cy={ap.y} r="5" fill={pal.signal} filter="url(#glow)" />
        <circle cx={ap.x} cy={ap.y} r="2.2" fill={pal.handleCore} />
      {/if}
    {:else}
      {@const h = handlePos(selectedBlock)}
      <circle cx={h.x} cy={h.y} r="5.5" fill={pal.signal} filter="url(#glow)" />
      <circle cx={h.x} cy={h.y} r="2.4" fill={pal.handleCore} />
      <!-- resize edge-handles: small luminous nubs at start + core end (§9) -->
      {@const sh = edgeHandle(selectedBlock, 'start')}
      {@const ch = edgeHandle(selectedBlock, 'core')}
      <circle cx={sh.x} cy={sh.y} r="3" fill={pal.handleCore} stroke={pal.signal} stroke-width="1.4" />
      {#if !isHardEdge(selectedBlock)}
        <circle cx={ch.x} cy={ch.y} r="3" fill={pal.handleCore} stroke={pal.signal} stroke-width="1.4" />
      {/if}
      {#if isHardEdge(selectedBlock)}
        {@const lane = laneFor(selectedBlock)}
        {@const a = hoursToAngle(selectedBlock.coreEndHours)}
        {@const p1 = polar(C, C, lane.rInner, a)}
        {@const p2 = polar(C, C, lane.rOuter, a)}
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={pal.signal} stroke-width="1.6" opacity="0.85" />
      {/if}
    {/if}
  {/if}

  <!-- selected block's text header (§6): floats over the ring on a backing
       pill, clamped to the canvas so it can't be cut off at the edges. -->
  {#if selectedLabel}
    <line
      x1={selectedLabel.ax}
      y1={selectedLabel.ay}
      x2={selectedLabel.cx}
      y2={selectedLabel.cy}
      stroke={pal.signal}
      stroke-width="0.8"
      opacity="0.3"
    />
    <rect
      x={selectedLabel.cx - selectedLabel.w / 2}
      y={selectedLabel.cy - selectedLabel.h / 2}
      width={selectedLabel.w}
      height={selectedLabel.h}
      rx={selectedLabel.h / 2}
      fill={pal.ringDisc}
      opacity="0.86"
      stroke={pal.ringStroke}
      stroke-width="0.75"
    />
    <text
      x={selectedLabel.cx}
      y={selectedLabel.cy}
      text-anchor="middle"
      dominant-baseline="central"
      font-size={selectedLabel.font}
      fill={pal.textPrimary}>{selectedLabel.text}</text
    >
  {/if}

  <!-- live drag preview -->
  {#if create && create.sweepDeg > 0}
    <path d={createPath} fill={$armedVibe ? $armedVibe.hex : pal.createGhost} opacity="0.6" filter="url(#glow)" />
  {/if}

  <!-- now tick: faint glowing radial line (non-colour signal, §14) -->
  {#if viewingToday}
    <line x1={nowTick.x1} y1={nowTick.y1} x2={nowTick.x2} y2={nowTick.y2} stroke={pal.signal} stroke-width="1.4" opacity="0.9" filter="url(#glow)" />
  {/if}

  <!-- hour labels: civilian 1–12 twice (§2) -->
  {#each hourLabels as l}
    <text x={l.x} y={l.y} text-anchor="middle" dominant-baseline="central" font-size="9" fill={l.marker ? pal.tickLabelMarker : pal.tickLabel} font-weight={l.marker ? 600 : 400}>{l.label}</text>
  {/each}

  <!-- hub: current date (top) + moon + env state -->
  <circle cx={C} cy={C} r={HUB_RADIUS} fill="url(#hubFade)" stroke={pal.hubStroke} stroke-width="1" />
  <text x={C} y={C - 15} text-anchor="middle" font-size="12" fill={pal.textPrimary} font-family="var(--font-display)" font-weight="600">{hubDate}</text>
  
  {#if moonPath}
    <g transform="translate({C},{C + 5})" filter="url(#moonGlow)">
      <path d={moonPath} fill="var(--moon-color, white)" opacity="0.7" />
    </g>
  {/if}
  
  {#if viewingToday}
    <text x={C} y={C + 28} text-anchor="middle" font-size="8" fill={pal.textDim} font-family="var(--font-primary)" letter-spacing="0.5">{$envLabel}</text>
  {:else}
    <text x={C} y={C + 28} text-anchor="middle" font-size="7" fill={pal.textDim} font-family="var(--font-primary)" letter-spacing="0.5">past day</text>
  {/if}

  <!-- live CGM reading: value + trend under the env label. Stale readings dim;
       out-of-range readings take the signal colour. -->
  {#if viewingToday && $currentGlucose}
    {@const stale = $currentGlucose.minutesOld > 15}
    <text
      x={C}
      y={C + 40}
      text-anchor="middle"
      font-size="9.5"
      font-family="var(--font-primary)"
      font-weight="600"
      fill={$currentGlucose.isHigh || $currentGlucose.isLow ? pal.signal : pal.textPrimary}
      opacity={stale ? 0.4 : 0.9}
    >{formatGlucose($currentGlucose.mgdl, $beamConfig.unit)} {TREND_ARROWS[$currentGlucose.trend] ?? ''}</text>
  {/if}
</svg>

</div>

<style>
  .stage {
    position: relative;
    width: min(100%, 64vh);
    aspect-ratio: 1 / 1;
    max-width: 100%;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  text {
    pointer-events: none;
  }
</style>

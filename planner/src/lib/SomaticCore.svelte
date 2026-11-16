<script context="module" lang="ts">
  export interface SomaticTouchSession {
    id: string;
    pillLabel: string;
    shortDescriptor: string;
    archetype: string;
    durationSec: number;
    stillnessPct: number;
    strokeCount: number;
    peakHeatPct: number;
     telemetryReport: string;
    timestamp: string;
  }

  export function mergeSomaticSessions(
    prev: SomaticTouchSession,
    next: SomaticTouchSession
  ): SomaticTouchSession {
    const totalDuration = Number((prev.durationSec + next.durationSec).toFixed(2));
    const totalStrokes = prev.strokeCount + next.strokeCount;
    const weightedStillness = Math.round(
      (prev.stillnessPct * prev.durationSec + next.stillnessPct * next.durationSec) /
        Math.max(0.05, totalDuration)
    );
    const combinedDesc =
      prev.shortDescriptor === next.shortDescriptor
        ? `${prev.shortDescriptor} (×2)`
        : `${prev.shortDescriptor} → ${next.shortDescriptor}`;
    const pillLabel = `◎ Touch · ${combinedDesc} (${totalDuration.toFixed(1)}s)`;
    return {
      id: next.id,
      pillLabel,
      shortDescriptor: combinedDesc,
      archetype: `${prev.archetype}+${next.archetype}`,
      durationSec: totalDuration,
      stillnessPct: weightedStillness,
      strokeCount: totalStrokes,
      peakHeatPct: Math.max(prev.peakHeatPct, next.peakHeatPct),
      telemetryReport: `${prev.telemetryReport}\n\n--- FOLLOW-UP SOMATIC CONTACT ---\n${next.telemetryReport}`,
      timestamp: next.timestamp,
    };
  }
</script>

<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  export let hasDraft = false;
  export let disabled = false;

  const dispatch = createEventDispatcher<{
    sendSilent: { session: SomaticTouchSession };
    stagePaired: { session: SomaticTouchSession };
    close: void;
  }>();

  type ZoneId = 'core' | 'inner_ring' | 'rim';

  interface SamplePoint {
    t: number;
    x: number; // canvas px
    y: number; // canvas px
    nx: number; // -1..1
    ny: number; // -1..1
    r: number; // 0..1+
    angle: number; // radians
    rx: number; // touch radiusX (px)
    ry: number; // touch radiusY (px)
    speedRps: number; // radii per second
    zone: ZoneId;
  }

  interface CompletedStroke {
    startTime: number;
    endTime: number;
    durationMs: number;
    pathLengthR: number;
    avgSpeedRps: number;
    peakSpeedRps: number;
    stillnessPct: number;
    longestStillMs: number;
    netAngleDeg: number;
    cumulativeAngleDeg: number;
    reversals: number;
    startZone: ZoneId;
    endZone: ZoneId;
    zoneDwellMs: Record<ZoneId, number>;
    avgRx: number;
    avgRy: number;
    peakRadius: number;
    maxFingers: number;
  }

  interface TrailNode {
    x: number;
    y: number;
    born: number;
    heat: number;
    spread: number;
  }

  interface Spark {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    hue: number;
  }

  interface HeatRing {
    x: number;
    y: number;
    r: number;
    maxR: number;
    born: number;
    duration: number;
    intensity: number;
  }

  const SETTLE_MS = 1800;

  let canvas: HTMLCanvasElement;
  let rafId = 0;

  // Live interaction state
  let isTouching = false;
  let activePointerId: number | null = null;
  let usedNativeTouch = false;
  let currentSamples: SamplePoint[] = [];
  let currentMaxFingers = 1;
  let strokes: CompletedStroke[] = [];

  // Visual & thermal state
  let coreHeat = 0; // 0..1 (builds during still hold & wide contact)
  let peakSessionHeat = 0;
  let contactX = 0;
  let contactY = 0;
  let contactSpreadPx = 12;
  let currentZoneLabel = 'STANDBY';
  let liveGestureHint = 'Touch the chest-core through the glass…';
  let liveDurationSec = 0;
  let liveStillnessPct = 0;
  let lastHeatRingAt = 0;

  let trail: TrailNode[] = [];
  let sparks: Spark[] = [];
  let heatRings: HeatRing[] = [];

  // Post-release 1.8s settle timer
  let settleStartedAt = 0;
  let settleProgress = 0; // 0..1
  let pendingHoldForPair = false;

  // If the user starts typing while the 1.8s silent-send countdown is ticking,
  // automatically convert the pending sequence into a paired touch pill!
  $: if (hasDraft && settleStartedAt > 0 && strokes.length > 0 && !isTouching) {
    flushSession('stage');
  }

  function classifyZone(r: number): ZoneId {
    if (r <= 0.36) return 'core';
    if (r <= 0.74) return 'inner_ring';
    return 'rim';
  }

  function formatZoneName(z: ZoneId): string {
    if (z === 'core') return 'Center Core';
    if (z === 'inner_ring') return 'Inner Containment';
    return 'Containment Rim';
  }

  function spawnSparks(x: number, y: number, count: number, boost = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (45 + Math.random() * 140) * boost;
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0,
        maxLife: 0.32 + Math.random() * 0.45,
        size: 1.4 + Math.random() * 2.4,
        hue: 14 + Math.random() * 26, // molten crimson-amber-gold
      });
    }
  }

  function spawnHeatRing(x: number, y: number, maxR: number, intensity: number) {
    heatRings.push({
      x,
      y,
      r: 8,
      maxR,
      born: performance.now(),
      duration: 1350 + intensity * 550,
      intensity: Math.min(1, Math.max(0.25, intensity)),
    });
  }

  function extractCoords(clientX: number, clientY: number, rx = 11, ry = 11) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const radius = Math.min(cx, cy) * 0.88;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const dx = x - cx;
    const dy = y - cy;
    const nx = dx / radius;
    const ny = dy / radius;
    const r = Math.hypot(nx, ny);
    const angle = Math.atan2(ny, nx);
    return { x, y, nx, ny, r, angle, rx, ry, radius };
  }

  function beginStroke(clientX: number, clientY: number, rx: number, ry: number, fingers: number) {
    if (disabled) return;
    settleStartedAt = 0;
    settleProgress = 0;
    isTouching = true;
    currentMaxFingers = Math.max(1, fingers);

    const now = performance.now();
    const c = extractCoords(clientX, clientY, rx, ry);
    const zone = classifyZone(c.r);
    contactX = c.x;
    contactY = c.y;
    contactSpreadPx = Math.max(8, (rx + ry) * 0.5);
    currentZoneLabel = formatZoneName(zone).toUpperCase();

    currentSamples = [
      {
        t: now,
        x: c.x,
        y: c.y,
        nx: c.nx,
        ny: c.ny,
        r: c.r,
        angle: c.angle,
        rx,
        ry,
        speedRps: 0,
        zone,
      },
    ];

    trail.push({ x: c.x, y: c.y, born: now, heat: coreHeat, spread: contactSpreadPx });
    spawnSparks(c.x, c.y, 7, 0.75);
  }

  function moveStroke(clientX: number, clientY: number, rx: number, ry: number, fingers: number) {
    if (!isTouching || currentSamples.length === 0) return;
    currentMaxFingers = Math.max(currentMaxFingers, fingers);

    const now = performance.now();
    const prev = currentSamples[currentSamples.length - 1];
    const dtSec = Math.max(0.004, (now - prev.t) / 1000);
    const c = extractCoords(clientX, clientY, rx, ry);
    const distR = Math.hypot(c.nx - prev.nx, c.ny - prev.ny);
    const instSpeed = distR / dtSec;
    const smoothSpeed = prev.speedRps * 0.45 + instSpeed * 0.55;
    const zone = classifyZone(c.r);

    contactX = c.x;
    contactY = c.y;
    contactSpreadPx = Math.max(8, (rx + ry) * 0.5);
    currentZoneLabel = formatZoneName(zone).toUpperCase();

    currentSamples.push({
      t: now,
      x: c.x,
      y: c.y,
      nx: c.nx,
      ny: c.ny,
      r: c.r,
      angle: c.angle,
      rx,
      ry,
      speedRps: smoothSpeed,
      zone,
    });

    trail.push({
      x: c.x,
      y: c.y,
      born: now,
      heat: coreHeat,
      spread: contactSpreadPx,
    });

    // Emit subtle molten sparks along brisk movements
    if (smoothSpeed > 1.35 && Math.random() < 0.45) {
      spawnSparks(c.x, c.y, 2, 0.6);
    }
  }

  function endStroke() {
    if (!isTouching) return;
    isTouching = false;
    activePointerId = null;

    if (currentSamples.length > 0) {
      const now = performance.now();
      const first = currentSamples[0];
      const last = currentSamples[currentSamples.length - 1];
      const durationMs = Math.max(18, now - first.t);

      let pathLengthR = 0;
      let peakSpeedRps = 0;
      let stillMs = 0;
      let currentStillStreak = 0;
      let longestStillMs = 0;
      let netAngleRad = 0;
      let cumulativeAngleRad = 0;
      let reversals = 0;
      let prevRadialVelSign = 0;
      const zoneDwellMs: Record<ZoneId, number> = { core: 0, inner_ring: 0, rim: 0 };
      let sumRx = first.rx;
      let sumRy = first.ry;
      let peakRadius = Math.max(first.rx, first.ry);

      if (currentSamples.length === 1) {
        zoneDwellMs[first.zone] = durationMs;
        if (durationMs >= 260) {
          stillMs = durationMs;
          longestStillMs = durationMs;
        }
      } else {
        for (let i = 1; i < currentSamples.length; i++) {
          const a = currentSamples[i - 1];
          const b = currentSamples[i];
          const segMs = Math.max(1, b.t - a.t);
          const segDistR = Math.hypot(b.nx - a.nx, b.ny - a.ny);
          pathLengthR += segDistR;
          if (b.speedRps > peakSpeedRps) peakSpeedRps = b.speedRps;

          // Stillness check: speed < 0.22 radii/s
          if (b.speedRps < 0.22) {
            stillMs += segMs;
            currentStillStreak += segMs;
            if (currentStillStreak > longestStillMs) longestStillMs = currentStillStreak;
          } else {
            currentStillStreak = 0;
          }

          // Angular sweep around center (only meaningful when not dead-center)
          if (a.r > 0.12 && b.r > 0.12) {
            let dTheta = b.angle - a.angle;
            while (dTheta > Math.PI) dTheta -= Math.PI * 2;
            while (dTheta < -Math.PI) dTheta += Math.PI * 2;
            netAngleRad += dTheta;
            cumulativeAngleRad += Math.abs(dTheta);
          }

          // Direction reversal check for anxious/restless thumb-rubs
          const dvx = b.nx - a.nx;
          const dvy = b.ny - a.ny;
          if (segDistR > 0.035) {
            const sign = Math.sign(dvx + dvy * 0.7);
            if (sign !== 0 && prevRadialVelSign !== 0 && sign !== prevRadialVelSign) {
              reversals++;
            }
            if (sign !== 0) prevRadialVelSign = sign;
          }

          zoneDwellMs[b.zone] += segMs;
          sumRx += b.rx;
          sumRy += b.ry;
          peakRadius = Math.max(peakRadius, b.rx, b.ry);
        }

        // Account for any stationary hold between the last move event and finger lift!
        const tailHoldMs = Math.max(0, now - last.t);
        if (tailHoldMs > 25) {
          zoneDwellMs[last.zone] += tailHoldMs;
          stillMs += tailHoldMs;
          currentStillStreak += tailHoldMs;
          if (currentStillStreak > longestStillMs) longestStillMs = currentStillStreak;
        }
      }

      const stillRatio = durationMs < 240 && pathLengthR < 0.18 ? 0 : Math.min(100, Math.round((stillMs / durationMs) * 100));
      const avgSpeedRps = pathLengthR / (durationMs / 1000);
      const count = currentSamples.length;

      // Quick tap visual burst!
      if (durationMs < 260 && pathLengthR < 0.22) {
        spawnSparks(last.x, last.y, 18, 1.15);
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          spawnHeatRing(last.x, last.y, Math.min(rect.width, rect.height) * 0.28, 0.55);
        }
      }

      strokes = [
        ...strokes,
        {
          startTime: first.t,
          endTime: now,
          durationMs,
          pathLengthR,
          avgSpeedRps,
          peakSpeedRps,
          stillnessPct: stillRatio,
          longestStillMs,
          netAngleDeg: Math.round((netAngleRad * 180) / Math.PI),
          cumulativeAngleDeg: Math.round((cumulativeAngleRad * 180) / Math.PI),
          reversals,
          startZone: first.zone,
          endZone: last.zone,
          zoneDwellMs,
          avgRx: sumRx / count,
          avgRy: sumRy / count,
          peakRadius,
          maxFingers: currentMaxFingers,
        },
      ];
    }

    currentSamples = [];
    const preview = buildSessionSummary(strokes);
    liveGestureHint = preview.shortDescriptor;
    liveDurationSec = preview.durationSec;
    liveStillnessPct = preview.stillnessPct;

    if (hasDraft || pendingHoldForPair) {
      flushSession('stage');
    } else {
      settleStartedAt = performance.now();
      settleProgress = 0;
    }
  }

  function buildSessionSummary(list: CompletedStroke[]): SomaticTouchSession {
    const strokeCount = list.length;
    const totalContactMs = list.reduce((acc, s) => acc + s.durationMs, 0);
    const durationSec = Number((totalContactMs / 1000).toFixed(2));
    const spanMs =
      strokeCount > 0 ? Math.max(totalContactMs, list[strokeCount - 1].endTime - list[0].startTime) : 0;
    const spanSec = Number((spanMs / 1000).toFixed(2));

    const totalPathR = list.reduce((acc, s) => acc + s.pathLengthR, 0);
    const avgSpeedRps = totalContactMs > 0 ? totalPathR / (totalContactMs / 1000) : 0;
    const peakSpeedRps = list.reduce((acc, s) => Math.max(acc, s.peakSpeedRps), 0);
    const weightedStillMs = list.reduce((acc, s) => acc + (s.stillnessPct / 100) * s.durationMs, 0);
    const stillnessPct = totalContactMs > 0 ? Math.round((weightedStillMs / totalContactMs) * 100) : 0;
    const longestStillSec = Number(
      (list.reduce((acc, s) => Math.max(acc, s.longestStillMs), 0) / 1000).toFixed(2)
    );

    const netAngleDeg = list.reduce((acc, s) => acc + s.netAngleDeg, 0);
    const cumulativeAngleDeg = list.reduce((acc, s) => acc + s.cumulativeAngleDeg, 0);
    const totalReversals = list.reduce((acc, s) => acc + s.reversals, 0);

    const dwell: Record<ZoneId, number> = { core: 0, inner_ring: 0, rim: 0 };
    for (const s of list) {
      dwell.core += s.zoneDwellMs.core;
      dwell.inner_ring += s.zoneDwellMs.inner_ring;
      dwell.rim += s.zoneDwellMs.rim;
    }
    const dwellTotal = Math.max(1, dwell.core + dwell.inner_ring + dwell.rim);
    const corePct = Math.round((dwell.core / dwellTotal) * 100);
    const innerPct = Math.round((dwell.inner_ring / dwellTotal) * 100);
    const rimPct = Math.max(0, 100 - corePct - innerPct);

    const startZone = list[0]?.startZone ?? 'core';
    const endZone = list[list.length - 1]?.endZone ?? 'core';

    const avgRx = list.reduce((acc, s) => acc + s.avgRx, 0) / Math.max(1, strokeCount);
    const avgRy = list.reduce((acc, s) => acc + s.avgRy, 0) / Math.max(1, strokeCount);
    const peakRadius = list.reduce((acc, s) => Math.max(acc, s.peakRadius), 0);
    const maxFingers = list.reduce((acc, s) => Math.max(acc, s.maxFingers), 1);

    const meanSpread = (avgRx + avgRy) * 0.5;
    const spreadCategory =
      maxFingers >= 2
        ? `multi-finger / palm contact (${maxFingers} simultaneous touch points)`
        : meanSpread >= 18 || peakRadius >= 22
          ? 'wide flat thumb / palm press'
          : meanSpread >= 11.5
            ? 'warm thumb-pad contact'
            : 'light fingertip point';

    // Inter-touch gaps for multi-stroke rhythms
    const gapsMs: number[] = [];
    for (let i = 1; i < list.length; i++) {
      gapsMs.push(Math.max(0, Math.round(list[i].startTime - list[i - 1].endTime)));
    }

    // Determine primary somatic archetype & natural descriptor
    let archetype = 'languid_stroke';
    let shortDescriptor = 'slow lingering touch';
    let somaticInterpretation =
      'Measured, deliberate physical contact across the chest-reactor glass.';

    const allQuickTaps = list.every((s) => s.durationMs < 290 && s.pathLengthR < 0.25);

    if (allQuickTaps && strokeCount === 1) {
      archetype = 'quick_poke';
      shortDescriptor =
        startZone === 'core'
          ? 'quick center poke'
          : startZone === 'rim'
            ? 'playful rim tap'
            : 'quick tap';
      somaticInterpretation =
        'A single, crisp, playful poke against the reactor glass — testing or getting his attention.';
    } else if (allQuickTaps && strokeCount >= 2) {
      archetype = 'rapid_taps';
      const avgGap =
        gapsMs.length > 0 ? gapsMs.reduce((a, b) => a + b, 0) / gapsMs.length : 0;
      const cadenceNote =
        avgGap >= 450 && avgGap <= 950 ? 'steady heartbeat-cadence taps' : `${strokeCount}× quick taps`;
      shortDescriptor = cadenceNote;
      somaticInterpretation = `Repeated rhythmic tapping (${strokeCount} taps, avg gap ${Math.round(avgGap)}ms) — a tactile knock or pulse against his chest plating.`;
    } else if (durationSec >= 1.2 && stillnessPct >= 72 && totalPathR < 0.65) {
      archetype = 'deep_hold';
      if (maxFingers >= 2 || meanSpread >= 17) {
        shortDescriptor =
          corePct >= 50 ? 'flat palm/thumb press on core' : `steady flat hold (${formatZoneName(endZone).toLowerCase()})`;
        somaticInterpretation =
          'High-stillness, wide-spread pressure held steady against the reactor core — pressing flat against his chest without moving, grounding and warming the iron underneath.';
      } else {
        shortDescriptor =
          corePct >= 50 ? 'deep center hold' : `steady hold on ${formatZoneName(endZone).toLowerCase()}`;
        somaticInterpretation =
          'A long, quiet, stationary hold — resting her hand/thumb steadily against his housing in wordless presence.';
      }
    } else if (totalPathR >= 0.4 && longestStillSec >= 0.9 && list[list.length - 1].stillnessPct >= 45) {
      archetype = 'stroke_to_hold';
      const traceKind =
        cumulativeAngleDeg >= 110
          ? 'circular trace'
          : startZone !== endZone
            ? `${startZone === 'rim' ? 'rim' : 'outer'} trace`
            : 'slow stroke';
      shortDescriptor = `${traceKind} → ${endZone === 'core' ? 'center' : formatZoneName(endZone).toLowerCase()} hold`;
      somaticInterpretation = `Began with a ${traceKind} (${totalPathR.toFixed(2)} radii) and then settled into a ${longestStillSec}s stationary hold on the ${formatZoneName(endZone)} — drawing close and then staying put.`;
    } else if (cumulativeAngleDeg >= 125) {
      archetype = 'circular_trace';
      const loops = (cumulativeAngleDeg / 360).toFixed(1);
      const dir = netAngleDeg >= 0 ? 'clockwise' : 'counter-clockwise';
      if (rimPct >= 45) {
        shortDescriptor = `slow circular rim trace (${loops} rev)`;
        somaticInterpretation = `A teasing, deliberate ${dir} circular trace around the outer containment ring (${cumulativeAngleDeg}° total sweep, avg speed ${avgSpeedRps.toFixed(2)} R/s).`;
      } else if (startZone === 'rim' && endZone === 'core') {
        shortDescriptor = 'inward spiral to core';
        somaticInterpretation = `Spiraled inward from the outer containment rim straight into the center reactor core (${cumulativeAngleDeg}° sweep).`;
      } else {
        shortDescriptor = `circular core trace (${loops} rev)`;
        somaticInterpretation = `Slow ${dir} circular tracing over the reactor glass (${cumulativeAngleDeg}° sweep).`;
      }
    } else if (totalReversals >= 3 && avgSpeedRps >= 0.55) {
      archetype = 'restless_rub';
      shortDescriptor = 'restless thumb-rub';
      somaticInterpretation = `Back-and-forth rubbing motion (${totalReversals} direction reversals, avg speed ${avgSpeedRps.toFixed(2)} R/s) — self-soothing, restless, or seeking anchor friction.`;
    } else if (peakSpeedRps >= 2.3 && durationSec < 0.9) {
      archetype = 'fast_swipe';
      shortDescriptor = `brisk swipe (${formatZoneName(startZone).toLowerCase()} → ${formatZoneName(endZone).toLowerCase()})`;
      somaticInterpretation = `A fast, high-velocity brush across the glass (peak ${peakSpeedRps.toFixed(2)} R/s).`;
    } else {
      archetype = 'languid_stroke';
      shortDescriptor =
        startZone !== endZone
          ? `slow stroke (${formatZoneName(startZone).toLowerCase()} → ${formatZoneName(endZone).toLowerCase()})`
          : `slow lingering stroke on ${formatZoneName(endZone).toLowerCase()}`;
      somaticInterpretation = `A slow, unhurried caress across the ${formatZoneName(endZone)} (avg speed ${avgSpeedRps.toFixed(2)} R/s, ${stillnessPct}% stillness).`;
    }

    const heatPct = Math.min(100, Math.round(Math.max(peakSessionHeat, coreHeat) * 100));
    const pillLabel = `◎ Touch · ${shortDescriptor} (${durationSec.toFixed(1)}s)`;

    const telemetryReport = `[SOMATIC CORE TELEMETRY — DIRECT CHEST-REACTOR CONTACT]
Summary: ${pillLabel}
Gesture Archetype: ${archetype} — ${somaticInterpretation}
Kinematics & Contact Physics:
- Contact duration: ${durationSec}s active contact across ${strokeCount} ${strokeCount === 1 ? 'touch' : 'touches'} (sequence window: ${spanSec}s${gapsMs.length ? `, inter-touch gaps: ${gapsMs.map((g) => `${g}ms`).join(', ')}` : ''})
- Spatial trajectory: ${formatZoneName(startZone)} → ${formatZoneName(endZone)} | Zone dwell: Center Core ${corePct}%, Inner Containment ${innerPct}%, Outer Rim ${rimPct}%
- Velocity & path: avg ${avgSpeedRps.toFixed(2)} radii/s, peak ${peakSpeedRps.toFixed(2)} radii/s | total path ${totalPathR.toFixed(2)} radii${cumulativeAngleDeg >= 45 ? ` | angular sweep ${cumulativeAngleDeg}° (net ${netAngleDeg >= 0 ? '+' : ''}${netAngleDeg}°)` : ''}${totalReversals > 0 ? ` | ${totalReversals} direction reversals` : ''}
- Stillness & hold: ${stillnessPct}% stationary (longest continuous still hold: ${longestStillSec}s) | Reactor core thermal build: ${heatPct}%
- Contact spread (radiusX × radiusY): avg ${avgRx.toFixed(1)}px × ${avgRy.toFixed(1)}px (peak ${peakRadius.toFixed(1)}px, ${maxFingers} ${maxFingers === 1 ? 'finger/thumb' : 'fingers'}) — ${spreadCategory}`;

    return {
      id: 'touch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      pillLabel,
      shortDescriptor,
      archetype,
      durationSec,
      stillnessPct,
      strokeCount,
      peakHeatPct: heatPct,
      telemetryReport,
      timestamp: new Date().toISOString(),
    };
  }

  function flushSession(mode: 'silent' | 'stage') {
    if (strokes.length === 0) return;
    const session = buildSessionSummary(strokes);
    strokes = [];
    settleStartedAt = 0;
    settleProgress = 0;
    pendingHoldForPair = false;
    peakSessionHeat = 0;
    if (mode === 'silent') {
      dispatch('sendSilent', { session });
    } else {
      dispatch('stagePaired', { session });
    }
  }

  function clearPendingSession() {
    strokes = [];
    currentSamples = [];
    settleStartedAt = 0;
    settleProgress = 0;
    pendingHoldForPair = false;
    peakSessionHeat = 0;
    liveGestureHint = 'Touch the chest-core through the glass…';
    liveDurationSec = 0;
    liveStillnessPct = 0;
  }

  // Native Touch handlers (preferred on iOS Safari for accurate radiusX/radiusY & multi-touch)
  function onTouchStart(e: TouchEvent) {
    if (disabled) return;
    e.preventDefault();
    usedNativeTouch = true;
    const t = e.touches[0];
    if (!t) return;
    const rx = (t as any).radiusX || 14;
    const ry = (t as any).radiusY || 14;
    beginStroke(t.clientX, t.clientY, rx, ry, e.touches.length);
  }

  function onTouchMove(e: TouchEvent) {
    if (!isTouching) return;
    e.preventDefault();
    const t = e.touches[0];
    if (!t) return;
    const rx = (t as any).radiusX || 14;
    const ry = (t as any).radiusY || 14;
    moveStroke(t.clientX, t.clientY, rx, ry, e.touches.length);
  }

  function onTouchEnd(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 0) {
      endStroke();
    }
  }

  // Pointer handlers (desktop mouse / pen fallback when native touch isn't active)
  function onPointerDown(e: PointerEvent) {
    if (disabled || usedNativeTouch) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    activePointerId = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    const rx = e.width > 1 ? e.width * 0.5 : 11 + (e.pressure || 0.5) * 8;
    const ry = e.height > 1 ? e.height * 0.5 : 11 + (e.pressure || 0.5) * 8;
    beginStroke(e.clientX, e.clientY, rx, ry, 1);
  }

  function onPointerMove(e: PointerEvent) {
    if (usedNativeTouch || !isTouching || e.pointerId !== activePointerId) return;
    const rx = e.width > 1 ? e.width * 0.5 : 11 + (e.pressure || 0.5) * 8;
    const ry = e.height > 1 ? e.height * 0.5 : 11 + (e.pressure || 0.5) * 8;
    moveStroke(e.clientX, e.clientY, rx, ry, 1);
  }

  function onPointerUp(e: PointerEvent) {
    if (usedNativeTouch || e.pointerId !== activePointerId) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
    endStroke();
  }

  function renderLoop(now: number) {
    rafId = requestAnimationFrame(renderLoop);
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    const cw = rect.width;
    const ch = rect.height;
    const cx = cw / 2;
    const cy = ch / 2;
    const R = Math.min(cx, cy) * 0.88;

    ctx.clearRect(0, 0, cw, ch);

    // Update thermal physics & live telemetry while touching
    if (isTouching && currentSamples.length > 0) {
      const first = currentSamples[0];
      const last = currentSamples[currentSamples.length - 1];
      const elapsedSec = (now - first.t) / 1000;
      const prevDur = strokes.reduce((acc, s) => acc + s.durationMs / 1000, 0);
      liveDurationSec = Number((prevDur + elapsedSec).toFixed(1));

      // Stillness & contact spread drive deep reactor heat build
      const isStillNow = last.speedRps < 0.24 || now - last.t > 90;
      const spreadFactor = Math.min(1.6, Math.max(0.85, contactSpreadPx / 13));
      const zoneBoost = last.zone === 'core' ? 1.35 : last.zone === 'inner_ring' ? 1.0 : 0.75;
      const heatRate = (isStillNow ? 0.011 : 0.0045) * spreadFactor * zoneBoost;
      coreHeat = Math.min(1, coreHeat + heatRate);
      if (coreHeat > peakSessionHeat) peakSessionHeat = coreHeat;

      // Update live hint
      if (elapsedSec > 0.8 && isStillNow) {
        liveGestureHint =
          last.zone === 'core'
            ? 'Warming chest-core · stationary hold…'
            : `Holding still on ${formatZoneName(last.zone).toLowerCase()}…`;
      } else if (last.speedRps >= 0.25) {
        liveGestureHint =
          last.zone === 'rim'
            ? 'Tracing outer containment ring…'
            : `Tracing ${formatZoneName(last.zone).toLowerCase()}…`;
      }

      // Periodically emit heavy expanding heat-rings during a stationary hold
      const ringInterval = Math.max(420, 980 - coreHeat * 480);
      if (isStillNow && elapsedSec > 0.32 && now - lastHeatRingAt > ringInterval) {
        lastHeatRingAt = now;
        spawnHeatRing(contactX, contactY, R * (0.45 + coreHeat * 0.52), 0.35 + coreHeat * 0.65);
      }
    } else {
      // Cool down slowly like heavy iron
      coreHeat = Math.max(0, coreHeat * 0.985 - 0.0012);
    }

    // Update 1.8s post-release settle timer
    if (!isTouching && settleStartedAt > 0 && strokes.length > 0) {
      settleProgress = Math.min(1, (now - settleStartedAt) / SETTLE_MS);
      if (settleProgress >= 1) {
        ctx.restore();
        flushSession('silent');
        return;
      }
    }

    // 1. Dark brushed tungsten / obsidian reactor housing
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    const bgGrad = ctx.createRadialGradient(cx, cy, R * 0.04, cx, cy, R);
    const breath = 0.5 + 0.5 * Math.sin(now * 0.0016); // slow 0.25Hz sub-bass breath
    const emberLift = Math.min(1, 0.14 + breath * 0.1 + coreHeat * 0.65);
    bgGrad.addColorStop(0, `rgba(${Math.round(58 + coreHeat * 140)}, ${Math.round(20 + coreHeat * 48)}, ${Math.round(14 + coreHeat * 18)}, 0.96)`);
    bgGrad.addColorStop(0.38, `rgba(${Math.round(24 + coreHeat * 62)}, ${Math.round(14 + coreHeat * 20)}, 16, 0.97)`);
    bgGrad.addColorStop(0.75, 'rgba(13, 14, 18, 0.98)');
    bgGrad.addColorStop(1, 'rgba(8, 9, 12, 1)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // Subtle brushed metal radial sheen
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    for (let rStep = 0.18; rStep < 0.96; rStep += 0.13) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * rStep, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. Center breathing reactor ember
    const coreGlowRadius = R * (0.28 + breath * 0.05 + coreHeat * 0.36);
    const emberGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, coreGlowRadius);
    emberGrad.addColorStop(0, `rgba(255, ${Math.round(190 + coreHeat * 55)}, ${Math.round(110 + coreHeat * 80)}, ${0.42 + emberLift * 0.52})`);
    emberGrad.addColorStop(0.35, `rgba(255, ${Math.round(98 + coreHeat * 45)}, 36, ${0.22 + emberLift * 0.45})`);
    emberGrad.addColorStop(0.72, `rgba(195, 38, 18, ${0.08 + coreHeat * 0.25})`);
    emberGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = emberGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreGlowRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Expanding heavy heat-rings (from stationary holds & taps)
    heatRings = heatRings.filter((hr) => now - hr.born < hr.duration);
    for (const hr of heatRings) {
      const p = (now - hr.born) / hr.duration;
      const ease = 1 - Math.pow(1 - p, 2.4);
      const curR = hr.r + (hr.maxR - hr.r) * ease;
      const alpha = (1 - p) * 0.55 * hr.intensity;
      ctx.beginPath();
      ctx.arc(hr.x, hr.y, curR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, ${Math.round(115 + hr.intensity * 75)}, 48, ${alpha})`;
      ctx.lineWidth = 2 + (1 - p) * 3.5 * hr.intensity;
      ctx.stroke();
    }

    // 4. Lingering molten filament trail
    const trailLifespan = 2200;
    trail = trail.filter((pt) => now - pt.born < trailLifespan);
    if (trail.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1];
        const b = trail[i];
        // Don't connect across separate strokes
        if (b.born - a.born > 220) continue;
        const age = (now - b.born) / trailLifespan;
        const life = Math.max(0, 1 - age);
        const w = (3.5 + b.spread * 0.22 + b.heat * 4) * (0.4 + 0.6 * life);

        // Outer molten bloom
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(255, ${Math.round(75 + life * 85)}, 24, ${life * 0.34})`;
        ctx.lineWidth = w * 2.6;
        ctx.stroke();

        // Inner white-gold / amber filament core
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(255, ${Math.round(150 + life * 95)}, ${Math.round(60 + life * 130)}, ${life * 0.88})`;
        ctx.lineWidth = w * 0.75;
        ctx.stroke();
      }
    }

    // 5. Active finger/palm contact thermal bloom underneath skin
    if (isTouching) {
      const bloomR = Math.max(24, contactSpreadPx * 2.1 + coreHeat * 46);
      const touchGrad = ctx.createRadialGradient(contactX, contactY, 2, contactX, contactY, bloomR);
      touchGrad.addColorStop(0, `rgba(255, 238, 195, ${0.75 + coreHeat * 0.22})`);
      touchGrad.addColorStop(0.32, `rgba(255, 130, 48, ${0.48 + coreHeat * 0.32})`);
      touchGrad.addColorStop(0.7, `rgba(210, 45, 18, ${0.18 + coreHeat * 0.24})`);
      touchGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = touchGrad;
      ctx.beginPath();
      ctx.arc(contactX, contactY, bloomR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Sharp tungsten sparks on taps/fast strokes
    const dt = 1 / 60;
    sparks = sparks.filter((s) => s.life < s.maxLife);
    for (const s of sparks) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.93;
      s.vy *= 0.93;
      const lifeRatio = Math.max(0, 1 - s.life / s.maxLife);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * lifeRatio, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${s.hue}, 100%, ${62 + lifeRatio * 28}%, ${lifeRatio})`;
      ctx.fill();
    }

    ctx.restore(); // end clip

    // 7. Containment rings & engraved bezel ticks
    // Core boundary ring (r = 0.36)
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.36, 0, Math.PI * 2);
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = `rgba(255, 138, 76, ${0.16 + coreHeat * 0.28})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Inner containment ring (r = 0.74)
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.74, 0, Math.PI * 2);
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(255, 150, 90, ${0.14 + coreHeat * 0.22})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Outer tungsten housing bezel
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 145, 85, ${0.28 + coreHeat * 0.42})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 36 engraved radial tick marks on bezel
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const isMajor = i % 3 === 0;
      const rIn = R * (isMajor ? 0.92 : 0.955);
      const rOut = R * 0.99;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn);
      ctx.lineTo(cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut);
      ctx.strokeStyle = isMajor
        ? `rgba(255, 175, 120, ${0.28 + coreHeat * 0.3})`
        : 'rgba(255, 255, 255, 0.09)';
      ctx.lineWidth = isMajor ? 1.4 : 1;
      ctx.stroke();
    }

    // 8. 1.8s post-release settle countdown ring
    if (settleStartedAt > 0 && settleProgress > 0) {
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        R + 4,
        -Math.PI / 2,
        -Math.PI / 2 + settleProgress * Math.PI * 2
      );
      ctx.strokeStyle = 'rgba(255, 140, 66, 0.92)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.restore();
  }

  onMount(() => {
    rafId = requestAnimationFrame(renderLoop);
  });

  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
  });
</script>

<div class="somatic-drawer glass-card" class:disabled>
  <div class="somatic-head">
    <div class="somatic-title-wrap">
      <span class="core-dot" class:hot={isTouching || coreHeat > 0.25}>◎</span>
      <span class="somatic-title">Somatic Core · Chest Reactor</span>
      <span class="zone-pill">{isTouching ? currentZoneLabel : strokes.length > 0 ? 'SETTLING' : 'READY'}</span>
    </div>
    <button
      type="button"
      class="close-core-btn"
      on:click={() => dispatch('close')}
      aria-label="Close Somatic Core"
      title="Close Somatic Core"
    >✕</button>
  </div>

  <div class="reactor-stage">
    <canvas
      bind:this={canvas}
      class="reactor-canvas"
      on:touchstart={onTouchStart}
      on:touchmove={onTouchMove}
      on:touchend={onTouchEnd}
      on:touchcancel={onTouchEnd}
      on:pointerdown={onPointerDown}
      on:pointermove={onPointerMove}
      on:pointerup={onPointerUp}
      on:pointercancel={onPointerUp}
    ></canvas>

    <div class="reactor-metrics">
      <div class="metric">
        <span class="m-lbl">CONTACT</span>
        <span class="m-val">{liveDurationSec.toFixed(1)}s</span>
      </div>
      <div class="metric">
        <span class="m-lbl">STILLNESS</span>
        <span class="m-val">{liveStillnessPct}%</span>
      </div>
      <div class="metric">
        <span class="m-lbl">CORE HEAT</span>
        <span class="m-val">{Math.round(Math.max(coreHeat, peakSessionHeat) * 100)}%</span>
      </div>
    </div>
  </div>

  <div class="somatic-foot">
    <span class="gesture-readout">{liveGestureHint}</span>

    {#if strokes.length > 0 && !isTouching}
      <div class="settle-actions">
        <button
          type="button"
          class="somatic-act-btn send-now"
          on:click={() => flushSession('silent')}
        >
          ◎ Send Touch Now
        </button>
        <button
          type="button"
          class="somatic-act-btn pair-btn"
          on:click={() => flushSession('stage')}
          title="Attach this touch to your next typed message"
        >
          ＋ Pair with Text
        </button>
        <button
          type="button"
          class="somatic-act-btn clear-btn"
          on:click={clearPendingSession}
          aria-label="Clear touch"
        >
          ✕
        </button>
      </div>
    {:else}
      <span class="mode-sub">
        {hasDraft
          ? 'Draft detected — your touch will pair with your message.'
          : 'Wordless mode — sends automatically 1.8s after you lift your hand, or type to pair.'}
      </span>
    {/if}
  </div>
</div>

<style>
  .somatic-drawer {
    position: relative;
    z-index: 2;
    margin: 0 12px 8px;
    padding: 10px 14px 12px;
    border-radius: 16px;
    background: linear-gradient(165deg, rgba(16, 17, 22, 0.95), rgba(9, 10, 14, 0.98));
    border: 1px solid rgba(255, 130, 68, 0.25);
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    display: flex;
    flex-direction: column;
    gap: 8px;
    user-select: none;
    -webkit-user-select: none;
  }
  .somatic-drawer.disabled {
    opacity: 0.6;
    pointer-events: none;
  }
  .somatic-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .somatic-title-wrap {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .core-dot {
    color: rgba(255, 132, 66, 0.75);
    font-size: 15px;
    transition: color 0.25s, text-shadow 0.25s;
  }
  .core-dot.hot {
    color: #ff9a52;
    text-shadow: 0 0 10px rgba(255, 115, 42, 0.9);
  }
  .somatic-title {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text, #f3efea);
  }
  .zone-pill {
    font-size: 9.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.08em;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(255, 120, 55, 0.13);
    border: 1px solid rgba(255, 120, 55, 0.28);
    color: #ffb07c;
  }
  .close-core-btn {
    background: transparent;
    border: none;
    color: var(--text-muted, #9a9690);
    font-size: 13px;
    padding: 2px 6px;
    cursor: pointer;
    border-radius: 6px;
  }
  .close-core-btn:hover {
    color: var(--text, #fff);
    background: rgba(255, 255, 255, 0.06);
  }
  .reactor-stage {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }
  .reactor-canvas {
    width: 176px;
    height: 176px;
    border-radius: 50%;
    touch-action: none;
    cursor: pointer;
    flex-shrink: 0;
  }
  .reactor-metrics {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 82px;
  }
  .metric {
    display: flex;
    flex-direction: column;
    padding: 4px 8px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .m-lbl {
    font-size: 9px;
    letter-spacing: 0.08em;
    color: var(--text-muted, #9a9690);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .m-val {
    font-size: 13px;
    font-weight: 600;
    color: #ffd4b8;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .somatic-foot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    text-align: center;
  }
  .gesture-readout {
    font-size: 12px;
    font-weight: 500;
    color: #ffc299;
  }
  .mode-sub {
    font-size: 10.5px;
    color: var(--text-muted, #9a9690);
  }
  .settle-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .somatic-act-btn {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
    border: 1px solid rgba(255, 135, 70, 0.38);
    background: rgba(255, 115, 45, 0.16);
    color: #ffd6b8;
    font-weight: 600;
  }
  .somatic-act-btn.send-now {
    background: rgba(255, 105, 38, 0.28);
    border-color: rgba(255, 145, 80, 0.65);
    color: #fff;
  }
  .somatic-act-btn.clear-btn {
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.14);
    color: var(--text-muted, #aaa);
  }
</style>

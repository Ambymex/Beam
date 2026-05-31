<script lang="ts">
  // The spatial cycle subdial (§11), inset into the hub. Patek-Nautilus cues:
  // a two-tone stepped bezel, the signature horizontal groove texture, fine
  // ticks, a consumed-arc, and a luminous position marker you DRAG to set where
  // you are. Position-not-number; colour stays sacred (luminosity only, §2).
  //
  // Self-contained 100×100 viewBox SVG so it can sit in the hub or stand alone
  // (e.g. tests / the length editor). Emits nothing; reads/writes the cycle store.
  import { cycle, positionAngle, angleToPosition, setPosition } from './cycle';

  export let size = 100; // width/height in the host's units
  export let interactive = true;
  // When nested inside the ring SVG, x/y place this sub-SVG's viewport.
  export let x: number | null = null;
  export let y: number | null = null;

  const VB = 100;
  const c = VB / 2;
  const rBezelOuter = 46;
  const rBezelInner = 40;
  const rFace = 38;
  const rTickOuter = 36;
  const rTickInner = 32;
  const rArc = 34;
  const rMarker = 34;

  let svgEl: SVGSVGElement;

  $: length = $cycle.length;
  $: position = $cycle.position;

  // polar (deg clockwise from top) → point
  function pt(r: number, deg: number) {
    const a = (deg * Math.PI) / 180;
    return { x: c + r * Math.sin(a), y: c - r * Math.cos(a) };
  }

  // consumed arc from day 1 (top) to the current position
  function arcPath(r: number, fromDeg: number, toDeg: number): string {
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    const a = pt(r, fromDeg);
    const b = pt(r, toDeg);
    if (Math.abs(toDeg - fromDeg) < 0.01) return '';
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
  }

  $: markerAngle = positionAngle(position, length);
  $: markerPt = pt(rMarker, markerAngle);
  $: consumed = arcPath(rArc, 0.001, Math.max(0.002, markerAngle));

  // ticks: one per day, longer every 7
  $: ticks = Array.from({ length }, (_, i) => {
    const deg = (i / length) * 360;
    const major = i % 7 === 0;
    const o = pt(rTickOuter, deg);
    const inn = pt(major ? rTickInner - 2 : rTickInner, deg);
    return { x1: o.x, y1: o.y, x2: inn.x, y2: inn.y, major };
  });

  // horizontal Nautilus grooves (clipped to the face)
  const grooves = Array.from({ length: 13 }, (_, i) => 12 + i * 5.5);

  function angleAt(ev: PointerEvent): number {
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return 0;
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    let a = (Math.atan2(p.x - c, -(p.y - c)) * 180) / Math.PI;
    if (a < 0) a += 360;
    return a;
  }

  let dragging = false;
  function down(ev: PointerEvent) {
    if (!interactive) return;
    ev.stopPropagation();
    dragging = true;
    svgEl.setPointerCapture(ev.pointerId);
    setPosition(angleToPosition(angleAt(ev), length));
  }
  function move(ev: PointerEvent) {
    if (!dragging) return;
    ev.stopPropagation();
    setPosition(angleToPosition(angleAt(ev), length));
  }
  function up(ev: PointerEvent) {
    if (!dragging) return;
    ev.stopPropagation();
    dragging = false;
  }
</script>

<svg
  bind:this={svgEl}
  viewBox="0 0 {VB} {VB}"
  width={size}
  height={size}
  x={x ?? undefined}
  y={y ?? undefined}
  class:interactive
  on:pointerdown={down}
  on:pointermove={move}
  on:pointerup={up}
  on:pointercancel={up}
  role={interactive ? 'slider' : 'img'}
  aria-label="Cycle position"
  aria-valuemin={1}
  aria-valuemax={length}
  aria-valuenow={position}
>
  <defs>
    <radialGradient id="cycleFace" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#20212a" />
      <stop offset="100%" stop-color="#101117" />
    </radialGradient>
    <linearGradient id="cycleBezel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a3c47" />
      <stop offset="50%" stop-color="#23242c" />
      <stop offset="100%" stop-color="#34363f" />
    </linearGradient>
    <clipPath id="cycleFaceClip">
      <circle cx={c} cy={c} r={rFace} />
    </clipPath>
    <filter id="cycleGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="1.3" result="b" />
      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>

  <!-- stepped bezel (two-tone, Nautilus) -->
  <circle cx={c} cy={c} r={rBezelOuter} fill="url(#cycleBezel)" stroke="#41434d" stroke-width="0.6" />
  <circle cx={c} cy={c} r={rBezelInner} fill="#15161c" stroke="#0c0c10" stroke-width="0.6" />

  <!-- face -->
  <circle cx={c} cy={c} r={rFace} fill="url(#cycleFace)" />

  <!-- horizontal grooves, clipped to the face -->
  <g clip-path="url(#cycleFaceClip)" opacity="0.5">
    {#each grooves as gy}
      <line x1="8" y1={gy} x2="92" y2={gy} stroke="#000000" stroke-width="0.7" opacity="0.35" />
      <line x1="8" y1={gy + 0.9} x2="92" y2={gy + 0.9} stroke="#3a3c48" stroke-width="0.4" opacity="0.4" />
    {/each}
  </g>

  <!-- day ticks -->
  {#each ticks as t}
    <line
      x1={t.x1}
      y1={t.y1}
      x2={t.x2}
      y2={t.y2}
      stroke={t.major ? '#9a9cab' : '#54565f'}
      stroke-width={t.major ? 0.9 : 0.5}
    />
  {/each}

  <!-- consumed arc: luminosity, never a hue (§2) -->
  {#if consumed}
    <path d={consumed} fill="none" stroke="#e9eaf0" stroke-width="2" stroke-linecap="round" opacity="0.5" />
  {/if}

  <!-- position marker -->
  <circle cx={markerPt.x} cy={markerPt.y} r="3.4" fill="#fdfdff" filter="url(#cycleGlow)" />
  <circle cx={markerPt.x} cy={markerPt.y} r="1.5" fill="#13141a" />

  <!-- hub label: positional first; the number is a faint secondary, never the
       primary representation (§11) -->
  <text x={c} y={c - 1} text-anchor="middle" dominant-baseline="central" font-size="6.5" fill="#cfd0d8" font-weight="600">cycle</text>
  <text x={c} y={c + 7} text-anchor="middle" dominant-baseline="central" font-size="5" fill="#5d5e68" letter-spacing="0.3">day {position}</text>
</svg>

<style>
  svg.interactive {
    touch-action: none;
    cursor: grab;
  }
  text {
    pointer-events: none;
    user-select: none;
  }
</style>

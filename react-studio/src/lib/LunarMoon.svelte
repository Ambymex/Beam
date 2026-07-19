<script lang="ts">
  import { lunarLitPath, lunarPhaseInfo, type LunarHemisphere } from './lunar';

  export let uid: string;
  export let size: number;
  export let lunarDay: number;
  export let hemisphere: LunarHemisphere;
  export let rotation = 0;
  export let terminatorSoftness = 0;
  export let earthshineOpacity = 0;
  export let earthshineColor = '#8390a8';
  export let limbDarkening = 0;
  export let limbDarkeningColor = '#000000';
  export let debug = false;

  $: safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '');
  $: clipId = `moon-clip-${safeUid}`;
  $: blurId = `moon-blur-${safeUid}`;
  $: litPath = lunarLitPath(lunarDay, hemisphere);
  $: phase = lunarPhaseInfo(lunarDay, hemisphere);
</script>

<svg
  class="lunar-moon"
  class:debug
  viewBox="0 0 100 100"
  width={size}
  height={size}
  role="img"
  aria-label={`${phase.name}, ${(phase.illumination * 100).toFixed(1)}% illuminated, ${hemisphere} orientation`}
  style={`transform:rotate(${rotation}deg);`}
>
  <defs>
    <clipPath id={clipId}><circle cx="50" cy="50" r="46" /></clipPath>
    <filter id={blurId} x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation={terminatorSoftness} />
    </filter>
  </defs>

  <g clip-path={`url(#${clipId})`}>
    <circle
      class="earthshine"
      cx="50"
      cy="50"
      r="46"
      fill={earthshineColor}
      opacity={earthshineOpacity}
    />
    {#if litPath}
      <path
        class="lit-face"
        d={litPath}
        fill="currentColor"
        filter={terminatorSoftness > 0 ? `url(#${blurId})` : undefined}
      />
    {/if}
    {#if limbDarkening > 0}
      <circle
        class="limb-shade"
        cx="50"
        cy="50"
        r={46 - limbDarkening * 5}
        fill="none"
        stroke={limbDarkeningColor}
        stroke-opacity="0.72"
        stroke-width={limbDarkening * 10}
        opacity={limbDarkening}
      />
    {/if}
  </g>

  {#if debug}
    <circle class="debug-disc" cx="50" cy="50" r="46" />
    {#if litPath}<path class="debug-terminator" d={litPath} />{/if}
    <line class="debug-axis" x1="4" y1="50" x2="96" y2="50" />
    <line class="debug-axis" x1="50" y1="4" x2="50" y2="96" />
    <circle class="debug-pivot" cx="50" cy="50" r="2" />
  {/if}
</svg>

<style>
  .lunar-moon { display: block; overflow: visible; transform-origin: 50% 50%; }
  .debug-disc,
  .debug-terminator,
  .debug-axis {
    fill: none;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .debug-disc { stroke: #5dff9a; stroke-width: 1px; stroke-dasharray: 3 2; }
  .debug-terminator { stroke: #ff5da8; stroke-width: 1px; }
  .debug-axis { stroke: rgba(93, 255, 154, 0.62); stroke-width: 0.7px; stroke-dasharray: 2 3; }
  .debug-pivot { fill: #ff5da8; vector-effect: non-scaling-stroke; }
</style>

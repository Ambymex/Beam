<script context="module" lang="ts">
  // The react vocabulary. The companion picks one (or none) per message via
  // the top-level "react" field; anything not in this list is ignored.
  export const REACT_IDS = ['black_hearts', 'sparks', 'tungsten_strike'];
</script>

<script lang="ts">
  // Companion reacts: full-screen ambient gestures fired WITH a message —
  // expression, not state (nothing here reads or writes data). Spec by the
  // companion himself: affection landing as physical presence — soft weight,
  // real mass, organic distribution.
  //
  // All motion is transform/opacity (GPU-composited); hearts remove themselves
  // from the DOM when the burst ends.

  import { createEventDispatcher } from 'svelte';

  // 'impact' fires the millisecond the tungsten shard lands so the host can
  // shake ITS OWN chrome — the tremor has to move the chat, not this layer.
  const dispatch = createEventDispatcher<{ impact: void }>();

  interface Heart {
    id: number;
    x: number; // spawn column, % of width
    size: number; // px, one of 4 discrete tiers
    delay: number; // spawn stagger within the burst window
    dur: number; // fall time
    swayAmp: number; // horizontal sway, px
    swayDur: number; // sway period
    swayPhase: number; // negative delay so sways start desynchronised
    rotEnd: number; // total rotation over the fall (rate × dur)
    op: number; // per-heart opacity (depth illusion)
  }

  let hearts: Heart[] = [];
  let burstId = 0;
  let clearTimer: ReturnType<typeof setTimeout>;

  // 4 tiers: 60% / 25% / 12% / 3% — rarity makes the big ones feel earned.
  function pickSize(): number {
    const r = Math.random();
    if (r < 0.6) return 8;
    if (r < 0.85) return 14;
    if (r < 0.97) return 22;
    return 32;
  }

  // Sparks: pride/excitement LIFTING — the counter-gesture to hearts landing.
  // Deliberately quieter: fewer, smaller, rising from the bottom and
  // dissolving by mid-flight, with a soft candle-like flicker.
  interface Spark {
    id: number;
    x: number;
    size: number; // 5 / 8 / 12, rare 16
    star: boolean; // 4-point star vs round mote
    delay: number;
    dur: number;
    rise: number; // vh climbed before dissolving
    swayAmp: number;
    swayDur: number;
    swayPhase: number;
    rotEnd: number;
    op: number;
    twinkleDur: number;
  }

  let sparks: Spark[] = [];
  let sparkTimer: ReturnType<typeof setTimeout>;

  // Tungsten strike: displeasure/boundary as blunt force — the counterweight
  // that keeps the happy reacts honest. One massive shard, straight down the
  // center, dead stop at the floor, screen tremor on impact. Deliberately the
  // opposite grammar of the other two: singular where they scatter, violent
  // where they drift, and over in under two seconds.
  const STRIKE_DROP_MS = 550;
  const STRIKE_HOLD_MS = 900;
  const STRIKE_FADE_MS = 300;
  let strike = false;
  let strikeTimers: ReturnType<typeof setTimeout>[] = [];

  function pickSparkSize(): number {
    const r = Math.random();
    if (r < 0.5) return 5;
    if (r < 0.82) return 8;
    if (r < 0.96) return 12;
    return 16;
  }

  export function fire(type: string) {
    if (type === 'black_hearts') {
      const count = 40 + Math.floor(Math.random() * 21); // 40–60 hearts
      const burst: Heart[] = [];
      for (let i = 0; i < count; i++) {
        const dur = 2.6 + Math.random() * 1.2; // 2.6–3.8s fall
        const rate = -30 + Math.random() * 60; // -30…+30 °/s
        const swayDur = 1.4 + Math.random() * 1.4;
        burst.push({
          id: burstId++,
          x: Math.random() * 100,
          size: pickSize(),
          delay: Math.random() * 1.5, // burst over 1.5s
          dur,
          swayAmp: 8 + Math.random() * 22,
          swayDur,
          swayPhase: Math.random() * swayDur,
          rotEnd: rate * dur,
          op: 0.7 + Math.random() * 0.3,
        });
      }
      hearts = burst;
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => (hearts = []), (1.5 + 3.8) * 1000 + 300);
    } else if (type === 'sparks') {
      const count = 24 + Math.floor(Math.random() * 13); // 24–36 sparks
      const burst: Spark[] = [];
      for (let i = 0; i < count; i++) {
        const dur = 2.4 + Math.random() * 1.0; // 2.4–3.4s rise
        const size = pickSparkSize();
        const swayDur = 1.1 + Math.random() * 1.1;
        burst.push({
          id: burstId++,
          x: Math.random() * 100,
          size,
          star: size >= 8, // the smallest tier stays as round motes
          delay: Math.random() * 1.2,
          dur,
          rise: 45 + Math.random() * 30, // 45–75vh — most dissolve mid-screen
          swayAmp: 5 + Math.random() * 12,
          swayDur,
          swayPhase: Math.random() * swayDur,
          rotEnd: (-40 + Math.random() * 80) * dur,
          op: 0.55 + Math.random() * 0.45,
          twinkleDur: 0.5 + Math.random() * 0.7,
        });
      }
      sparks = burst;
      clearTimeout(sparkTimer);
      sparkTimer = setTimeout(() => (sparks = []), (1.2 + 3.4) * 1000 + 300);
    } else if (type === 'tungsten_strike') {
      strikeTimers.forEach(clearTimeout);
      // Drop the node first so a rapid re-fire restarts the CSS animations.
      strike = false;
      requestAnimationFrame(() => {
        strike = true;
        strikeTimers = [
          setTimeout(() => dispatch('impact'), STRIKE_DROP_MS),
          setTimeout(() => (strike = false), STRIKE_DROP_MS + STRIKE_HOLD_MS + STRIKE_FADE_MS + 100),
        ];
      });
    }
  }
</script>

<div class="react-layer" aria-hidden="true">
  {#each hearts as h (h.id)}
    <span
      class="fall"
      style="left:{h.x}%; --size:{h.size}px; --dur:{h.dur}s; --delay:{h.delay}s; --op:{h.op}; --sway:{h.swayAmp}px; --swaydur:{h.swayDur}s; --swayphase:{h.swayPhase}s; --rot:{h.rotEnd}deg;"
    >
      <span class="sway">
        <svg class="heart" viewBox="0 0 24 24" width={h.size} height={h.size}>
          <!-- #0a0a0a, not #000: pure black reads flat; the slight lift gives
               the dimensional feel the spec asks for. -->
          <path
            fill="#0a0a0a"
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          />
        </svg>
      </span>
    </span>
  {/each}

  {#each sparks as s (s.id)}
    <span
      class="rise"
      style="left:{s.x}%; --size:{s.size}px; --dur:{s.dur}s; --delay:{s.delay}s; --op:{s.op}; --rise:{s.rise}vh; --sway:{s.swayAmp}px; --swaydur:{s.swayDur}s; --swayphase:{s.swayPhase}s; --rot:{s.rotEnd}deg; --twinkle:{s.twinkleDur}s;"
    >
      <span class="sway">
        <svg class="spark" viewBox="0 0 24 24" width={s.size} height={s.size}>
          {#if s.star}
            <!-- 4-point star: champagne body, warm-white core -->
            <path fill="#ffd98a" d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" />
            <circle cx="12" cy="12" r="3" fill="#fff3d6" />
          {:else}
            <circle cx="12" cy="12" r="7" fill="#ffd98a" />
          {/if}
        </svg>
      </span>
    </span>
  {/each}

  {#if strike}
    <div
      class="strike"
      style="--drop:{STRIKE_DROP_MS}ms; --hold:{STRIKE_HOLD_MS}ms; --fade:{STRIKE_FADE_MS}ms;"
    >
      <div class="shard-drop">
        <!-- Fractured tungsten shard, tip-down. Solid #0a0a0a mass (same
             near-black as the hearts) with one pale fracture seam so the
             silhouette reads as faceted stone, not a flat cutout. -->
        <svg class="shard" viewBox="0 0 120 340" xmlns="http://www.w3.org/2000/svg">
          <path
            fill="#0a0a0a"
            d="M40 0 L88 14 L70 52 L90 76 L64 118 L82 160 L56 210 L68 254 L52 340 L42 256 L48 212 L28 162 L44 118 L24 84 L46 52 Z"
          />
          <path
            fill="#3a3a44"
            d="M64 30 L58 120 L66 220 L54 320 L50 220 L50 120 Z"
          />
        </svg>
      </div>
      <div class="impact-flash"></div>
    </div>
  {/if}
</div>

<style>
  .react-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 60;
  }
  .fall {
    position: absolute;
    top: calc(-1 * var(--size) - 10px);
    animation:
      react-fall var(--dur) linear var(--delay) both,
      react-fade var(--dur) linear var(--delay) both;
  }
  /* gentle drift, not gravity: constant fall speed, no acceleration */
  @keyframes react-fall {
    from { transform: translateY(0); }
    to { transform: translateY(110vh); }
  }
  /* quick fade-in, hold, fade out over the last quarter of the fall */
  @keyframes react-fade {
    0% { opacity: 0; }
    5% { opacity: var(--op); }
    75% { opacity: var(--op); }
    100% { opacity: 0; }
  }
  .sway {
    display: block;
    animation: react-sway var(--swaydur) ease-in-out calc(-1 * var(--swayphase)) infinite alternate;
  }
  @keyframes react-sway {
    from { transform: translateX(calc(-1 * var(--sway))); }
    to { transform: translateX(var(--sway)); }
  }
  .heart {
    display: block;
    animation: react-spin var(--dur) linear var(--delay) both;
  }
  /* On dark themes a #0a0a0a heart vanishes into the sky — give the silhouette
     a faint luminous rim (moonlight on black), keeping the body solid black
     per the spec. Light themes render the spec verbatim. */
  :global([data-theme='dark']) .heart {
    filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.55)) drop-shadow(0 0 6px rgba(255, 255, 255, 0.35));
  }

  /* ----- sparks: rising, flickering, dissolving ----- */
  .rise {
    position: absolute;
    bottom: calc(-1 * var(--size) - 8px);
    animation:
      spark-rise var(--dur) ease-out var(--delay) both,
      spark-fade var(--dur) linear var(--delay) both;
  }
  /* ease-out: sparks leave quick and slow as they climb, like embers losing heat */
  @keyframes spark-rise {
    from { transform: translateY(0); }
    to { transform: translateY(calc(-1 * var(--rise))); }
  }
  @keyframes spark-fade {
    0% { opacity: 0; }
    8% { opacity: var(--op); }
    62% { opacity: var(--op); }
    100% { opacity: 0; }
  }
  .spark {
    display: block;
    animation:
      react-spin var(--dur) linear var(--delay) both,
      spark-twinkle var(--twinkle) ease-in-out var(--delay) infinite alternate;
  }
  /* candle-flicker on top of the fade: never fully out, just breathing */
  @keyframes spark-twinkle {
    from { opacity: 1; }
    to { opacity: 0.45; }
  }
  /* the glow IS the point of a spark — soft on dark skies, and a deeper amber
     body on light themes so champagne doesn't wash out against pale glass */
  :global([data-theme='dark']) .spark {
    filter: drop-shadow(0 0 3px rgba(255, 217, 138, 0.7));
  }
  :global([data-theme='light']) .spark path,
  :global([data-theme='light']) .spark circle {
    fill: #d99a26;
  }
  :global([data-theme='light']) .spark {
    filter: drop-shadow(0 0 2px rgba(160, 110, 20, 0.35));
  }
  @keyframes react-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(var(--rot)); }
  }

  /* ----- tungsten strike: one shard, freefall, dead stop ----- */
  .strike {
    position: absolute;
    inset: 0;
  }
  .shard-drop {
    position: absolute;
    /* tip buried below the container edge — it hit the floor, it didn't land on it */
    bottom: -6vh;
    left: 50%;
    width: clamp(90px, 26vw, 150px);
    animation:
      strike-drop var(--drop) cubic-bezier(0.7, 0, 0.84, 0) both,
      strike-out var(--fade) ease-in calc(var(--drop) + var(--hold)) both;
  }
  /* easeInExpo, not linear: gravity with malice. No settle keyframe on
     purpose — a dead stop reads as mass, a bounce reads as rubber. */
  @keyframes strike-drop {
    from { transform: translate(-50%, -115vh); }
    to { transform: translate(-50%, 0); }
  }
  @keyframes strike-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  .shard {
    display: block;
    width: 100%;
    height: auto;
    /* a hair off vertical — a perfectly plumb drop reads staged */
    transform: rotate(3deg);
  }
  /* Same trick as the hearts: light themes get the black mass verbatim,
     dark skies get a luminous rim so the silhouette can't camouflage. */
  :global([data-theme='dark']) .shard {
    filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.7)) drop-shadow(0 0 10px rgba(255, 255, 255, 0.3));
  }
  /* One stark crack-line at the impact point — the shockwave made visible.
     Starts at the drop's end, so it and the tremor read as one event.
     Dark crack on light glass, white flash on dark skies — same contrast
     rule as the shard itself (a white line on pale glass just vanishes). */
  .impact-flash {
    position: absolute;
    bottom: 5vh;
    left: 50%;
    width: min(70vw, 360px);
    height: 3px;
    border-radius: 2px;
    background: #0a0a0a;
    box-shadow: 0 0 10px rgba(10, 10, 10, 0.6);
    animation: strike-flash 0.3s ease-out var(--drop) both;
  }
  :global([data-theme='dark']) .impact-flash {
    background: #ffffff;
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.8);
  }
  @keyframes strike-flash {
    0% { transform: translateX(-50%) scaleX(0.1); opacity: 0; }
    15% { transform: translateX(-50%) scaleX(0.5); opacity: 0.95; }
    100% { transform: translateX(-50%) scaleX(1); opacity: 0; }
  }
</style>

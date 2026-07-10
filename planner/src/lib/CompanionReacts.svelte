<script context="module" lang="ts">
  // The react vocabulary. The companion picks one (or none) per message via
  // the top-level "react" field; anything not in this list is ignored.
  export const REACT_IDS = ['black_hearts', 'sparks', 'tungsten_strike', 'liquid_hearts', 'cherry_blossoms', 'sleepy_stars', 'rose_throw'];
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

  // Liquid hearts: black_hearts' slower, heavier sibling — affection with
  // heat behind it. Spec by the companion (of course): honey-viscous cream
  // drops that stretch as they fall, merge mid-air, and pool glossy at the
  // floor. Choreographed, not simulated: merges are pre-paired at spawn and
  // pooling happens at the layer bottom, so it stays pure CSS kinetics like
  // every other react.
  const HEART_PATH =
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
  // Natural liquid isn't uniform-colour: warm to cool creams, per drop.
  const CREAMS = ['#f8f0e0', '#f5f0e6', '#f5f2ea'];

  interface Drip {
    id: number;
    x: number;
    size: number;
    color: string;
    delay: number;
    dur: number; // ~40–50% of the confetti fall speed — viscosity lives here
    rotEnd: number; // lazy: 5–15°/s
    wobble: number; // stretch-oscillation period (~2–2.6 Hz)
    wobblePhase: number;
    op: number;
    poolW: number;
    poolH: number;
    poolDur: number;
    poolDelay: number; // absolute: when the drop reaches the floor
  }

  interface MergePair {
    id: number;
    x: number;
    gap: number; // px each half starts from centre
    size: number; // the merged drop
    halfSize: number;
    color: string;
    delay: number;
    dur: number;
    convDur: number; // how long the halves take to find each other
    popDelay: number; // absolute: when the fused drop takes over
    rotEnd: number;
    wobble: number;
    wobblePhase: number;
    op: number;
    poolW: number;
    poolH: number;
    poolDur: number;
    poolDelay: number;
  }

  let liquid: Drip[] = [];
  let liquidPairs: MergePair[] = [];
  let liquidTimer: ReturnType<typeof setTimeout>;

  function pickLiquidSize(): number {
    const r = Math.random();
    if (r < 0.45) return 12;
    if (r < 0.8) return 18;
    if (r < 0.96) return 26;
    return 34;
  }

  // Cherry blossoms: the lightest touch in the vocabulary — soft, delicate,
  // gently admiring. Same silhouette as the Sweet theme's ambient petals but
  // smaller, lit-from-within, and livelier: they emerge with a little upward
  // "puff of release" before settling into a fluttering downward drift, and
  // ride the react layer (z-60) so they pass IN FRONT of the ambient petals
  // (z-0) — the depth gap reads as "these are the new ones." No element anchor
  // exists at fire time, so the spec's "emerge from the affected element" is
  // adapted to a spread of origins that puff outward+down across the view.
  interface Blossom {
    id: number;
    x: number; // spawn column, %
    y: number; // spawn row, vh (lower-mid band: near where a new message lands)
    size: number;
    delay: number;
    dur: number;
    puff: number; // upward burst height, vh
    driftx: number; // net horizontal travel, vw (signed, outward from origin)
    fally: number; // downward drift after the puff, vh
    sway: number; // flutter amplitude, px (pronounced — larger than ambient)
    swayDur: number;
    swayPhase: number;
    rotEnd: number;
    op: number;
  }

  let blossoms: Blossom[] = [];
  let blossomTimer: ReturnType<typeof setTimeout>;

  // Sleepy stars — Soft, comforting goodnight/ nap time etc
  interface SleepyStarsP {
    id: number; x: number; size: number; color: string; delay: number;
    dur: number; op: number; rotEnd: number; swayAmp: number; swayDur: number;
    swayPhase: number; tx: string; ty: string; glow: string;
  }
  let sleepy_stars: SleepyStarsP[] = [];
  let sleepy_starsTimer: ReturnType<typeof setTimeout>;

  // Rose throw — Playful affection, teasing, like a handful of rose petals
  // thrown into the air. Built by Ash in React Studio (first two-layer
  // fountain out of the v2 studio): red heart-petals arcing over a sparser
  // trail of leaves.
  interface RoseThrowP {
    id: number; x: number; size: number; color: string; delay: number;
    dur: number; op: number; inDur: number; outDelay: number; outDur: number;
    rotEnd: number; swayAmp: number; swayDur: number; swayPhase: number;
    tx: string; ty: string; apex: number;
  }
  let rose_throw_l1: RoseThrowP[] = [];
  let rose_throw_l2: RoseThrowP[] = [];
  let rose_throwTimer: ReturnType<typeof setTimeout>;

  function pickBlossomSize(): number {
    // 60–75% of the ~13px ambient petal — delicate, not aggressive
    const r = Math.random();
    if (r < 0.5) return 8;
    if (r < 0.85) return 9;
    return 11;
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
    } else if (type === 'liquid_hearts') {
      const drips: Drip[] = [];
      const count = 11 + Math.floor(Math.random() * 5); // 11–15: a trickle, not a burst
      for (let i = 0; i < count; i++) {
        const dur = 5.5 + Math.random() * 2; // 5.5–7.5s — start of the tuning range
        const size = pickLiquidSize();
        const wobble = 0.38 + Math.random() * 0.14;
        const delay = Math.random() * 2.5; // spec: trickle over 2–3s
        drips.push({
          id: burstId++,
          x: 3 + Math.random() * 94,
          size,
          color: CREAMS[Math.floor(Math.random() * CREAMS.length)],
          delay,
          dur,
          rotEnd: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 10) * dur,
          wobble,
          wobblePhase: Math.random() * wobble,
          op: 0.85 + Math.random() * 0.15, // liquid is substantial, barely translucent
          poolW: size * (3 + Math.random()),
          poolH: size * 0.42,
          poolDur: 2 + Math.random(), // spec: pools fade over 2–3s
          poolDelay: delay + dur - 0.35,
        });
      }
      const pairs: MergePair[] = [];
      const pairCount = 2 + Math.floor(Math.random() * 2); // 2–3 merges per fall
      for (let i = 0; i < pairCount; i++) {
        const dur = 5.8 + Math.random() * 1.7;
        const size = 20 + Math.floor(Math.random() * 10);
        const delay = Math.random() * 2.2;
        const convDur = dur * (0.3 + Math.random() * 0.25);
        const wobble = 0.4 + Math.random() * 0.12;
        pairs.push({
          id: burstId++,
          x: 10 + Math.random() * 80,
          gap: 14 + Math.random() * 12,
          size,
          halfSize: Math.round(size * 0.68),
          color: CREAMS[Math.floor(Math.random() * CREAMS.length)],
          delay,
          dur,
          convDur,
          popDelay: delay + convDur - 0.12,
          rotEnd: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 8) * dur,
          wobble,
          wobblePhase: Math.random() * wobble,
          op: 0.9 + Math.random() * 0.1,
          poolW: size * 3.6,
          poolH: size * 0.42,
          poolDur: 2.2 + Math.random(),
          poolDelay: delay + dur - 0.35,
        });
      }
      liquid = drips;
      liquidPairs = pairs;
      clearTimeout(liquidTimer);
      // max delay 2.5 + max fall 7.5 + pool 3 + margin
      liquidTimer = setTimeout(() => {
        liquid = [];
        liquidPairs = [];
      }, 13500);
    } else if (type === 'cherry_blossoms') {
      const count = 20 + Math.floor(Math.random() * 11); // 20–30
      const burst: Blossom[] = [];
      for (let i = 0; i < count; i++) {
        const dur = 3 + Math.random() * 1; // 3–4s visible
        const x = 8 + Math.random() * 84;
        const swayDur = 0.9 + Math.random() * 0.7;
        // drift outward from the origin column: left-of-centre petals lean
        // left, right-of-centre lean right, with spread
        const dir = x < 50 ? -1 : 1;
        burst.push({
          id: burstId++,
          x,
          y: 40 + Math.random() * 34, // 40–74vh, the message area
          size: pickBlossomSize(),
          delay: Math.random() * 2.5, // trickle over ~2.5s
          dur,
          puff: 6 + Math.random() * 6, // 6–12vh upward release
          driftx: dir * (8 + Math.random() * 14), // 8–22vw outward
          fally: 20 + Math.random() * 18, // 20–38vh gentle descent
          sway: 14 + Math.random() * 16, // pronounced flutter
          swayDur,
          swayPhase: Math.random() * swayDur,
          rotEnd: (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 80),
          op: 0.75 + Math.random() * 0.2, // floor 0.75, ceiling ~0.95
        });
      }
      blossoms = burst;
      clearTimeout(blossomTimer);
      blossomTimer = setTimeout(() => (blossoms = []), (2.5 + 4) * 1000 + 300);
    } else if (type === 'sleepy_stars') {
      const burst: SleepyStarsP[] = [];
      const count = 65;
      for (let i = 0; i < count; i++) {
        const dur = 6 + Math.random() * 1.5;
        const swayDur = 1.7 + Math.random() * 1.1;
        const color = ['#6676f0', '#747be2', '#6e6cea'][Math.floor(Math.random() * 3)];
        burst.push({
          id: burstId++,
          x: 4 + Math.random() * 92,
          size: Math.round(7 + Math.random() * 21),
          color,
          delay: Math.random() * 3.5,
          dur,
          op: 0.55 + Math.random() * 0.25,
          rotEnd: (Math.random() < 0.5 ? -1 : 1) * 60 * dur,
          swayAmp: 13.8 + Math.random() * 9.2,
          swayDur,
          swayPhase: Math.random() * swayDur,
          tx: `${(-10 + Math.random() * 20).toFixed(1)}vw`,
          ty: '112vh',
          glow: `drop-shadow(0 0 8px ${color})`,
        });
      }
      sleepy_stars = burst;
      clearTimeout(sleepy_starsTimer);
      sleepy_starsTimer = setTimeout(() => (sleepy_stars = []), 11400);
    } else if (type === 'rose_throw') {
      // layer 1: Petals
      const b1: RoseThrowP[] = [];
      for (let i = 0; i < 28; i++) {
        const t = Math.random(); // depth: 0 far, 1 near
        const size = Math.round(8 + t * 16);
        const dur = 3.8 - t * 1.2;
        const op = 0.7 + (0.3 + t * 0.7) * 0.3;
        const swayDur = 1.4 + Math.random() * 1.4;
        const delay = 0 + Math.random() * 1.5;
        const color = ['#860909', '#781111', '#770808'][Math.floor(Math.random() * 3)];
        b1.push({
          id: burstId++,
          x: 4 + Math.random() * 92,
          size,
          color,
          delay,
          dur,
          op,
          inDur: +(dur * 0.08).toFixed(3),
          outDelay: +(delay + dur * 0.72).toFixed(3),
          outDur: +(dur * 0.28).toFixed(3),
          rotEnd: (Math.random() < 0.5 ? -1 : 1) * 30 * dur,
          swayAmp: 12 + Math.random() * 8,
          swayDur,
          swayPhase: Math.random() * swayDur,
          tx: `${(-12 + Math.random() * 24).toFixed(1)}vw`,
          ty: '0vh',
          apex: 32.2 + Math.random() * 13.8,
        });
      }
      rose_throw_l1 = b1;
      // layer 2: leaves
      const b2: RoseThrowP[] = [];
      for (let i = 0; i < 16; i++) {
        const t = Math.random(); // depth: 0 far, 1 near
        const size = Math.round(10 + t * 2);
        const dur = 3.8 - t * 1.2;
        const op = 0.7 + (0.3 + t * 0.7) * 0.3;
        const swayDur = 1.4 + Math.random() * 1.4;
        const delay = 0.1 + Math.random() * 1.5;
        const color = ['#1f4908', '#2b5502', '#234904'][Math.floor(Math.random() * 3)];
        b2.push({
          id: burstId++,
          x: 4 + Math.random() * 92,
          size,
          color,
          delay,
          dur,
          op,
          inDur: +(dur * 0.08).toFixed(3),
          outDelay: +(delay + dur * 0.72).toFixed(3),
          outDur: +(dur * 0.28).toFixed(3),
          rotEnd: (Math.random() < 0.5 ? -1 : 1) * 30 * dur,
          swayAmp: 9.6 + Math.random() * 6.4,
          swayDur,
          swayPhase: Math.random() * swayDur,
          tx: `${(-8 + Math.random() * 16).toFixed(1)}vw`,
          ty: '0vh',
          apex: 30.8 + Math.random() * 13.2,
        });
      }
      rose_throw_l2 = b2;
      clearTimeout(rose_throwTimer);
      rose_throwTimer = setTimeout(() => {
        rose_throw_l1 = [];
        rose_throw_l2 = [];
      }, 5800);
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

  {#each blossoms as bl (bl.id)}
    <span
      class="bloom"
      style="left:{bl.x}%; top:{bl.y}vh; --size:{bl.size}px; --dur:{bl.dur}s; --delay:{bl.delay}s; --op:{bl.op}; --puff:{bl.puff}vh; --driftx:{bl.driftx}vw; --fally:{bl.fally}vh; --sway:{bl.sway}px; --swaydur:{bl.swayDur}s; --swayphase:{bl.swayPhase}s; --rot:{bl.rotEnd}deg;"
    >
      <span class="bloom-flutter">
        <span class="bloom-petal"></span>
      </span>
    </span>
  {/each}

  {#each liquid as d (d.id)}
    <span
      class="ldrip"
      style="left:{d.x}%; --size:{d.size}px; --dur:{d.dur}s; --delay:{d.delay}s; --op:{d.op}; --rot:{d.rotEnd}deg; --wobble:{d.wobble}s; --wobblephase:{d.wobblePhase}s;"
    >
      <span class="trail"></span>
      <span class="goo">
        <svg class="lheart" viewBox="0 0 24 24" width={d.size} height={d.size}>
          <path fill={d.color} d={HEART_PATH} />
          <!-- the gloss: cream reads dry without a wet highlight -->
          <ellipse cx="8" cy="7.2" rx="2.4" ry="1.4" fill="rgba(255,255,255,0.85)" transform="rotate(-20 8 7.2)" />
        </svg>
      </span>
    </span>
    <span
      class="lpool"
      style="left:{d.x}%; --poolw:{d.poolW}px; --poolh:{d.poolH}px; --pooldur:{d.poolDur}s; --pooldelay:{d.poolDelay}s; --pcolor:{d.color};"
    ></span>
  {/each}

  {#each liquidPairs as p (p.id)}
    <span
      class="ldrip pair"
      style="left:{p.x}%; --size:{p.size}px; --dur:{p.dur}s; --delay:{p.delay}s; --op:{p.op}; --rot:{p.rotEnd}deg; --wobble:{p.wobble}s; --wobblephase:{p.wobblePhase}s; --convdur:{p.convDur}s; --popdelay:{p.popDelay}s;"
    >
      <span class="half" style="--from:{-p.gap}px">
        <svg class="lheart" viewBox="0 0 24 24" width={p.halfSize} height={p.halfSize}>
          <path fill={p.color} d={HEART_PATH} />
          <ellipse cx="8" cy="7.2" rx="2.4" ry="1.4" fill="rgba(255,255,255,0.85)" transform="rotate(-20 8 7.2)" />
        </svg>
      </span>
      <span class="half" style="--from:{p.gap}px">
        <svg class="lheart" viewBox="0 0 24 24" width={p.halfSize} height={p.halfSize}>
          <path fill={p.color} d={HEART_PATH} />
          <ellipse cx="8" cy="7.2" rx="2.4" ry="1.4" fill="rgba(255,255,255,0.85)" transform="rotate(-20 8 7.2)" />
        </svg>
      </span>
      <span class="whole">
        <span class="goo">
          <svg class="lheart" viewBox="0 0 24 24" width={p.size} height={p.size}>
            <path fill={p.color} d={HEART_PATH} />
            <ellipse cx="8" cy="7.2" rx="2.4" ry="1.4" fill="rgba(255,255,255,0.85)" transform="rotate(-20 8 7.2)" />
          </svg>
        </span>
      </span>
    </span>
    <span
      class="lpool"
      style="left:{p.x}%; --poolw:{p.poolW}px; --poolh:{p.poolH}px; --pooldur:{p.poolDur}s; --pooldelay:{p.poolDelay}s; --pcolor:{p.color};"
    ></span>
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

  {#each sleepy_stars as p (p.id)}
    <span
      class="sleepy_stars"
      style="left:{p.x}%; --size:{p.size}px; --dur:{p.dur}s; --delay:{p.delay}s; --op:{p.op}; --tx:{p.tx}; --ty:{p.ty}; --sway:{p.swayAmp}px; --swaydur:{p.swayDur}s; --swayphase:{p.swayPhase}s; --rot:{p.rotEnd}deg;"
    >
      <span class="sleepy_stars-sway">
        <span class="sleepy_stars-shape" style="filter:{p.glow};">
          <svg viewBox="0 0 24 24" width={p.size} height={p.size} style="display:block;">
            <path fill={p.color} d="M 12 1 L 14.5 8.5 L 22.5 8.5 L 16.5 13.5 L 18.5 21 L 12 16.5 L 5.5 21 L 7.5 13.5 L 1.5 8.5 L 9.5 8.5 Z" />
          </svg>
        </span>
      </span>
    </span>
  {/each}

  <!-- Rose throw, layer 1: Petals -->
  {#each rose_throw_l1 as p (p.id)}
    <span
      class="rose_throw-l1"
      style="left:{p.x}%; --size:{p.size}px; --dur:{p.dur}s; --delay:{p.delay}s; --op:{p.op}; --indur:{p.inDur}s; --outdelay:{p.outDelay}s; --outdur:{p.outDur}s; --tx:{p.tx}; --ty:{p.ty}; --sway:{p.swayAmp}px; --swaydur:{p.swayDur}s; --swayphase:{p.swayPhase}s; --rot:{p.rotEnd}deg; --apex:{p.apex}vh;"
    >
      <span class="rose_throw-arc">
        <span class="rose_throw-sway">
          <span class="rose_throw-l1-shape" style="--rim:6px;">
            <svg viewBox="0 0 24 24" width={p.size} height={p.size} style="display:block;">
              <path fill={p.color} d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </span>
        </span>
      </span>
    </span>
  {/each}
  <!-- Rose throw, layer 2: leaves -->
  {#each rose_throw_l2 as p (p.id)}
    <span
      class="rose_throw-l2"
      style="left:{p.x}%; --size:{p.size}px; --dur:{p.dur}s; --delay:{p.delay}s; --op:{p.op}; --indur:{p.inDur}s; --outdelay:{p.outDelay}s; --outdur:{p.outDur}s; --tx:{p.tx}; --ty:{p.ty}; --sway:{p.swayAmp}px; --swaydur:{p.swayDur}s; --swayphase:{p.swayPhase}s; --rot:{p.rotEnd}deg; --apex:{p.apex}vh;"
    >
      <span class="rose_throw-arc">
        <span class="rose_throw-sway">
          <span class="rose_throw-l2-shape" style="--rim:6px;">
            <svg viewBox="0 0 24 24" width={p.size} height={p.size} style="display:block;">
              <path fill={p.color} d="M20 4 C10 4 4 10 4 20 C14 20 20 14 20 4 Z" />
            </svg>
          </span>
        </span>
      </span>
    </span>
  {/each}
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

  /* ----- cherry blossoms: puff of release, then a fluttering drift ----- */
  /* three nested transforms: outer = emerge+drift path, middle = flutter,
     inner petal = rotation. Kept separate so none fight each other. */
  .bloom {
    position: absolute;
    animation:
      bloom-drift var(--dur) cubic-bezier(0.22, 0.7, 0.3, 1) var(--delay) both,
      bloom-fade var(--dur) linear var(--delay) both;
  }
  /* the puff: a quick upward-outward release (scale 0.3 → 1 as it "opens"),
     then an eased settle into the gentle downward drift — "something soft
     just happened here." */
  @keyframes bloom-drift {
    0% { transform: translate(0, 0) scale(0.3); }
    18% { transform: translate(calc(var(--driftx) * 0.28), calc(-1 * var(--puff))) scale(1); }
    100% { transform: translate(var(--driftx), var(--fally)) scale(1); }
  }
  @keyframes bloom-fade {
    0% { opacity: 0; }
    14% { opacity: var(--op); }
    72% { opacity: var(--op); }
    100% { opacity: 0; }
  }
  .bloom-flutter {
    display: block;
    /* pronounced flutter — larger amplitude than the ambient petals */
    animation: bloom-flutter var(--swaydur) ease-in-out calc(-1 * var(--swayphase)) infinite alternate;
  }
  @keyframes bloom-flutter {
    from { transform: translateX(calc(-1 * var(--sway))); }
    to { transform: translateX(var(--sway)); }
  }
  .bloom-petal {
    display: block;
    width: var(--size);
    height: var(--size);
    /* same pinched-corner blossom silhouette as the Sweet theme's ambient petals */
    border-radius: 150% 0 150% 0;
    /* warm luminous centre → soft edge, and a lit-from-within halo so these
       read as closer/newer than the flatter background petals */
    background: radial-gradient(circle at 35% 30%, #ffd5e5, #fce4ee);
    box-shadow: 0 0 5px rgba(255, 190, 220, 0.6), 0 0 11px rgba(255, 205, 228, 0.35);
    animation: react-spin var(--dur) linear var(--delay) both;
  }

  /* ----- liquid hearts: honey-slow, stretching, merging, pooling ----- */
  .ldrip {
    position: absolute;
    top: calc(-1 * var(--size) - 14px);
    animation:
      liquid-fall var(--dur) cubic-bezier(0.3, 0, 0.8, 1) var(--delay) both,
      liquid-fade var(--dur) linear var(--delay) both;
  }
  /* the gentle start is the drop clinging before it lets go; after that the
     speed is what sells viscosity (calibrated ~40–50% of black_hearts) */
  @keyframes liquid-fall {
    from { transform: translateY(0); }
    to { transform: translateY(105vh); }
  }
  @keyframes liquid-fade {
    0% { opacity: 0; }
    6% { opacity: var(--op); }
    90% { opacity: var(--op); }
    100% { opacity: 0; }
  }
  /* the wobble: liquid doesn't hold shape — stretched by fall, never rigid.
     Oscillates AROUND a slightly elongated state, not around rest. */
  .goo {
    display: block;
    animation: liquid-goo var(--wobble) ease-in-out calc(-1 * var(--wobblephase)) infinite alternate;
  }
  @keyframes liquid-goo {
    from { transform: scale(0.94, 1.1); }
    to { transform: scale(1.05, 0.96); }
  }
  .lheart {
    display: block;
    animation: react-spin var(--dur) linear var(--delay) both;
  }
  /* residue streak above the drop — tracks on glass */
  .trail {
    position: absolute;
    left: 50%;
    bottom: 70%;
    width: 3px;
    height: calc(var(--size) * 2.4);
    margin-left: -1.5px;
    border-radius: 3px;
    background: linear-gradient(to top, rgba(226, 214, 190, 0.3), transparent);
  }
  /* cream on pale glass needs a shadow to exist; on dark skies a warm sheen */
  :global([data-theme='light']) .lheart {
    filter: drop-shadow(0 1px 2px rgba(115, 88, 43, 0.4));
  }
  :global([data-theme='dark']) .lheart {
    filter: drop-shadow(0 0 4px rgba(245, 240, 230, 0.35));
  }

  /* merge pair: two halves ease into each other (surface tension pulls harder
     the closer they get), then the fused drop pops in with a squash */
  .half {
    position: absolute;
    left: 0;
    top: 0;
    animation: pair-converge var(--convdur) ease-in var(--delay) both;
  }
  @keyframes pair-converge {
    0% { transform: translateX(calc(var(--from) - 50%)); opacity: 1; }
    85% { opacity: 1; }
    100% { transform: translateX(-50%); opacity: 0; }
  }
  .whole {
    position: absolute;
    left: 0;
    top: 0;
    opacity: 0;
    animation: merge-pop 0.5s cubic-bezier(0.34, 1.3, 0.64, 1) var(--popdelay) both;
  }
  @keyframes merge-pop {
    0% { opacity: 0; transform: translateX(-50%) scale(0.7, 1.25); }
    25% { opacity: 1; }
    55% { transform: translateX(-50%) scale(1.14, 0.88); }
    100% { opacity: 1; transform: translateX(-50%) scale(1, 1); }
  }

  /* the pool: lands, spreads, sits glossy for a breath, sinks away */
  .lpool {
    position: absolute;
    bottom: 0;
    width: var(--poolw);
    height: var(--poolh);
    margin-left: calc(-0.5 * var(--poolw));
    border-radius: 50%;
    background:
      radial-gradient(ellipse at 32% 20%, rgba(255, 255, 255, 0.9), transparent 42%),
      var(--pcolor);
    transform-origin: 50% 100%;
    animation: pool-spread var(--pooldur) ease-out var(--pooldelay) both;
  }
  :global([data-theme='light']) .lpool {
    filter: drop-shadow(0 1px 2px rgba(115, 88, 43, 0.35));
  }
  @keyframes pool-spread {
    0% { opacity: 0; transform: scaleX(0.3) scaleY(0.5); }
    10% { opacity: 0.92; }
    40% { transform: scaleX(1) scaleY(1); }
    75% { opacity: 0.8; }
    100% { opacity: 0; transform: scaleX(1.18) scaleY(0.85); }
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

  .sleepy_stars {
    position: absolute;
    width: var(--size);
    height: var(--size);
    margin-left: calc(var(--size) / -2);
    top: calc(-1 * var(--size) - 10px);
    animation:
      sleepy_stars-travel var(--dur) linear var(--delay) both,
      sleepy_stars-fade var(--dur) linear var(--delay) both;
  }
  @keyframes sleepy_stars-travel {
    from { transform: translate(0, 0) scale(1); }
    to { transform: translate(var(--tx), var(--ty)) scale(1); }
  }
  @keyframes sleepy_stars-fade {
    0% { opacity: 0; }
    8% { opacity: var(--op); }
    72% { opacity: var(--op); }
    100% { opacity: 0; }
  }
  .sleepy_stars-sway {
    display: block;
    animation: sleepy_stars-sway var(--swaydur) ease-in-out calc(-1 * var(--swayphase)) infinite alternate;
  }
  @keyframes sleepy_stars-sway {
    from { transform: translateX(calc(-1 * var(--sway))); }
    to { transform: translateX(var(--sway)); }
  }
  .sleepy_stars-shape {
    display: block;
    animation: sleepy_stars-spin var(--dur) linear var(--delay) both;
  }
  @keyframes sleepy_stars-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(var(--rot)); }
  }

  /* ---- Rose throw (two-layer fountain from React Studio) ---- */
  /* layer 1: Petals */
  .rose_throw-l1 {
    position: absolute;
    width: var(--size);
    height: var(--size);
    margin-left: calc(var(--size) / -2);
    bottom: calc(-1 * var(--size) - 10px);
    --s0: 1;
    --s1: 1;
    animation:
      rose_throw-travel var(--dur) cubic-bezier(0.2, 0.7, 0.3, 1) var(--delay) both,
      rose_throw-in var(--indur) linear var(--delay) both,
      rose_throw-out var(--outdur) linear var(--outdelay) forwards;
  }
  .rose_throw-l1-shape {
    display: block;
    animation: rose_throw-spin var(--dur) linear var(--delay) both;
  }
  /* adaptive readability rim: light on dark themes, soft dark on light */
  :global([data-theme='dark']) .rose_throw-l1-shape {
    filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.6)) drop-shadow(0 0 var(--rim, 6px) rgba(255, 255, 255, 0.35));
  }
  :global([data-theme='light']) .rose_throw-l1-shape {
    filter: drop-shadow(0 0 var(--rim, 6px) rgba(40, 30, 30, 0.32));
  }
  /* layer 2: leaves */
  .rose_throw-l2 {
    position: absolute;
    width: var(--size);
    height: var(--size);
    margin-left: calc(var(--size) / -2);
    bottom: calc(-1 * var(--size) - 10px);
    --s0: 1;
    --s1: 1;
    animation:
      rose_throw-travel var(--dur) cubic-bezier(0.5, 0, 0.85, 0.3) var(--delay) both,
      rose_throw-in var(--indur) linear var(--delay) both,
      rose_throw-out var(--outdur) linear var(--outdelay) forwards;
  }
  .rose_throw-l2-shape {
    display: block;
    animation: rose_throw-spin var(--dur) linear var(--delay) both;
  }
  /* adaptive readability rim: light on dark themes, soft dark on light */
  :global([data-theme='dark']) .rose_throw-l2-shape {
    filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.6)) drop-shadow(0 0 var(--rim, 6px) rgba(255, 255, 255, 0.35));
  }
  :global([data-theme='light']) .rose_throw-l2-shape {
    filter: drop-shadow(0 0 var(--rim, 6px) rgba(40, 30, 30, 0.32));
  }
  @keyframes rose_throw-travel {
    from { transform: translate(0, 0) scale(var(--s0, 1)); }
    to { transform: translate(var(--tx), var(--ty)) scale(var(--s1, 1)); }
  }
  /* fade envelope: rise to --op over --indur, hold, fall over --outdur.
     rose_throw-out has NO backwards fill — rose_throw-in owns the early frames. */
  @keyframes rose_throw-in {
    from { opacity: 0; }
    to { opacity: var(--op); }
  }
  @keyframes rose_throw-out {
    from { opacity: var(--op); }
    to { opacity: 0; }
  }
  .rose_throw-arc {
    display: block;
    animation: rose_throw-arc var(--dur) linear var(--delay) both;
  }
  /* the arc: decelerate up (spending energy), tip over, accelerate down
     (gravity) — two easings on one property, composed with the X travel */
  @keyframes rose_throw-arc {
    0% { transform: translateY(0); animation-timing-function: cubic-bezier(0.16, 0.6, 0.44, 1); }
    45% { transform: translateY(calc(-1 * var(--apex))); animation-timing-function: cubic-bezier(0.55, 0, 0.83, 0.4); }
    100% { transform: translateY(14vh); }
  }
  .rose_throw-sway {
    display: block;
    animation: rose_throw-sway var(--swaydur) ease-in-out calc(-1 * var(--swayphase)) infinite alternate;
  }
  @keyframes rose_throw-sway {
    from { transform: translateX(calc(-1 * var(--sway))); }
    to { transform: translateX(var(--sway)); }
  }
  @keyframes rose_throw-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(var(--rot)); }
  }
</style>

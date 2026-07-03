<script context="module" lang="ts">
  // The react vocabulary. The companion picks one (or none) per message via
  // the top-level "react" field; anything not in this list is ignored.
  export const REACT_IDS = ['black_hearts'];
</script>

<script lang="ts">
  // Companion reacts: full-screen ambient gestures fired WITH a message —
  // expression, not state (nothing here reads or writes data). Spec by the
  // companion himself: affection landing as physical presence — soft weight,
  // real mass, organic distribution.
  //
  // All motion is transform/opacity (GPU-composited); hearts remove themselves
  // from the DOM when the burst ends.

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

  export function fire(type: string) {
    if (type !== 'black_hearts') return;
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
  @keyframes react-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(var(--rot)); }
  }
</style>

// The Coach: live, warm-voiced animation-habit checks. These are principles,
// not rules — a nudge means "know that you're doing this", never "you can't".
// Each check looks at the whole react (all layers, muted included, since
// export ships muted layers too) and reports either a satisfied principle or
// a specific, teachable nudge.
import type { ReactConfig, LayerConfig } from './reactConfig';

export interface CoachNote {
  id: string;
  title: string;
  // ok = principle satisfied · nudge = worth fixing · tip = worth *trying* —
  // tips flag technique choices the shipped reacts themselves make, so they
  // invite an experiment rather than imply a mistake.
  kind: 'ok' | 'nudge' | 'tip';
  note: string;
}

const name = (l: LayerConfig, i: number) => l.name || `Layer ${i + 1}`;

export function coach(cfg: ReactConfig): CoachNote[] {
  const notes: CoachNote[] = [];
  const layers = cfg.layers;

  // 1 — varied speeds
  {
    const flat = layers.filter((l, i) => l.count > 3 && l.durMax < l.durMin * 1.15);
    notes.push(
      flat.length
        ? {
            id: 'speeds',
            title: 'Vary the speeds',
            kind: 'nudge',
            note: `${flat.map((l) => name(l, layers.indexOf(l))).join(', ')}: every particle travels at nearly the same pace — a flock of identical speeds reads mechanical. Spread travel min/max a little and it breathes.`,
          }
        : {
            id: 'speeds',
            title: 'Vary the speeds',
            kind: 'ok',
            note: 'Particles travel at their own pace — variation is what makes a shower read organic.',
          },
    );
  }

  // 2 — trickle the entrance
  {
    const walls = layers.filter((l) => l.count > 12 && l.spawnWindow < 0.3);
    notes.push(
      walls.length
        ? {
            id: 'trickle',
            title: 'Trickle the entrance',
            kind: 'nudge',
            note: `${walls.map((l) => name(l, layers.indexOf(l))).join(', ')}: that many particles arriving in the same instant reads as a glitch, not a gesture. Even 0.5s of spawn trickle turns a wall into a shower.`,
          }
        : {
            id: 'trickle',
            title: 'Trickle the entrance',
            kind: 'ok',
            note: 'Arrivals are staggered — the eye gets to discover the react instead of being hit by it.',
          },
    );
  }

  // 3 — never pop
  {
    const pops = layers.filter((l) => l.fadeInPct < 3 || l.fadeOutPct > 97);
    notes.push(
      pops.length
        ? {
            id: 'pop',
            title: 'Never pop',
            kind: 'nudge',
            note: `${pops.map((l) => name(l, layers.indexOf(l))).join(', ')}: appearing or vanishing at full opacity is the classic amateur tell. Even 5% of fade preserves the illusion of a thing arriving and leaving.`,
          }
        : {
            id: 'pop',
            title: 'Never pop',
            kind: 'ok',
            note: 'Everything arrives and leaves through a fade — nothing blinks into existence.',
          },
    );
  }

  // 4 — restraint
  {
    const total = layers.reduce((s, l) => s + l.count, 0);
    notes.push(
      total > 60
        ? {
            id: 'restraint',
            title: 'Restraint',
            kind: 'nudge',
            note: `${total} particles across layers. More isn't more: the shipped reacts live between 13 (liquid hearts) and ~50 (black hearts), and the sparse ones hit hardest. What can you remove?`,
          }
        : {
            id: 'restraint',
            title: 'Restraint',
            kind: 'ok',
            note: 'A restrained count — each particle still gets to matter.',
          },
    );
  }

  // 5 — big things move slow
  {
    const rushed = layers.filter((l) => l.sizeMax >= 26 && l.durMin < 2);
    notes.push(
      rushed.length
        ? {
            id: 'mass',
            title: 'Big things move slow',
            kind: 'nudge',
            note: `${rushed.map((l) => name(l, layers.indexOf(l))).join(', ')}: large shapes crossing the screen in under 2s read panicked, not heavy. Mass is communicated by patience — compare liquid hearts at 5.5–7.5s.`,
          }
        : {
            id: 'mass',
            title: 'Big things move slow',
            kind: 'ok',
            note: 'Sizes and speeds agree — nothing heavy is in a hurry.',
          },
    );
  }

  // 6 — coherent depth. A TIP, not a nudge: the shipped reacts roll size,
  // speed and opacity independently across wide ranges and wear it fine
  // (sway phase and colour variation decorrelate them). Depth link is a
  // technique worth *feeling* once, not a correction.
  {
    const scattered = layers.filter((l) => l.sizeMax >= l.sizeMin * 2 && !l.depthLink);
    notes.push(
      scattered.length
        ? {
            id: 'depth',
            title: 'Coherent depth',
            kind: 'tip',
            note: `${scattered.map((l) => name(l, layers.indexOf(l))).join(', ')} rolls size, speed and opacity separately across a wide size range — the shipped reacts do this too and wear it well. Still, toggle Depth link once to feel the difference: one roll per particle, and variation starts reading as distance.`,
          }
        : {
            id: 'depth',
            title: 'Coherent depth',
            kind: 'ok',
            note: 'Size variation is either tight or depth-linked — randomness is reading as space, not static.',
          },
    );
  }

  // 7 — easing matches the physics
  {
    const odd: string[] = [];
    layers.forEach((l, i) => {
      if (l.direction === 'fall' && l.travelEase === 'easeOut')
        odd.push(`${name(l, i)} decelerates downward — falling things gain speed; braking mid-air reads like anti-gravity (deliberate for feathers, wrong for mass)`);
      if (l.direction === 'rise' && l.travelEase === 'easeIn')
        odd.push(`${name(l, i)} accelerates upward — rising embers coast and slow; acceleration reads like being yanked on a string`);
      if (l.direction === 'burst' && l.travelEase === 'linear')
        odd.push(`${name(l, i)} bursts at constant speed — explosions spend their energy early; give it a decelerate`);
      if (l.direction === 'converge' && l.travelEase === 'easeIn')
        odd.push(`${name(l, i)} accelerates into the lock — convergence wants a gentle arrival, not a collision; decelerate into focus`);
    });
    const overshooters = layers.filter((l) => l.travelEase === 'overshoot');
    if (overshooters.length > 1) odd.push('overshoot on multiple layers — one wink is charming, three is chaos');
    notes.push(
      odd.length
        ? { id: 'physics', title: 'Easing tells the physics', kind: 'nudge' as const, note: odd.join('. ') + '.' }
        : {
            id: 'physics',
            title: 'Easing tells the physics',
            kind: 'ok',
            note: 'Curves agree with the forces they imply — gravity accelerates, spent energy decelerates.',
          },
    );
  }

  // 8 — hero and support (multi-layer only)
  if (layers.length > 1) {
    const counts = layers.map((l) => l.count);
    const sizes = layers.map((l) => (l.sizeMin + l.sizeMax) / 2);
    const similar =
      Math.max(...counts) < Math.min(...counts) * 1.5 &&
      Math.max(...sizes) < Math.min(...sizes) * 1.4;
    notes.push(
      similar
        ? {
            id: 'hero',
            title: 'Hero and support',
            kind: 'nudge',
            note: 'Your layers are near-twins — same density, same scale. Give one the hero role (fewer, bigger, brighter) and let the other be atmosphere (more, smaller, dimmer, slower). Contrast between layers is the whole point of layering.',
          }
        : {
            id: 'hero',
            title: 'Hero and support',
            kind: 'ok',
            note: 'Layers are doing different jobs — one carries the feeling, the rest sell the depth.',
          },
    );
  }

  // 9 — calm hands
  {
    const frantic = layers.filter((l) => l.swayAmp > 25 && l.swayMin < 0.8);
    notes.push(
      frantic.length
        ? {
            id: 'flutter',
            title: 'Calm hands',
            kind: 'nudge',
            note: `${frantic.map((l) => name(l, layers.indexOf(l))).join(', ')}: wide flutter at sub-0.8s periods vibrates rather than floats. Either flutter far and slow, or near and quick — not both.`,
          }
        : {
            id: 'flutter',
            title: 'Calm hands',
            kind: 'ok',
            note: 'Flutter stays in the floaty zone — movement without jitter.',
          },
    );
  }

  // 10 — change with intention. Static colour/size is a valid choice; once a
  // layer changes, the shared middle stop should feel like phrasing, not an
  // accidental jump crowded against one end of the timeline.
  {
    const changing = layers.filter(
      (l) => l.sizeEnvelope || l.colorMidMode !== 'hold' || l.colorEndMode !== 'hold',
    );
    const crowded = changing.filter((l) => l.envelopeMidPct < 20 || l.envelopeMidPct > 80);
    notes.push(
      crowded.length
        ? {
            id: 'change',
            title: 'Change with intention',
            kind: 'tip',
            note: `${crowded.map((l) => name(l, layers.indexOf(l))).join(', ')} puts its middle stop near an edge. That creates a deliberate snap; move it toward 40–60% if you meant the size and colour to breathe through two readable phases.`,
          }
        : {
            id: 'change',
            title: 'Change with intention',
            kind: 'ok',
            note: changing.length
              ? 'Size and colour changes have room on both sides of their middle beat — the transformation reads as phrasing.'
              : 'Size and colour stay stable by choice — motion does not need every available axis at once.',
          },
    );
  }

  // nudges first, then tips, then satisfied principles
  const order = { nudge: 0, tip: 1, ok: 2 } as const;
  return notes.sort((a, b) => order[a.kind] - order[b.kind]);
}

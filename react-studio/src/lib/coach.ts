// The Coach: live, warm-voiced animation-habit checks. These are principles,
// not rules — a nudge means "know that you're doing this", never "you can't".
// Each check looks at the whole react (all layers, muted included, since
// export ships muted layers too) and reports either a satisfied principle or
// a specific, teachable nudge.
import type { ReactConfig, LayerConfig } from './reactConfig';

export interface CoachNote {
  id: string;
  title: string;
  ok: boolean;
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
            ok: false,
            note: `${flat.map((l) => name(l, layers.indexOf(l))).join(', ')}: every particle travels at nearly the same pace — a flock of identical speeds reads mechanical. Spread travel min/max a little and it breathes.`,
          }
        : {
            id: 'speeds',
            title: 'Vary the speeds',
            ok: true,
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
            ok: false,
            note: `${walls.map((l) => name(l, layers.indexOf(l))).join(', ')}: that many particles arriving in the same instant reads as a glitch, not a gesture. Even 0.5s of spawn trickle turns a wall into a shower.`,
          }
        : {
            id: 'trickle',
            title: 'Trickle the entrance',
            ok: true,
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
            ok: false,
            note: `${pops.map((l) => name(l, layers.indexOf(l))).join(', ')}: appearing or vanishing at full opacity is the classic amateur tell. Even 5% of fade preserves the illusion of a thing arriving and leaving.`,
          }
        : {
            id: 'pop',
            title: 'Never pop',
            ok: true,
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
            ok: false,
            note: `${total} particles across layers. More isn't more: the shipped reacts live between 13 (liquid hearts) and ~50 (black hearts), and the sparse ones hit hardest. What can you remove?`,
          }
        : {
            id: 'restraint',
            title: 'Restraint',
            ok: true,
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
            ok: false,
            note: `${rushed.map((l) => name(l, layers.indexOf(l))).join(', ')}: large shapes crossing the screen in under 2s read panicked, not heavy. Mass is communicated by patience — compare liquid hearts at 5.5–7.5s.`,
          }
        : {
            id: 'mass',
            title: 'Big things move slow',
            ok: true,
            note: 'Sizes and speeds agree — nothing heavy is in a hurry.',
          },
    );
  }

  // 6 — coherent depth
  {
    const scattered = layers.filter((l) => l.sizeMax >= l.sizeMin * 2 && !l.depthLink);
    notes.push(
      scattered.length
        ? {
            id: 'depth',
            title: 'Coherent depth',
            ok: false,
            note: `${scattered.map((l) => name(l, layers.indexOf(l))).join(', ')}: a wide size range with size, speed and opacity all rolled separately reads as noise. Try Depth link — one roll drives all three, and the variation becomes distance.`,
          }
        : {
            id: 'depth',
            title: 'Coherent depth',
            ok: true,
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
    });
    const overshooters = layers.filter((l) => l.travelEase === 'overshoot');
    if (overshooters.length > 1) odd.push('overshoot on multiple layers — one wink is charming, three is chaos');
    notes.push(
      odd.length
        ? { id: 'physics', title: 'Easing tells the physics', ok: false, note: odd.join('. ') + '.' }
        : {
            id: 'physics',
            title: 'Easing tells the physics',
            ok: true,
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
            ok: false,
            note: 'Your layers are near-twins — same density, same scale. Give one the hero role (fewer, bigger, brighter) and let the other be atmosphere (more, smaller, dimmer, slower). Contrast between layers is the whole point of layering.',
          }
        : {
            id: 'hero',
            title: 'Hero and support',
            ok: true,
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
            ok: false,
            note: `${frantic.map((l) => name(l, layers.indexOf(l))).join(', ')}: wide flutter at sub-0.8s periods vibrates rather than floats. Either flutter far and slow, or near and quick — not both.`,
          }
        : {
            id: 'flutter',
            title: 'Calm hands',
            ok: true,
            note: 'Flutter stays in the floaty zone — movement without jitter.',
          },
    );
  }

  // nudges first, then satisfied principles
  return [...notes.filter((n) => !n.ok), ...notes.filter((n) => n.ok)];
}

<script lang="ts">
  // 🐟 2D Fish Studio — Live Kinetic Stage, Canvas Physics & VFX Emitter System
  import { onMount, onDestroy } from 'svelte';
  import type { FishConfig, FishEmitterLayer, ParticleShape, WaterEnvironment } from './fishConfig';
  import { drawFish, type SocketPositions } from './fishDraw';

  export let config: FishConfig;

  let canvasEl: HTMLCanvasElement;
  let animId: number;
  let lastTime = performance.now();
  let elapsedTime = 0; // seconds

  // Studio Stage Modes & State
  let isSwimming = false; // false = Stationary Studio Reference Pose, true = Swim Path
  let isPlaying = true;
  let slowMo = false; // 0.25x slow motion
  let isScrubbing = false;
  let scrubValue = 0; // 0 to 10 seconds loop window
  let fps = 60;
  let activeParticleCount = 0;

  // Pond Substrate Environments
  let selectedEnv: WaterEnvironment = 'night_moonlit';

  const ENV_CONFIGS: Record<
    WaterEnvironment,
    { label: string; bg1: string; bg2: string; caustics: string; tint: string }
  > = {
    day_sunlit: {
      label: 'Day Sunlit Stream',
      bg1: '#1b4965',
      bg2: '#62b6cb',
      caustics: 'rgba(255, 255, 255, 0.18)',
      tint: 'rgba(230, 245, 255, 0.05)',
    },
    sunset_copper: {
      label: 'Sunset Copper Glow',
      bg1: '#3d1308',
      bg2: '#8a2806',
      caustics: 'rgba(255, 180, 100, 0.22)',
      tint: 'rgba(255, 150, 80, 0.08)',
    },
    night_moonlit: {
      label: 'Night Moonlit Deep',
      bg1: '#03071e',
      bg2: '#0b132b',
      caustics: 'rgba(112, 214, 255, 0.12)',
      tint: 'rgba(100, 180, 255, 0.04)',
    },
    foggy_mist: {
      label: 'Foggy Mist Mere',
      bg1: '#1f2421',
      bg2: '#36382e',
      caustics: 'rgba(220, 230, 220, 0.14)',
      tint: 'rgba(200, 220, 200, 0.06)',
    },
    subterranean_cave: {
      label: 'Subterranean Cave',
      bg1: '#080708',
      bg2: '#1a0b2e',
      caustics: 'rgba(200, 100, 255, 0.15)',
      tint: 'rgba(180, 80, 240, 0.06)',
    },
  };

  // VFX Particle Simulation Models
  interface ActiveParticle {
    layerId: string;
    shape: ParticleShape;
    x: number;
    y: number;
    vx: number;
    vy: number;
    orbitAngle: number;
    orbitRadius: number;
    orbitSpeed: number;
    createdAt: number;
    lifespan: number;
    sizeStart: number;
    sizeMid: number;
    sizeEnd: number;
    colorStart: string;
    colorMid: string;
    colorEnd: string;
    alphaStart: number;
    alphaMid: number;
    alphaEnd: number;
    midStopPct: number;
    rot: number;
    rotSpeed: number;
  }

  let particles: ActiveParticle[] = [];
  const spawnAccumulators: Record<string, number> = {};

  // Parse color and alpha helper
  function hexToRgb(hex: string): [number, number, number] {
    if (!hex || typeof hex !== 'string') return [255, 255, 255];
    const clean = hex.replace('#', '');
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16),
      ];
    }
    if (clean.length < 6) return [255, 255, 255];
    return [
      parseInt(clean.substring(0, 2), 16),
      parseInt(clean.substring(2, 4), 16),
      parseInt(clean.substring(4, 6), 16),
    ];
  }

  function lerpColor(c1: string, c2: string, t: number): [number, number, number] {
    const rgb1 = hexToRgb(c1);
    const rgb2 = hexToRgb(c2);
    return [
      Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t),
      Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t),
      Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t),
    ];
  }

  function spawnParticles(sockets: SocketPositions, dt: number) {
    if (!isPlaying && !isScrubbing) return;

    for (const emitter of config.emitters) {
      if (!emitter.enabled) continue;

      const layerId = emitter.id;
      const effectiveRate = Math.max(emitter.spawnRate, emitter.count * 0.7);
      spawnAccumulators[layerId] = (spawnAccumulators[layerId] || 0) + effectiveRate * dt;

      while (spawnAccumulators[layerId] >= 1.0) {
        spawnAccumulators[layerId] -= 1.0;

        // Current count limit
        const activeForLayer = particles.filter((p) => p.layerId === layerId).length;
        if (activeForLayer >= emitter.count) break;

        // Determine socket anchor position & initial velocity
        let anchorX = 0;
        let anchorY = 0;
        let vx = 0;
        let vy = 0;
        const spd = emitter.speed * (0.6 + Math.random() * 0.8);

        switch (emitter.socket) {
          case 'orbital_ring':
            anchorX = sockets.orbital_ring.x;
            anchorY = sockets.orbital_ring.y;
            break;

          case 'dorsal_crest': {
            const list = sockets.dorsal_crest && sockets.dorsal_crest.length ? sockets.dorsal_crest : [sockets.orbital_ring];
            const pt = list[Math.floor(Math.random() * list.length)];
            anchorX = pt.x + (Math.random() - 0.5) * 8;
            anchorY = pt.y + (Math.random() - 0.5) * 6;
            // Float gently upwards and outwards
            vx = (Math.random() - 0.5) * (spd * 0.4) + (Math.random() - 0.5) * emitter.turbulence;
            vy = -(spd * (0.4 + Math.random() * 0.5));
            break;
          }

          case 'fin_tips': {
            const list = sockets.fin_tips && sockets.fin_tips.length ? sockets.fin_tips : [sockets.orbital_ring];
            const pt = list[Math.floor(Math.random() * list.length)];
            anchorX = pt.x + (Math.random() - 0.5) * 4;
            anchorY = pt.y + (Math.random() - 0.5) * 4;
            // Radiate outwards from fin tip angle
            const emitAng = pt.angle + (Math.random() - 0.5) * 0.8;
            vx = Math.cos(emitAng) * spd * 0.6 + (Math.random() - 0.5) * emitter.turbulence;
            vy = Math.sin(emitAng) * spd * 0.6 + (Math.random() - 0.5) * emitter.turbulence;
            break;
          }

          case 'halo_crown': {
            const crown = sockets.halo_crown || sockets.orbital_ring;
            const haloAngle = Math.random() * Math.PI * 2;
            const dist = 6 + Math.random() * 14;
            anchorX = crown.x + Math.cos(haloAngle) * dist;
            anchorY = crown.y + Math.sin(haloAngle) * dist;
            vx = Math.cos(haloAngle) * (spd * 0.5);
            vy = Math.sin(haloAngle) * (spd * 0.5);
            break;
          }

          case 'submerged_aura':
          default: {
            const aura = sockets.submerged_aura || sockets.orbital_ring;
            anchorX = aura.x + (Math.random() - 0.5) * 70;
            anchorY = aura.y + (Math.random() - 0.5) * 40;
            vx = (Math.random() - 0.5) * (spd * 0.4);
            vy = (Math.random() - 0.5) * (spd * 0.4);
            break;
          }
        }

        const lifespan = emitter.lifeMin + Math.random() * (emitter.lifeMax - emitter.lifeMin);

        particles.push({
          layerId,
          shape: emitter.shape,
          x: anchorX,
          y: anchorY,
          vx,
          vy,
          orbitAngle: Math.random() * Math.PI * 2,
          orbitRadius: emitter.radialExpansion * (0.5 + Math.random() * 0.7),
          orbitSpeed: emitter.orbitSpeed,
          createdAt: elapsedTime,
          lifespan,
          sizeStart: emitter.sizeStart,
          sizeMid: emitter.sizeMid,
          sizeEnd: emitter.sizeEnd,
          colorStart: emitter.colorStart,
          colorMid: emitter.colorMid,
          colorEnd: emitter.colorEnd,
          alphaStart: emitter.alphaStart,
          alphaMid: emitter.alphaMid,
          alphaEnd: emitter.alphaEnd,
          midStopPct: emitter.midStopPct / 100,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 4,
        });
      }
    }
  }

  function updateAndDrawParticles(ctx: CanvasRenderingContext2D, dt: number, socketCenter: { x: number; y: number }) {
    const nextParticles: ActiveParticle[] = [];
    const layerCounts: Record<string, number> = {};

    for (const p of particles) {
      // Live dynamic lookup from emitter config
      const liveEmitter = config.emitters.find((e) => e.id === p.layerId);
      // Instantly remove particles if emitter is disabled or deleted!
      if (!liveEmitter || !liveEmitter.enabled) continue;

      // Enforce live count limit immediately (prunes excess instantly on slider decrease)
      layerCounts[p.layerId] = (layerCounts[p.layerId] || 0) + 1;
      if (layerCounts[p.layerId] > liveEmitter.count) continue;

      const age = elapsedTime - p.createdAt;
      if (age >= p.lifespan) continue;

      const progress = Math.min(1.0, age / p.lifespan);

      // Motion physics: orbital revolving vs directional emission
      if (liveEmitter.socket === 'orbital_ring') {
        p.orbitAngle += (liveEmitter.orbitSpeed || 1.2) * dt;
        const rad = liveEmitter.radialExpansion || 35;
        p.x = socketCenter.x + Math.cos(p.orbitAngle) * rad;
        p.y = socketCenter.y + Math.sin(p.orbitAngle) * (rad * 0.65);
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.98;
        p.vy *= 0.98;
      }
      p.rot += p.rotSpeed * dt;

      // Dynamic color and size evaluation
      const colStart = liveEmitter.colorStart;
      const colMid = liveEmitter.colorMid;
      const colEnd = liveEmitter.colorEnd;
      const midPct = liveEmitter.midStopPct / 100;

      const szMid = liveEmitter.sizeMid;
      const szStart = Math.max(1, szMid * 0.4);
      const szEnd = Math.max(1, szMid * 0.25);

      let currentSize = szStart;
      let currentAlpha = p.alphaStart;
      let rgb = hexToRgb(colStart);

      if (progress < midPct) {
        const t = progress / Math.max(0.01, midPct);
        currentSize = szStart + (szMid - szStart) * t;
        currentAlpha = p.alphaStart + (p.alphaMid - p.alphaStart) * t;
        rgb = lerpColor(colStart, colMid, t);
      } else {
        const t = (progress - midPct) / Math.max(0.01, 1.0 - midPct);
        currentSize = szMid + (szEnd - szMid) * t;
        currentAlpha = p.alphaMid + (p.alphaEnd - p.alphaMid) * t;
        rgb = lerpColor(colMid, colEnd, t);
      }

      const colStr = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

      // Determine Glow Color & Intensity (React Studio Convention)
      const glowMode = liveEmitter.glowMode || 'follow';
      const glowBlur = liveEmitter.glowBlur ?? 10;
      let glowRgb = rgb;

      if (glowMode === 'fixed') {
        glowRgb = hexToRgb(liveEmitter.glowColor || colStart);
      } else if (glowMode === 'envelope') {
        const gStart = liveEmitter.glowColorStart || colStart;
        const gMid = liveEmitter.glowColorMid || colMid;
        const gEnd = liveEmitter.glowColorEnd || colEnd;
        if (progress < midPct) {
          const t = progress / Math.max(0.01, midPct);
          glowRgb = lerpColor(gStart, gMid, t);
        } else {
          const t = (progress - midPct) / Math.max(0.01, 1.0 - midPct);
          glowRgb = lerpColor(gMid, gEnd, t);
        }
      }

      const glowStr = `rgb(${glowRgb[0]}, ${glowRgb[1]}, ${glowRgb[2]})`;

      // Render Particle with live shape, vibrant fill, stroke and glow
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, currentAlpha));
      ctx.fillStyle = colStr;
      ctx.strokeStyle = colStr;
      ctx.lineWidth = 1.5;

      if (glowMode !== 'none' && glowBlur > 0) {
        ctx.shadowColor = glowStr;
        ctx.shadowBlur = glowBlur;
      } else {
        ctx.shadowBlur = 0;
      }

      drawParticleShape(ctx, liveEmitter.shape || p.shape, currentSize);
      ctx.restore();

      nextParticles.push(p);
    }

    particles = nextParticles;
    activeParticleCount = particles.length;
  }

  function drawParticleShape(ctx: CanvasRenderingContext2D, shape: ParticleShape, sz: number) {
    const s = Math.max(1, sz);
    ctx.beginPath();

    switch (shape) {
      case 'snowflake': {
        // 6-arm symmetrical branched crystalline snowflake
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          ctx.moveTo(0, 0);
          ctx.lineTo(cos * s, sin * s);

          // Sub-branches (chevrons)
          const bDist = s * 0.55;
          const bLen = s * 0.35;
          const bx = cos * bDist;
          const by = sin * bDist;
          const ba1 = a + Math.PI / 4;
          const ba2 = a - Math.PI / 4;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(ba1) * bLen, by + Math.sin(ba1) * bLen);
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(ba2) * bLen, by + Math.sin(ba2) * bLen);
        }
        ctx.stroke();
        return;
      }

      case 'star':
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5 - Math.PI * 0.5;
          const ai = a + Math.PI / 5;
          if (i === 0) ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
          else ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
          ctx.lineTo(Math.cos(ai) * (s * 0.4), Math.sin(ai) * (s * 0.4));
        }
        ctx.closePath();
        break;

      case 'petal':
        ctx.ellipse(0, 0, s * 1.3, s * 0.65, 0, 0, Math.PI * 2);
        break;

      case 'diamond_crystal':
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.65, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.65, 0);
        ctx.closePath();
        break;

      case 'ice_shard':
        ctx.moveTo(0, -s * 1.4);
        ctx.lineTo(s * 0.45, -s * 0.2);
        ctx.lineTo(s * 0.2, s * 1.2);
        ctx.lineTo(-s * 0.35, 0);
        ctx.closePath();
        break;

      case 'smoke_puff':
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        break;

      case 'bubble':
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.stroke();
        return;

      case 'lunar_mote':
        ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
        break;

      case 'sparkle':
      default:
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(0, 0, s, 0);
        ctx.quadraticCurveTo(0, 0, 0, s);
        ctx.quadraticCurveTo(0, 0, -s, 0);
        ctx.quadraticCurveTo(0, 0, 0, -s);
        ctx.closePath();
        break;
    }

    ctx.fill();
  }

  // Draw Clean Static Pond Substrate (Zero moving animated caustics)
  function drawPondEnvironment(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
    const env = ENV_CONFIGS[selectedEnv];

    // Calm, static studio ambient radial gradient
    const bgGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      width * 0.08,
      width * 0.5,
      height * 0.5,
      width * 0.65,
    );
    bgGrad.addColorStop(0, env.bg2);
    bgGrad.addColorStop(1, env.bg1);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
  }

  // Main Render Loop
  function loop(now: number) {
    animId = requestAnimationFrame(loop);

    const rawDt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    fps = Math.round(1 / Math.max(0.001, rawDt));

    const timeScale = isScrubbing ? 0 : slowMo ? 0.25 : 1.0;
    if (isPlaying && !isScrubbing) {
      elapsedTime += rawDt * timeScale;
      scrubValue = elapsedTime % 10.0;
    } else if (isScrubbing) {
      elapsedTime = scrubValue;
    }

    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const rect = canvasEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (canvasEl.width !== rect.width * dpr || canvasEl.height !== rect.height * dpr) {
      canvasEl.width = rect.width * dpr;
      canvasEl.height = rect.height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // 1. Render Pond Substrate & Water
    drawPondEnvironment(ctx, width, height, elapsedTime);

    // 2. Determine Fish Position & Rotation (Swim Path vs Inspect Mode)
    let fishX = width * 0.5;
    let fishY = height * 0.5;
    let fishRotation = 0;

    if (isSwimming) {
      // Bézier Figure-8 Path: x = A*sin(t), y = B*sin(2t)
      const swimOmega = 0.55;
      const pathScaleX = Math.min(width * 0.32, 220);
      const pathScaleY = Math.min(height * 0.26, 140);
      const t = elapsedTime * swimOmega;

      fishX = width * 0.5 + Math.sin(t) * pathScaleX;
      fishY = height * 0.5 + Math.sin(2 * t) * pathScaleY;

      // Trajectory tangent derivative: dx/dt = cos(t)*A, dy/dt = 2*cos(2t)*B
      const dx = Math.cos(t) * pathScaleX;
      const dy = 2 * Math.cos(2 * t) * pathScaleY;
      fishRotation = Math.atan2(dy, dx);
    } else {
      // Fixed stationary centered reference pose
      fishX = width * 0.5;
      fishY = height * 0.5;
      fishRotation = 0;
    }

    // 3. Draw Fish Anatomy & Compute Sockets
    const sockets = drawFish(ctx, config, elapsedTime, isSwimming, fishX, fishY, fishRotation);

    // 4. Spawn & Render Particle VFX
    spawnParticles(sockets, rawDt * timeScale);
    updateAndDrawParticles(ctx, rawDt * timeScale, sockets.orbital_ring);

    ctx.restore();
  }

  onMount(() => {
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  });

  onDestroy(() => {
    if (animId) cancelAnimationFrame(animId);
  });

  function togglePlay() {
    isPlaying = !isPlaying;
  }

  function toggleSlowMo() {
    slowMo = !slowMo;
  }

  function toggleSwimMode() {
    isSwimming = !isSwimming;
  }

  function onScrubInput(e: Event) {
    const val = Number((e.target as HTMLInputElement).value);
    scrubValue = val;
    isScrubbing = true;
  }

  function onScrubEnd() {
    isScrubbing = false;
  }
</script>

<div class="fish-canvas-stage">
  <!-- Top Stage Controls -->
  <div class="stage-header">
    <div class="mode-toggles">
      <button
        class="stage-btn"
        class:active={isSwimming}
        on:click={toggleSwimMode}
        title="Toggle Swimming Path vs Stationary Inspect"
      >
        {isSwimming ? '🏊 Swim (Figure-8)' : '🔍 Inspect (Hold)'}
      </button>

      <button
        class="stage-btn"
        class:active={slowMo}
        on:click={toggleSlowMo}
        title="¼x Slow-Motion Study Mode"
      >
        ¼× Slow-Mo
      </button>

      <button
        class="stage-btn"
        on:click={togglePlay}
        title={isPlaying ? 'Pause Stage' : 'Play Stage'}
      >
        {isPlaying ? '⏸ Pause' : '▶ Play'}
      </button>
    </div>

    <!-- Pond Environment Switcher -->
    <div class="env-picker">
      <span class="env-label">Pond:</span>
      <select bind:value={selectedEnv} class="env-select">
        {#each Object.entries(ENV_CONFIGS) as [key, env]}
          <option value={key}>{env.label}</option>
        {/each}
      </select>
    </div>

    <!-- Live Performance Stats -->
    <div class="stage-stats">
      <span class="stat-pill">{fps} FPS</span>
      <span class="stat-pill">{activeParticleCount} particles</span>
    </div>
  </div>

  <!-- Interactive Canvas Viewport -->
  <div class="canvas-wrapper">
    <canvas bind:this={canvasEl} class="canvas-render"></canvas>
  </div>

  <!-- Bottom Timeline Scrubber -->
  <div class="stage-scrubber">
    <span class="scrub-label">Freeze / Scrub:</span>
    <input
      type="range"
      min="0"
      max="10"
      step="0.05"
      value={scrubValue}
      on:input={onScrubInput}
      on:change={onScrubEnd}
      class="scrub-slider"
    />
    <span class="scrub-time">{scrubValue.toFixed(2)}s</span>
  </div>
</div>

<style>
  .fish-canvas-stage {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    position: relative;
  }

  .stage-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--surface-1, rgba(0, 0, 0, 0.2));
    border-bottom: 1px solid var(--hairline, var(--border));
    gap: 12px;
    flex-wrap: wrap;
  }

  .mode-toggles {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stage-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .stage-btn:hover {
    border-color: var(--signal);
    color: var(--text);
  }

  .stage-btn.active {
    background: var(--signal);
    color: var(--signal-contrast, #000);
    border-color: var(--signal);
    box-shadow: 0 0 8px var(--signal-glow, rgba(112, 214, 255, 0.4));
  }

  .env-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-dim);
  }

  .env-select {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 11.5px;
    cursor: pointer;
  }

  .stage-stats {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-pill {
    background: rgba(0, 0, 0, 0.35);
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 10.5px;
    color: var(--text-dim);
    border: 1px solid var(--hairline, var(--border));
    font-family: ui-monospace, Menlo, Consolas, monospace;
  }

  .canvas-wrapper {
    flex: 1 1 auto;
    min-height: 280px;
    width: 100%;
    position: relative;
    overflow: hidden;
  }

  .canvas-render {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .stage-scrubber {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    background: var(--surface-1, rgba(0, 0, 0, 0.15));
    border-top: 1px solid var(--hairline, var(--border));
    font-size: 11.5px;
    color: var(--text-dim);
  }

  .scrub-slider {
    flex: 1 1 auto;
    accent-color: var(--signal);
    cursor: pointer;
  }

  .scrub-time {
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 11px;
    color: var(--text-2);
    min-width: 40px;
    text-align: right;
  }
</style>

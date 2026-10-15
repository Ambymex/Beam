// 🐟 2D Fish Studio — Procedural Top-Down Koi Drawing Engine & Kinematics

import type {
  FishConfig,
  FinSweep,
  TailMode,
  CrownSpotType,
  ParticleSocket,
} from './fishConfig';

export interface SpinePoint {
  x: number;
  y: number;
  angle: number;
  normalX: number;
  normalY: number;
  halfWidth: number;
}

export interface SocketPositions {
  orbital_ring: { x: number; y: number; angle: number };
  dorsal_crest: { x: number; y: number; angle: number }[];
  fin_tips: { x: number; y: number; angle: number }[];
  halo_crown: { x: number; y: number; angle: number };
  submerged_aura: { x: number; y: number; angle: number };
}

// Compute pulse energy multiplier based on wave mode and elapsed time (seconds)
export function computePulseEnergy(
  energy: number,
  wave: string,
  speed: number,
  time: number,
): number {
  if (energy <= 0.01) return 0;
  const t = time * speed;
  let mult = 1.0;
  switch (wave) {
    case 'sine_heartbeat': {
      const s = Math.sin(t * Math.PI * 2);
      // Double beat bump
      mult = 0.8 + 0.4 * Math.max(0, Math.sin(t * Math.PI * 4)) * (s > 0 ? 1 : 0.3);
      break;
    }
    case 'lunar_breath':
      mult = 0.65 + 0.35 * Math.sin(t * Math.PI);
      break;
    case 'static_crackling':
      mult = 0.75 + 0.35 * ((Math.sin(t * 18.3) * Math.cos(t * 31.7) + 1) * 0.5);
      break;
    case 'aurora_shimmer':
      mult = 0.7 + 0.3 * (Math.sin(t * 1.5) * 0.5 + Math.sin(t * 3.7) * 0.5);
      break;
    case 'static':
    default:
      mult = 1.0;
      break;
  }
  return energy * mult;
}

// Pseudorandom generator seeded for repeatable organic markings
function pseudoRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Calculate the 12 vertebrae positions along the fish spine
export function computeSpine(
  config: FishConfig,
  time: number,
  isSwimming: boolean,
  swimSpeed: number = 1.0,
): SpinePoint[] {
  const { length, headWidth, bodyWidth, tailWidth } = config.body;
  const { swaySpeed, wavePropagation, tipWhipAmp } = config.tail;

  const numVertebrae = 14;
  const segLength = length / (numVertebrae - 1);
  const spine: SpinePoint[] = [];

  // Rigid reference spine (motionless mesh for pure VFX evaluation)
  let currX = 0;
  let currY = 0;
  let currAngle = Math.PI; // Tangent points backwards along -X from head to tail

  for (let i = 0; i < numVertebrae; i++) {
    const fraction = i / (numVertebrae - 1); // 0 (nose) -> 1 (tail base)

    if (i === 0) {
      currX = 0;
      currY = 0;
      currAngle = Math.PI;
    } else {
      // Step backwards along spine with straight reference alignment
      currX -= segLength;
      currY = 0;
      currAngle = Math.PI;
    }

    // Width envelope profile: Nose -> Head -> Swell -> Peduncle -> Tail Base
    let hw = bodyWidth * 0.5;
    if (fraction < 0.18) {
      // Nose to head
      const t = fraction / 0.18;
      hw = (headWidth * 0.5) * (0.4 + 0.6 * Math.sin(t * Math.PI * 0.5));
    } else if (fraction < 0.45) {
      // Head to mid swell
      const t = (fraction - 0.18) / (0.45 - 0.18);
      hw = (headWidth * 0.5) + ((bodyWidth - headWidth) * 0.5) * Math.sin(t * Math.PI * 0.5);
    } else {
      // Mid swell down to peduncle
      const t = (fraction - 0.45) / (1.0 - 0.45);
      hw = (bodyWidth * 0.5) - ((bodyWidth - tailWidth) * 0.5) * Math.pow(t, 0.85);
    }

    const normAngle = currAngle + Math.PI * 0.5;
    spine.push({
      x: currX,
      y: currY,
      angle: currAngle,
      normalX: Math.cos(normAngle),
      normalY: Math.sin(normAngle),
      halfWidth: Math.max(3, hw),
    });
  }

  return spine;
}

// Render complete Top-Down Koi to an HTML5 Canvas Context
export function drawFish(
  ctx: CanvasRenderingContext2D,
  config: FishConfig,
  time: number,
  isSwimming: boolean,
  originX: number,
  originY: number,
  rotation: number = 0,
): SocketPositions {
  ctx.save();
  ctx.translate(originX, originY);
  ctx.rotate(rotation);

  const spine = computeSpine(config, time, isSwimming);
  const pulseEnergy = computePulseEnergy(
    config.emission.energy,
    config.emission.pulseWave,
    config.emission.pulseSpeed,
    time,
  );

  // 1. Water Drop Shadow
  drawFishShadow(ctx, config, spine);

  // 2. Subsurface Underbelly Glow (if emission is active)
  if (pulseEnergy > 0.05) {
    drawSubsurfaceAura(ctx, config, spine, pulseEnergy);
  }

  // 3. Pelvic & Pectoral Fins (under body)
  const finTipPositions = drawFins(ctx, config, spine, time, isSwimming);

  // 4. Caudal Tail (attached to last spine segment)
  const tailTipPos = drawTail(ctx, config, spine, time, isSwimming);

  // 5. Body Core (Base Gradient + Hull Outline)
  drawBodyCore(ctx, config, spine);

  // 6. Dorsal Ridge & Procedural Markings
  drawDorsalMarkings(ctx, config, spine, pulseEnergy);

  // 7. Head Features (Eyes, Whiskers, Crown Spot)
  const crownPos = drawHeadFeatures(ctx, config, spine, time, pulseEnergy, isSwimming);

  // 8. Bioluminescent Rim & Spine Highlights
  if (pulseEnergy > 0.1) {
    drawEmissionGlow(ctx, config, spine, pulseEnergy);
  }

  ctx.restore();

  // Compute Socket Positions in world coordinates
  const midSpine = spine[Math.floor(spine.length * 0.4)];
  const headSpine = spine[0];

  const transformPoint = (localX: number, localY: number, localAngle: number) => {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      x: originX + (localX * cos - localY * sin),
      y: originY + (localX * sin + localY * cos),
      angle: localAngle + rotation,
    };
  };

  const crestSockets = [spine[2], spine[4], spine[6], spine[8]].map((pt) =>
    transformPoint(pt.x, pt.y, pt.angle),
  );

  const allFinTips = [...finTipPositions, tailTipPos].map((pt) =>
    transformPoint(pt.x, pt.y, pt.angle),
  );

  return {
    orbital_ring: transformPoint(midSpine.x, midSpine.y, midSpine.angle),
    dorsal_crest: crestSockets,
    fin_tips: allFinTips,
    halo_crown: transformPoint(crownPos.x, crownPos.y, crownPos.angle),
    submerged_aura: transformPoint(midSpine.x, midSpine.y, midSpine.angle),
  };
}

// 1. Shadow beneath the fish for realistic aquatic depth
function drawFishShadow(
  ctx: CanvasRenderingContext2D,
  config: FishConfig,
  spine: SpinePoint[],
) {
  ctx.save();
  ctx.translate(10, 16); // Water depth offset
  ctx.shadowColor = config.body.shadowColor;
  ctx.shadowBlur = config.body.shadowBlur;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';

  buildBodyPath(ctx, config, spine);
  ctx.fill();
  ctx.restore();
}

// 2. Soft Subsurface Aura
function drawSubsurfaceAura(
  ctx: CanvasRenderingContext2D,
  config: FishConfig,
  spine: SpinePoint[],
  pulseEnergy: number,
) {
  ctx.save();
  ctx.shadowColor = config.emission.color;
  ctx.shadowBlur = 18 * Math.min(2.5, pulseEnergy);
  ctx.strokeStyle = config.body.underbellyColor;
  ctx.lineWidth = config.body.underbellyWidth + 4;
  ctx.globalAlpha = 0.4 * Math.min(1.0, pulseEnergy);

  buildBodyPath(ctx, config, spine);
  ctx.stroke();
  ctx.restore();
}

// Build smooth Bézier hull path around spine
function buildBodyPath(
  ctx: CanvasRenderingContext2D,
  config: FishConfig,
  spine: SpinePoint[],
) {
  ctx.beginPath();
  const leftPts: { x: number; y: number }[] = [];
  const rightPts: { x: number; y: number }[] = [];

  for (let i = 0; i < spine.length; i++) {
    const pt = spine[i];
    leftPts.push({
      x: pt.x + pt.normalX * pt.halfWidth,
      y: pt.y + pt.normalY * pt.halfWidth,
    });
    rightPts.push({
      x: pt.x - pt.normalX * pt.halfWidth,
      y: pt.y - pt.normalY * pt.halfWidth,
    });
  }

  // Start at snout nose
  const nose = spine[0];
  const noseTip = {
    x: nose.x + Math.cos(nose.angle) * (config.body.headWidth * 0.35 * config.body.noseRoundness),
    y: nose.y + Math.sin(nose.angle) * (config.body.headWidth * 0.35 * config.body.noseRoundness),
  };

  ctx.moveTo(noseTip.x, noseTip.y);

  // Curve along left side
  for (let i = 0; i < leftPts.length - 1; i++) {
    const xc = (leftPts[i].x + leftPts[i + 1].x) * 0.5;
    const yc = (leftPts[i].y + leftPts[i + 1].y) * 0.5;
    ctx.quadraticCurveTo(leftPts[i].x, leftPts[i].y, xc, yc);
  }
  const lastLeft = leftPts[leftPts.length - 1];
  ctx.lineTo(lastLeft.x, lastLeft.y);

  // Connect at tail base
  const lastRight = rightPts[rightPts.length - 1];
  ctx.lineTo(lastRight.x, lastRight.y);

  // Curve back along right side
  for (let i = rightPts.length - 1; i > 0; i--) {
    const xc = (rightPts[i].x + rightPts[i - 1].x) * 0.5;
    const yc = (rightPts[i].y + rightPts[i - 1].y) * 0.5;
    ctx.quadraticCurveTo(rightPts[i].x, rightPts[i].y, xc, yc);
  }

  // Close back to nose
  ctx.quadraticCurveTo(rightPts[0].x, rightPts[0].y, noseTip.x, noseTip.y);
  ctx.closePath();
}

// 3. Draw Fins with harmonic flutter kinematics
function drawFins(
  ctx: CanvasRenderingContext2D,
  config: FishConfig,
  spine: SpinePoint[],
  time: number,
  isSwimming: boolean,
): { x: number; y: number; angle: number }[] {
  const {
    pectoralLength,
    pectoralWidth,
    pectoralSpread,
    sweep,
    finColor,
    finAccentColor,
    ribCount,
    transparency,
    flutterFreq,
    flutterAmp,
    flutterPhaseLag,
  } = config.fins;

  const tipPositions: { x: number; y: number; angle: number }[] = [];

  // Pectoral Fin Attachment at Spine Segment 2
  const pecSpine = spine[2];
  const leftFlutter = 0;
  const rightFlutter = 0;

  // Draw Left Pectoral Fin
  ctx.save();
  const leftX = pecSpine.x + pecSpine.normalX * pecSpine.halfWidth;
  const leftY = pecSpine.y + pecSpine.normalY * pecSpine.halfWidth;
  const leftBaseAngle = pecSpine.angle + Math.PI * 0.5 - (pectoralSpread * Math.PI / 180);
  const leftTip = drawSingleFin(
    ctx,
    leftX,
    leftY,
    leftBaseAngle + leftFlutter,
    pectoralLength,
    pectoralWidth,
    sweep,
    finColor,
    finAccentColor,
    ribCount,
    transparency,
    1,
  );
  tipPositions.push(leftTip);
  ctx.restore();

  // Draw Right Pectoral Fin
  ctx.save();
  const rightX = pecSpine.x - pecSpine.normalX * pecSpine.halfWidth;
  const rightY = pecSpine.y - pecSpine.normalY * pecSpine.halfWidth;
  const rightBaseAngle = pecSpine.angle - Math.PI * 0.5 + (pectoralSpread * Math.PI / 180);
  const rightTip = drawSingleFin(
    ctx,
    rightX,
    rightY,
    rightBaseAngle - rightFlutter,
    pectoralLength,
    pectoralWidth,
    sweep,
    finColor,
    finAccentColor,
    ribCount,
    transparency,
    -1,
  );
  tipPositions.push(rightTip);
  ctx.restore();

  // Pelvic Fins at Spine Segment 7 (Smaller rear fins)
  const pelSpine = spine[7];
  const pelLength = pectoralLength * 0.55;
  const pelWidth = pectoralWidth * 0.5;

  ctx.save();
  const pelLeftX = pelSpine.x + pelSpine.normalX * pelSpine.halfWidth;
  const pelLeftY = pelSpine.y + pelSpine.normalY * pelSpine.halfWidth;
  drawSingleFin(
    ctx,
    pelLeftX,
    pelLeftY,
    pelSpine.angle + Math.PI * 0.4 + leftFlutter * 0.5,
    pelLength,
    pelWidth,
    'rounded',
    finColor,
    finAccentColor,
    Math.max(2, ribCount - 2),
    transparency,
    1,
  );
  ctx.restore();

  ctx.save();
  const pelRightX = pelSpine.x - pelSpine.normalX * pelSpine.halfWidth;
  const pelRightY = pelSpine.y - pelSpine.normalY * pelSpine.halfWidth;
  drawSingleFin(
    ctx,
    pelRightX,
    pelRightY,
    pelSpine.angle - Math.PI * 0.4 - rightFlutter * 0.5,
    pelLength,
    pelWidth,
    'rounded',
    finColor,
    finAccentColor,
    Math.max(2, ribCount - 2),
    transparency,
    -1,
  );
  ctx.restore();

  return tipPositions;
}

// Helper to draw an individual pectoral or pelvic fin
function drawSingleFin(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  angle: number,
  len: number,
  wid: number,
  sweep: FinSweep,
  color: string,
  accentColor: string,
  ribs: number,
  transparency: number,
  side: number,
): { x: number; y: number; angle: number } {
  ctx.translate(startX, startY);
  ctx.rotate(angle);
  ctx.globalAlpha = transparency;

  const grad = ctx.createLinearGradient(0, 0, len, wid * 0.5 * side);
  grad.addColorStop(0, color);
  grad.addColorStop(0.7, accentColor);
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.2)');
  ctx.fillStyle = grad;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(0, 0);

  let tipX = len;
  let tipY = wid * 0.3 * side;

  switch (sweep) {
    case 'pointed':
      ctx.quadraticCurveTo(len * 0.4, -wid * 0.2 * side, len, wid * 0.2 * side);
      ctx.quadraticCurveTo(len * 0.6, wid * 0.8 * side, 0, wid * 0.3 * side);
      tipX = len;
      tipY = wid * 0.2 * side;
      break;

    case 'scalloped':
      ctx.quadraticCurveTo(len * 0.5, -wid * 0.1 * side, len * 0.85, wid * 0.1 * side);
      ctx.lineTo(len, wid * 0.35 * side);
      ctx.lineTo(len * 0.85, wid * 0.6 * side);
      ctx.quadraticCurveTo(len * 0.4, wid * 0.9 * side, 0, wid * 0.4 * side);
      tipX = len;
      tipY = wid * 0.35 * side;
      break;

    case 'veil_wing':
      ctx.bezierCurveTo(len * 0.3, -wid * 0.3 * side, len * 0.8, -wid * 0.1 * side, len * 1.15, wid * 0.2 * side);
      ctx.bezierCurveTo(len * 0.9, wid * 0.8 * side, len * 0.4, wid * 1.1 * side, 0, wid * 0.4 * side);
      tipX = len * 1.15;
      tipY = wid * 0.2 * side;
      break;

    case 'rounded':
    default:
      ctx.quadraticCurveTo(len * 0.4, -wid * 0.2 * side, len, wid * 0.4 * side);
      ctx.quadraticCurveTo(len * 0.6, wid * 1.0 * side, 0, wid * 0.4 * side);
      tipX = len;
      tipY = wid * 0.4 * side;
      break;
  }

  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Fin Rib Striations
  if (ribs > 0) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = transparency * 0.6;
    for (let r = 1; r <= ribs; r++) {
      const fr = r / (ribs + 1);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(
        len * fr * 0.6,
        wid * fr * 0.3 * side,
        len * (0.6 + 0.4 * fr),
        wid * fr * 0.8 * side,
      );
      ctx.stroke();
    }
  }

  // World tip position calculation
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: startX + (tipX * cos - tipY * sin),
    y: startY + (tipX * sin + tipY * cos),
    angle: angle,
  };
}

// 4. Caudal Tail Rendering
function drawTail(
  ctx: CanvasRenderingContext2D,
  config: FishConfig,
  spine: SpinePoint[],
  time: number,
  isSwimming: boolean,
): { x: number; y: number; angle: number } {
  const { mode, length, width, baseColor, accentColor, striationCount, striationAlpha } = config.tail;
  const lastSpine = spine[spine.length - 1];

  ctx.save();
  ctx.translate(lastSpine.x, lastSpine.y);
  ctx.rotate(lastSpine.angle);

  const tailGrad = ctx.createLinearGradient(0, 0, length, 0);
  tailGrad.addColorStop(0, baseColor);
  tailGrad.addColorStop(0.65, accentColor);
  tailGrad.addColorStop(1, 'rgba(255, 255, 255, 0.15)');

  ctx.fillStyle = tailGrad;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.85;

  ctx.beginPath();
  ctx.moveTo(0, -lastSpine.halfWidth * 0.7);

  let tipX = length;
  let tipY = 0;

  switch (mode) {
    case 'veil_tail': {
      // Long flowing silk veil trailing behind fish
      const waveLag = 0;
      ctx.bezierCurveTo(length * 0.4, -width * 0.6, length * 0.8, -width * 0.8 + waveLag, length * 1.2, -width * 0.3);
      ctx.bezierCurveTo(length * 0.9, waveLag * 0.5, length * 1.1, width * 0.4, length * 1.25, width * 0.5);
      ctx.bezierCurveTo(length * 0.7, width * 0.8 + waveLag, length * 0.3, width * 0.5, 0, lastSpine.halfWidth * 0.7);
      tipX = length * 1.25;
      break;
    }

    case 'double_comet': {
      // Split twin tails trailing behind fish
      const splitLag = 0;
      ctx.quadraticCurveTo(length * 0.5, -width * 0.7, length, -width * 0.6 + splitLag);
      ctx.quadraticCurveTo(length * 0.7, -width * 0.2, length * 0.35, 0);
      ctx.quadraticCurveTo(length * 0.7, width * 0.2, length, width * 0.6 - splitLag);
      ctx.quadraticCurveTo(length * 0.5, width * 0.7, 0, lastSpine.halfWidth * 0.7);
      tipX = length;
      break;
    }

    case 'butterfly_drape': {
      // Wide gossamer butterfly fan trailing behind fish
      ctx.bezierCurveTo(length * 0.3, -width * 0.9, length * 0.8, -width * 1.1, length * 1.05, -width * 0.4);
      ctx.quadraticCurveTo(length * 0.6, 0, length * 1.05, width * 0.4);
      ctx.bezierCurveTo(length * 0.8, width * 1.1, length * 0.3, width * 0.9, 0, lastSpine.halfWidth * 0.7);
      tipX = length * 1.05;
      break;
    }

    case 'standard_fan':
    default: {
      // Traditional koi fan caudal trailing behind fish
      ctx.quadraticCurveTo(length * 0.4, -width * 0.55, length, -width * 0.45);
      ctx.quadraticCurveTo(length * 0.75, 0, length, width * 0.45);
      ctx.quadraticCurveTo(length * 0.4, width * 0.55, 0, lastSpine.halfWidth * 0.7);
      tipX = length;
      break;
    }
  }

  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Caudal Striation Rays
  if (striationCount > 0) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = striationAlpha;

    for (let s = 1; s <= striationCount; s++) {
      const frac = s / (striationCount + 1); // 0 -> 1
      const yOffset = (frac - 0.5) * (width * 0.8);
      ctx.beginPath();
      ctx.moveTo(0, (frac - 0.5) * lastSpine.halfWidth);
      ctx.quadraticCurveTo(length * 0.5, yOffset * 0.6, tipX * (0.85 + 0.15 * Math.sin(frac * Math.PI)), yOffset);
      ctx.stroke();
    }
  }

  ctx.restore();

  const cos = Math.cos(lastSpine.angle);
  const sin = Math.sin(lastSpine.angle);
  return {
    x: lastSpine.x + (tipX * cos - tipY * sin),
    y: lastSpine.y + (tipX * sin + tipY * cos),
    angle: lastSpine.angle,
  };
}

// 5. Body Core Rendering
function drawBodyCore(
  ctx: CanvasRenderingContext2D,
  config: FishConfig,
  spine: SpinePoint[],
) {
  ctx.save();
  ctx.globalAlpha = config.body.opacity;

  // Build Body Gradient Fill
  const nose = spine[0];
  const tail = spine[spine.length - 1];

  let bodyFill: CanvasGradient | string;
  if (config.body.gradientType === 'linear_spine') {
    const grad = ctx.createLinearGradient(nose.x, nose.y, tail.x, tail.y);
    grad.addColorStop(0, config.body.baseColor);
    grad.addColorStop(0.6, config.body.baseGradientEnd);
    grad.addColorStop(1, config.body.underbellyColor);
    bodyFill = grad;
  } else if (config.body.gradientType === 'radial_glow') {
    const mid = spine[4];
    const grad = ctx.createRadialGradient(mid.x, mid.y, 5, mid.x, mid.y, config.body.length * 0.6);
    grad.addColorStop(0, config.body.baseColor);
    grad.addColorStop(0.7, config.body.baseGradientEnd);
    grad.addColorStop(1, config.body.underbellyColor);
    bodyFill = grad;
  } else {
    bodyFill = config.body.baseColor;
  }

  ctx.fillStyle = bodyFill;
  ctx.strokeStyle = config.body.underbellyColor;
  ctx.lineWidth = config.body.underbellyWidth;

  buildBodyPath(ctx, config, spine);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// 6. Procedural Dorsal Ridge & Markings
function drawDorsalMarkings(
  ctx: CanvasRenderingContext2D,
  config: FishConfig,
  spine: SpinePoint[],
  pulseEnergy: number,
) {
  const { pattern, markingColor, markingSecondaryColor, scaleSize, density, blur = 0, blendMode, seed } = config.dorsal;
  if (pattern === 'plain' || density <= 0.02) return;

  ctx.save();
  ctx.globalCompositeOperation = blendMode;

  if (blur > 0) {
    ctx.filter = `blur(${blur}px)`;
  }

  const rand = pseudoRandom(seed);

  // Clip markings strictly within body hull
  buildBodyPath(ctx, config, spine);
  ctx.clip();

  switch (pattern) {
    case 'calico_patches': {
      // Organic rounded patches (Kohaku/Sanke style)
      ctx.fillStyle = markingColor;
      const numBlobs = Math.round(6 * density);
      for (let b = 0; b < numBlobs; b++) {
        const segIdx = Math.floor(1 + rand() * (spine.length - 4));
        const pt = spine[segIdx];
        const radX = (scaleSize * 1.5 + rand() * 18);
        const radY = (pt.halfWidth * 0.9 * (0.6 + rand() * 0.5));
        const offY = (rand() - 0.5) * pt.halfWidth * 0.8;

        ctx.beginPath();
        ctx.ellipse(
          pt.x + pt.normalX * offY,
          pt.y + pt.normalY * offY,
          radX,
          radY,
          pt.angle + (rand() - 0.5) * 0.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      // Secondary accents
      ctx.fillStyle = markingSecondaryColor;
      for (let b = 0; b < Math.round(numBlobs * 0.5); b++) {
        const segIdx = Math.floor(2 + rand() * (spine.length - 5));
        const pt = spine[segIdx];
        const rad = scaleSize * 0.8 + rand() * 8;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'metallic_scales': {
      // Reflective diamond grid scutes
      ctx.strokeStyle = markingColor;
      ctx.fillStyle = markingSecondaryColor;
      ctx.lineWidth = 1.2;

      const scaleStep = Math.max(6, scaleSize);
      for (let i = 2; i < spine.length - 2; i++) {
        const pt = spine[i];
        const rows = Math.floor(pt.halfWidth / (scaleStep * 0.7));
        for (let r = -rows; r <= rows; r++) {
          if (rand() > density) continue;
          const sx = pt.x + pt.normalX * (r * scaleStep * 0.7);
          const sy = pt.y + pt.normalY * (r * scaleStep * 0.7);

          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(pt.angle);
          ctx.beginPath();
          ctx.moveTo(scaleStep * 0.5, 0);
          ctx.lineTo(0, scaleStep * 0.35);
          ctx.lineTo(-scaleStep * 0.5, 0);
          ctx.lineTo(0, -scaleStep * 0.35);
          ctx.closePath();
          ctx.globalAlpha = 0.5 + 0.5 * rand();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
      break;
    }

    case 'lunar_emblem': {
      // Astronomical moon discs and celestial rings
      const mid = spine[4];
      ctx.save();
      ctx.translate(mid.x, mid.y);
      ctx.rotate(mid.angle);

      // Central Lunar Core
      ctx.fillStyle = markingColor;
      ctx.beginPath();
      ctx.arc(0, 0, scaleSize * 1.1, 0, Math.PI * 2);
      ctx.fill();

      // Crescent overlay
      ctx.fillStyle = markingSecondaryColor;
      ctx.beginPath();
      ctx.arc(scaleSize * 0.4, 0, scaleSize * 0.9, 0, Math.PI * 2);
      ctx.fill();

      // Concentric Orbit Rings
      ctx.strokeStyle = markingColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.ellipse(0, 0, scaleSize * 2.2, scaleSize * 1.2, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
      break;
    }

    case 'tempest_lightning': {
      // Branching jagged electric scutes
      ctx.strokeStyle = markingColor;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = markingSecondaryColor;
      ctx.shadowBlur = 8;

      ctx.beginPath();
      const startPt = spine[1];
      ctx.moveTo(startPt.x, startPt.y);

      for (let i = 2; i < spine.length - 1; i++) {
        const pt = spine[i];
        const jitter = (rand() - 0.5) * pt.halfWidth * 0.9 * density;
        ctx.lineTo(pt.x + pt.normalX * jitter, pt.y + pt.normalY * jitter);
      }
      ctx.stroke();
      break;
    }

    case 'rime_ice_crust': {
      // Crystalline frost scutes & facets
      ctx.fillStyle = markingColor;
      ctx.strokeStyle = markingSecondaryColor;
      ctx.lineWidth = 1.2;

      for (let i = 1; i < spine.length - 2; i += 2) {
        const pt = spine[i];
        const numFacets = Math.round(4 * density);
        for (let f = 0; f < numFacets; f++) {
          const fx = pt.x + (rand() - 0.5) * pt.halfWidth * 1.4;
          const fy = pt.y + (rand() - 0.5) * pt.halfWidth * 1.4;
          const fSize = scaleSize * (0.4 + rand() * 0.6);

          ctx.beginPath();
          ctx.moveTo(fx, fy - fSize);
          ctx.lineTo(fx + fSize * 0.8, fy);
          ctx.lineTo(fx, fy + fSize);
          ctx.lineTo(fx - fSize * 0.8, fy);
          ctx.closePath();
          ctx.globalAlpha = 0.6 + 0.4 * rand();
          ctx.fill();
          ctx.stroke();
        }
      }
      break;
    }

    case 'stippling': {
      // Fine droplet flecks along spine
      ctx.fillStyle = markingColor;
      const totalFlecks = Math.round(75 * density);
      for (let f = 0; f < totalFlecks; f++) {
        const segIdx = Math.floor(1 + rand() * (spine.length - 3));
        const pt = spine[segIdx];
        const lateral = (rand() - 0.5) * pt.halfWidth * 1.3;
        const flX = pt.x + pt.normalX * lateral;
        const flY = pt.y + pt.normalY * lateral;
        const rad = 1 + rand() * (scaleSize * 0.25);

        ctx.beginPath();
        ctx.arc(flX, flY, rad, 0, Math.PI * 2);
        ctx.globalAlpha = 0.4 + 0.6 * rand();
        ctx.fill();
      }
      break;
    }
  }

  ctx.restore();
}

// 7. Head Features: Whiskers, Eyes, and Crown Spot
function drawHeadFeatures(
  ctx: CanvasRenderingContext2D,
  config: FishConfig,
  spine: SpinePoint[],
  time: number,
  pulseEnergy: number,
  isSwimming: boolean = false,
): { x: number; y: number; angle: number } {
  const { headWidth } = config.body;
  const {
    whiskerLength,
    whiskerSpread,
    whiskerColor,
    whiskerDrag,
    eyeColor,
    eyePupilGlow,
    eyeOrbitColor,
    eyeSize,
    crownSpot,
  } = config.head;

  const nose = spine[0];
  const headSpine = spine[1];

  // Whiskers / Barbels emerging from snout
  if (whiskerLength > 2) {
    ctx.save();
    ctx.strokeStyle = whiskerColor;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';

    const spreadRad = (whiskerSpread * Math.PI) / 180;
    const whiskerWhip = isSwimming ? Math.sin(time * 3.5) * whiskerDrag * 10 : 0;

    // Left Whisker
    ctx.beginPath();
    ctx.moveTo(nose.x, nose.y);
    const leftWhiskEnd = {
      x: nose.x + Math.cos(spreadRad) * whiskerLength,
      y: nose.y + Math.sin(spreadRad) * whiskerLength,
    };
    ctx.quadraticCurveTo(
      nose.x + Math.cos(spreadRad * 0.5) * (whiskerLength * 0.5),
      nose.y + Math.sin(spreadRad * 0.5) * (whiskerLength * 0.5),
      leftWhiskEnd.x,
      leftWhiskEnd.y,
    );
    ctx.stroke();

    // Right Whisker
    ctx.beginPath();
    ctx.moveTo(nose.x, nose.y);
    const rightWhiskEnd = {
      x: nose.x + Math.cos(-spreadRad) * whiskerLength,
      y: nose.y + Math.sin(-spreadRad) * whiskerLength,
    };
    ctx.quadraticCurveTo(
      nose.x + Math.cos(-spreadRad * 0.5) * (whiskerLength * 0.5),
      nose.y + Math.sin(-spreadRad * 0.5) * (whiskerLength * 0.5),
      rightWhiskEnd.x,
      rightWhiskEnd.y,
    );
    ctx.stroke();
    ctx.restore();
  }

  // Eyes placed symmetrically on head
  const eyeOffset = headWidth * 0.42;
  const drawEye = (x: number, y: number) => {
    ctx.save();
    // Orbital Ring
    ctx.fillStyle = eyeOrbitColor;
    ctx.beginPath();
    ctx.arc(x, y, eyeSize * 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Eye Sclera / Iris
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(x, y, eyeSize, 0, Math.PI * 2);
    ctx.fill();

    // Glowing Pupil
    ctx.fillStyle = eyePupilGlow;
    ctx.shadowColor = eyePupilGlow;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(x + 0.5, y - 0.5, eyeSize * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const leftEyeX = headSpine.x + headSpine.normalX * eyeOffset;
  const leftEyeY = headSpine.y + headSpine.normalY * eyeOffset;
  const rightEyeX = headSpine.x - headSpine.normalX * eyeOffset;
  const rightEyeY = headSpine.y - headSpine.normalY * eyeOffset;

  drawEye(leftEyeX, leftEyeY);
  drawEye(rightEyeX, rightEyeY);

  // Crown Spot (Tancho disc, star, crescent, diamond)
  let crownWorldPos = { x: headSpine.x, y: headSpine.y, angle: headSpine.angle };

  if (crownSpot.enabled) {
    ctx.save();
    const cx = headSpine.x + Math.cos(headSpine.angle) * crownSpot.posX;
    const cy = headSpine.y + Math.sin(headSpine.angle) * crownSpot.posX;
    crownWorldPos = { x: cx, y: cy, angle: headSpine.angle };

    ctx.translate(cx, cy);
    ctx.rotate(headSpine.angle);

    ctx.fillStyle = crownSpot.color;
    if (crownSpot.glow || pulseEnergy > 0.5) {
      ctx.shadowColor = crownSpot.color;
      ctx.shadowBlur = 10 * Math.min(2.0, pulseEnergy || 1.0);
    }

    const sz = crownSpot.size;
    ctx.beginPath();

    switch (crownSpot.type) {
      case 'star':
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5 - Math.PI * 0.5;
          const ai = a + Math.PI / 5;
          if (i === 0) ctx.moveTo(Math.cos(a) * sz, Math.sin(a) * sz);
          else ctx.lineTo(Math.cos(a) * sz, Math.sin(a) * sz);
          ctx.lineTo(Math.cos(ai) * (sz * 0.45), Math.sin(ai) * (sz * 0.45));
        }
        ctx.closePath();
        break;

      case 'crescent':
        ctx.arc(0, 0, sz, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = config.body.baseColor;
        ctx.beginPath();
        ctx.arc(sz * 0.35, 0, sz * 0.8, 0, Math.PI * 2);
        break;

      case 'diamond':
        ctx.moveTo(sz, 0);
        ctx.lineTo(0, sz * 0.65);
        ctx.lineTo(-sz, 0);
        ctx.lineTo(0, -sz * 0.65);
        ctx.closePath();
        break;

      case 'circle':
      default:
        ctx.arc(0, 0, sz, 0, Math.PI * 2);
        break;
    }

    ctx.fill();
    ctx.restore();
  }

  return crownWorldPos;
}

// 8. Bioluminescent Glow Bloom Layer
function drawEmissionGlow(
  ctx: CanvasRenderingContext2D,
  config: FishConfig,
  spine: SpinePoint[],
  pulseEnergy: number,
) {
  const { color, spineGlow, finMarginGlow } = config.emission;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.shadowColor = color;
  ctx.shadowBlur = 14 * pulseEnergy;
  ctx.strokeStyle = color;

  // Spine Central Luminescent Filament
  if (spineGlow) {
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = Math.min(1.0, 0.4 + 0.3 * pulseEnergy);
    ctx.beginPath();
    ctx.moveTo(spine[0].x, spine[0].y);
    for (let i = 1; i < spine.length; i++) {
      ctx.lineTo(spine[i].x, spine[i].y);
    }
    ctx.stroke();
  }

  // Outer Body Fin Margins Glow
  if (finMarginGlow) {
    ctx.lineWidth = 2.0;
    ctx.globalAlpha = Math.min(0.9, 0.3 * pulseEnergy);
    buildBodyPath(ctx, config, spine);
    ctx.stroke();
  }

  ctx.restore();
}

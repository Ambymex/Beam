# 🐟 2D Fish Studio — Architectural Specification & Design Document

**Target App**: `react-studio` (Svelte + Vite + CSS/Canvas architecture)  
**Author**: Antigravity (for Ash, Morrow & Codex)  
**Purpose**: A standalone parametric visual designer for authoring 2D top-down Koi species, custom anatomy palettes, bioluminescent emission glows, animated fin kinematics, and placeable ambient particle emitters — exporting paste-ready configs directly into `species_ontology.js` and the 3D game engine pipeline.

---

## 1. System Vision & Architecture

The **2D Fish Studio** integrates into React Studio as a dedicated mode (or companion view). It mirrors the live procedural rendering engine of *Koi: Ephemera*, providing a real-time, high-fidelity stage with live physics, swimming kinematics, and parametric control over every anatomical zone and particle emitter.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             REACT STUDIO: FISH MODE                         │
├──────────────────────────┬──────────────────────────────────────────────────┤
│    PARAMETRIC CONTROLS   │                    STAGE & PREVIEW               │
│                          │                                                  │
│  [1. Anatomy & Palette]  │  ┌────────────────────────────────────────────┐  │
│  • Body Base & Gradient  │  │                                            │  │
│  • Dorsal Ridge & Scutes │  │              ( Top-Down Koi )              │  │
│  • Pectoral/Pelvic Fins  │  │          [✨ Trailing Star VFX]             │  │
│  • Caudal Fin / Tail     │  │                                            │  │
│                          │  └────────────────────────────────────────────┘  │
│  [2. Bioluminescence]    │   [▶ Play] [¼× Slow] [⏸ Freeze/Scrub] [Water Depth]│
│  • Emission Glow Energy  │──────────────────────────────────────────────────│
│  • Pulse Frequency       │                    COACH & AUDIT                 │
│                          │  • Contrast Check • Fin Flutter Sync • Node Count│
│  [3. Particle Emitters]  │──────────────────────────────────────────────────┤
│  • Sockets & Orbits      │                  EXPORT / IMPORT                 │
│  • Particle Envelopes    │  • Copy species_ontology.js Object               │
│                          │  • Copy 3D Texture Map / Shader Uniforms         │
└──────────────────────────┴──────────────────────────────────────────────────┘
```

---

## 2. Top-Down Koi Anatomy & Zone Editors

The fish is composed of decoupled, layered geometric paths allowing independent styling and animation:

### A. Body Core (`body`)
* **Length & Width Taper**: Nose roundness, mid-body swell ($15\text{px} \to 45\text{px}$), and caudal peduncle taper.
* **Color Envelopes**:
  * `baseColor`: Solid or radial gradient (Nose $\to$ Spine $\to$ Belly).
  * `underbellyColor`: Subsurface ambient tone visible along outer body contours.
  * `opacity` / `translucency`: From solid lacquer porcelain to ghostly phantom veil ($0.2 \to 1.0$).

### B. Dorsal Ridge & Surface Markings (`dorsal`)
* **Pattern Types**:
  * `plain` / `monochrome`
  * `calico_patches` (organic irregular kohaku / sanke spots)
  * `metallic_scales` (reflective diamond grid highlight)
  * `lunar_emblem` (astronomical phase disc with emission core)
  * `tempest_lightning` (jagged branching electric scutes)
  * `rime_ice_crust` (faceted crystalline frost border)
  * `stippling` (fine rain-droplet flecks)
* **Controls**: `markingColor`, `markingSecondaryColor`, `scaleSize`, `density`, and `blendMode`.

### C. Pectoral & Pelvic Fins (`fins`)
* **Geometry**: Fin length, spread angle, sweep shape (pointed, rounded, scalloped, veil-wing).
* **Kinematics**: Flutter frequency ($\text{Hz}$), secondary wave lag, and amplitude.
* **Styling**: `finColor`, translucent gradient alpha, and leading-edge highlight ribbing.

### D. Caudal Fin / Tail (`tail`)
* **Geometry Modes**:
  * `standard_fan` (traditional koi caudal fin)
  * `veil_tail` (long flowing silk drapery)
  * `double_comet` (split trailing tails)
  * `butterfly_drape` (wide ethereal gossamer fins)
* **Kinematics**: Primary tail sway speed, wave propagation multiplier, and fin-tip trailing whip.
* **Styling**: Base color, gradient transition, accent edge stroke, and ray striations.

### E. Head, Whisker & Eye Accents (`head`)
* **Barbel / Whisker Nodes**: Whisker length, curve angle, and fluid drag delay.
* **Eyes**: Eye color, iris pupil glow, and orbital ring.
* **Crown Spot (Tancho / Star)**: Distinct head marking position and radius.

---

## 3. Bioluminescence & Shader Glow Engine

* **`emissionEnergy` ($0.0 \to 3.0$)**:
  * $0.0$: Matte natural pond fish (no light emission).
  * $0.5–1.0$: Subtle bioluminescent spine and fin margins.
  * $2.0–3.0$: Radiant Celestial/Epic Sovereign (casts bloom, shadow blur, and surface caustics).
* **`emissionColor`**: Dedicated HDR glow hue.
* **`pulseWave`**: `static`, `sine_heartbeat`, `lunar_breath`, `static_crackling`, or `aurora_shimmer`.

---

## 4. Placeable Particle Emitters ("VFX Sockets")

Fish can host 1 to 4 parametric particle emitter layers attached to physical anchor sockets:

| Socket ID | Anchor Point | Classic Species Reference |
| :--- | :--- | :--- |
| `orbital_ring` | Revolving ellipse around fish center | **Moon Fish**, **Solar Eclipse Corona** |
| `dorsal_crest` | Emanating along upper spine | **Pyrocumulonimbus**, **Rimefin Ice Shards** |
| `fin_tips` | Emitted from trailing fin & tail edges | **Petalfin Blossom Trails**, **Stardust** |
| `halo_crown` | Floating halo above head | **Tancho Sun Dog**, **Crown Sovereign** |
| `submerged_aura`| Soft expanding circular wavelets | **Pluvian Rain Ripple Cascades** |

### Particle Parametric Envelopes:
* **Shape**: `sparkle`, `petal`, `star`, `diamond_crystal`, `ice_shard`, `smoke_puff`, `bubble`, `lunar_mote`, or custom SVG path.
* **Count & Rate**: $1 \to 30$ concurrent particles with staggered trickle entrances.
* **Motion Physics**: Velocity, radial expansion, orbital spin speed ($\text{rad/s}$), turbulence jitter, and water drag decay.
* **Lifespan Envelopes**: 3-point Size Envelope ($\text{Start} \to \text{Mid} \to \text{End}$) and 3-point Alpha/Color Gradient.

---

## 5. Stage & Studio Features

1. **Water Surface Environment Switcher**:
   * Preview against any pond substrate: *Day Sunlit Stream*, *Sunset Copper Glow*, *Night Moonlit Deep*, *Foggy Mist*, or *Subterranean Cave*.
2. **Kinematic Swimming Simulator**:
   * **Hold / Inspect Mode**: Fish stays in place with gentle idling fin flutter for precise micro-editing.
   * **Swimming Mode**: Fish curves and swims dynamically along a Bézier figure-8 path to preview natural fluid deformation and trailing particle ribbons.
3. **Playback Controls**:
   * Full speed ($1\times$), Slow-motion study mode ($0.25\times$), and **Timeline Scrub Bar** to freeze and inspect particle transitions frame by frame.
4. **The Fish Coach (Live Design Auditing)**:
   * **Readability Audit**: Alerts if dorsal markings lack contrast against the body core.
   * **Depth Audit**: Verifies that fin transparency and drop shadows create true aquatic depth.
   * **Luminescence Restraint**: Recommends balancing intense glows with deep grounding shadows.

---

## 6. Export Pipeline & Code Generation

Hitting **`Export Code`** generates formatted, copy-paste snippets:

### 1. `species_ontology.js` Entry (Game Metadata & Ontology):
```javascript
{
    id: "lunar_glimmerfin",
    label: "Glimmerfin Sovereign",
    family: "celestial_lunar",
    moteType: "full_moon",
    eligible_ponds: ["sky_pond", "home_pond"],
    eligible_seasons: ["all"],
    eligible_weathers: ["clear"],
    spawn_weight: 1.0,
    rarities: {
        epic: {
            id: "epic",
            label: "[Moon] Glimmerfin Sovereign",
            bodyColor: "#0d1b2a",
            finColor: "#70d6ff",
            markingColor: "#e0e1dd",
            emissionEnergy: 2.2,
            treatment: "Midnight sapphire core trailing shimmering lunar star motes."
        }
    }
}
```

### 2. 3D Engine Material & Uniforms (for Godot / Unity / Three.js):
```json
{
  "albedoColor": "#0d1b2a",
  "markingTexture": "lunar_emblem",
  "markingColor": "#e0e1dd",
  "emissionColor": "#70d6ff",
  "emissionEnergy": 2.2,
  "finFlutterSpeed": 2.4,
  "tailWiggleAmp": 0.35,
  "vfxEmitter": {
    "type": "orbit",
    "particle": "star",
    "count": 6,
    "radius": 32.0
  }
}
```

---

## 7. Implementation Checklist for the Fresh Instance

1. 📂 Create `src/lib/fishStudio/`:
   * `FishCanvas.svelte` (Render stage with Bézier fish body & canvas particle system).
   * `FishControls.svelte` (Tabbed accordions: Anatomy, Fins, Luminescence, Emitters).
   * `fishConfig.ts` (Data structures, default species presets, validation).
   * `fishGenerate.ts` (Generates ontology JS and 3D engine JSON).
2. 🔗 Import into `App.svelte`: Add a top-bar toggle between **React Studio** (Ambient Gestures) and **Fish Studio** (Koi Skin Builder).
3. 💾 Integrate with `drafts.ts`: Save and load custom fish skin drafts into LocalStorage.

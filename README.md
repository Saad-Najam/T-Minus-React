# T-MINUS · Rocket & Mission Builder — web edition

A premium React / Three.js re-creation of the Unity game **T-MINUS** (NASA Space Apps Challenge 2026, "Space Mission Design Game").
Build a 3U CubeSat and its rocket part by part — torque every bolt in star order, wire every cable — launch it with real physics,
operate the satellite for 30 simulated days, and get a debrief that explains the cause of every success and failure.

The original Unity + Blender + C# project is a separate repository ([ayaan-kashif/NASA-PROJECT](https://github.com/ayaan-kashif/NASA-PROJECT)) and is untouched. This repository is a **completely separate, independently runnable** web project.

> Not affiliated with or endorsed by NASA. Earth imagery: NASA Blue Marble (NASA Earth Observatory). Flood images: NASA Earth Observatory using Landsat data from the U.S. Geological Survey. See `CREDITS.md`.

---

## Run it

Requires Node.js 18+ (developed on Node 24).

```bash
npm install          # install dependencies
npm run dev          # start the dev server on http://localhost:5173
npm run build        # production build into dist/
npm run preview      # serve the production build
npm test             # 48 engine tests (flight physics parity, wiring, budgets, scoring, HOUSTON, ...)
```

End-to-end browser tests (real Chromium via Playwright, real clicks):

```bash
npx playwright install chromium
npm run dev -- --port 5199          # in one terminal
node tests/e2e/smoke.mjs            # every screen, fails on any console error (Q=high for full-quality screenshots)
node tests/e2e/playthrough.mjs      # build -> wire -> stack -> bolt -> avionics -> pad -> flight -> debrief, real clicks
node tests/e2e/modes.mjs            # Judge Mode, Failure Lab job + hand-back, Apollo 12, Moonshot, Rehbar-I, Space Guide, Settings
node tests/e2e/responsive.mjs       # 5 device sizes x 6 rooms: screenshots + horizontal-overflow check
node tests/e2e/replay.mjs           # failure replay scrubber
npm run build && npm run preview -- --port 5300 && node tests/e2e/prod.mjs   # smoke-test the production build
```

Screenshots from the test runs are written to `shots/`. The browser tests run Chromium with software WebGL and the **Low** graphics preset, so they are slow but need no GPU.

The production build is a static site (`base: './'`), so `dist/` can be hosted anywhere (GitHub Pages, Netlify, any file server) and works offline once loaded.

## Deploy to Vercel

The repository is Vercel-ready (`vercel.json` sets the Vite framework, `npm ci`, `npm run build`, the `dist/` output and long-lived caching for hashed assets, models and textures).

1. Import the GitHub repository in Vercel — the detected framework is **Vite**; leave the defaults.
2. Deploy. No environment variables are required. The app is a static site and works offline once loaded.
3. Optional: to enable HOUSTON's AI wording, deploy the original `proxy/` (Vercel function) and paste its URL in **Settings → HOUSTON AI service** in the running game.

The built site is also a plain static folder, so any static host works.

## Technology

| Area | Choice |
|---|---|
| UI | React 18, Vite 5, Tailwind CSS 3, Framer Motion, lucide-react icons |
| 3D | Three.js, @react-three/fiber, @react-three/drei, PBR materials, procedural lighting |
| State | Zustand (one store, pure engine modules underneath) |
| Models | Original Blender parts converted FBX → GLB (`tools/convert-models.mjs`) |
| Audio | WebAudio (engine rumble follows thrust and altitude; no audio files) |
| Tests | Vitest (engine) + Playwright (browser) |

## Folder structure

```
src/
  engine/            Pure JavaScript game logic — a faithful port of the C# scripts, no React, no DOM
    flight/            physics.js, sim.js (RK4, 0.05 s, double precision), guidance.js, vehicle.js
    houston/           advisor.js (next step / scan / where-does-this-go), whatIf.js, llm.js (optional proxy), actions.js
    data.js bolts.js wiring.js assembly.js avionics.js budget.js ops.js scoring.js checklist.js
    design.js (design codes, validator, demo builds, crew votes) failureLab.js flightRun.js flightSession.js
    missionLog.js relay.js liveImagery.js cubesat.js eventLog.js
  state/             store.js (game state + actions), persist.js, quality.js
  pages/             One file per room: MainMenu, Briefing, IntegrationBay, Vab, AvionicsBay, Pad, Flight, Debrief, FailureLab, SpaceGuide, Settings
  components/        Frame (mission stepper), HoustonPanel, WiringBench, BudgetsPanel, Charts, PauseMenu, JudgeOverlay, FirstBuildGuide, ui
  three/             CubeSat3D, Rocket3D (GLB parts + procedural Saturn V / Rehbar-I), BoltRings, Earth3D, FlightScene, LaunchPad3D, materials, Studio
public/
  data/              parts / rockets / missions / rules / codex / quiz / strings .json — copied unchanged from the Unity project (data-driven)
  models/            pf_*.glb  (converted Blender models)
  images/            Landsat Lake Manchar images, Blue Marble, PBR textures
tests/               engine tests + e2e/
tools/               convert-models.mjs (needs the original repo's FBX files; the converted GLBs are already in public/models)
docs/FEATURE_MAP.md  Original Unity feature → C# script → React module → status
```

## How the original maps onto this project

Every gameplay rule lives in `src/engine` and is driven by the same JSON data as the Unity game, so numbers match:

* **Flight physics** — `engine/flight/*` is a line-by-line port of `FlightSim`, `FlightGuidance`, `FlightPhysics` (gravity, drag with a transonic bump, thrust that depends on altitude, RK4 integration, gravity-turn autopilot, altitude hold for the Saturn V's S-II, sounding-rocket profile). The tests reproduce the original's documented results: Pathfinder reaches a 550 km orbit with max-Q ≈ 41 kPa, Saturn V leaves > 2,800 m/s for TLI, Rehbar-I reaches ≈ 130 km.
* **Build rules** — star-pattern bolting with warp/over-torque penalties, wiring validation (short circuits, reversed polarity, rail overload, required connections, the deployment switch in line), stacking order and diameter checks, budgets (orbit period, eclipse, power, battery depth-of-discharge, downlink, GSD).
* **Consequences** — a missing cable, a loose joint, the Safe/Arm plug or the RBF pin each change the flight or the 30-day operations, and the debrief names the cause.

See `docs/FEATURE_MAP.md` for the complete table.

## What was improved

* A new design language: dark "mission control" glass UI, Rajdhani / Inter / JetBrains Mono typography, accessible text + symbols alongside every colour.
* **Cinematic 3D:** bloom + vignette post-processing, PBR materials with procedural studio reflections, contact shadows, a display pedestal, an atmosphere shader and procedural cloud cover on the Blue Marble Earth, and a pointer-parallax menu.
* **Flight scene:** floating-origin world from pad to orbit — pad smoke and steam at lift-off, a persistent exhaust trail, a cumulus layer the rocket punches through, distant hills, sun glow, camera rumble, umbilical arms that swing away, stage-separation debris, explosion, deployed CubeSat close-up, chase / ground / map cameras.
* **A detailed Saturn V** (painted S-IC with fins and five bell nozzles, interstage vents, SLA, service and command modules, escape tower) and the original Blender Pathfinder parts.
* **Wiring in 3D:** every cable of the wiring bench is also drawn on the real CubeSat as a coloured tube that draws itself in when plugged and carries travelling pulses (Build tab and a live 3D loom beside the schematic).
* **Motion:** animated page transitions, spring-seated parts, count-up scores, confetti on good results, hover-tilt cards, a rocket loader, and a reduce-motion switch that turns it all down.
* **Responsive for every device:** rooms scroll on phones and tablets, a compact flight HUD with on-screen throttle and pitch sliders for touch, adaptive resolution, and Graphics presets (High / Medium / Low) chosen automatically per device on first run.
* Debrief: score ring, causal timeline, charts, a scrubbable flight, the Landsat reward degraded to your camera's detail, share card PNG, local leaderboard, design comparison. A **deterministic replay scrubber** lets you drag through the failure replay to any second.

## Settings, saves and privacy

* The build autosaves in this browser (`localStorage`) and is offered as **Continue**. Design codes (`TM1-…`) are the backup and are compatible with the Unity version.
* HOUSTON works fully offline. Optional AI explanations use the original proxy (`Original_Project/proxy`): paste its URL in **Settings → HOUSTON AI service**. No keys are stored in this app.
* The leaderboard, mission log and Space Guide progress are local to the browser.
* Network features (all optional, all fail gracefully offline): live class/crew rooms through ntfy.sh, a live NASA Worldview picture for non-bundled target regions.

## Known limitations (honest list)

* Flight remains a 2D-plane simulation over a round rotating Earth with a simplified atmosphere (as in the original). Part performance and costs are illustrative game values.
* The Saturn V and Rehbar-I are procedural models (as in the original; NASA's Saturn V model is not bundled). The Pathfinder parts are the original Blender models.
* The wiring *editing* surface is the 2D schematic bench (precise, works on touch). The wiring is shown in 3D on the satellite, but cables are created and removed on the bench.
* The automated browser tests run on software WebGL, so frame rates on real GPUs have not been measured here.
* The Windows build and Unity-specific tooling (editor menus, `tools/agent`) have no web equivalent and are not part of this project.
* Urdu answers are experimental and need the AI service, exactly as in the original.

# Original → React feature map

Source of truth: `../Original_Project` (Unity 6000.6.8f1, C#, Blender 5.x). "Status" says how each feature was verified in this project:
**T** = covered by Vitest engine tests (`npm test`), **E** = exercised by the Playwright browser tests (`tests/e2e`), **M** = manually checked in screenshots.

## Rooms and flow

| Original (Unity) | C# scripts | Blender / assets | React implementation | Status |
|---|---|---|---|---|
| Boot + Main menu (Continue, Missions, Judge Mode, Failure Lab, Space Guide, Sandbox, Settings) | `MainMenuController`, `MenuPanels`, `MenuBackdrop`, `SaveService` | Blue Marble Earth | `pages/MainMenu.jsx`, `three/Earth3D.jsx` (globe + atmosphere + orbiting CubeSat), `state/store.js` autosave/Continue | E, M |
| Pause menu, controls, volume, fullscreen | `PauseMenu`, `SettingsStore` | – | `components/PauseMenu.jsx`, `pages/Settings.jsx` | M |
| Mission Briefing (brief, goals, budget, site, orbit, crew 1–4, design code) | `BriefingUI*`, `MissionGoals`, `CrewCodes` | – | `pages/Briefing.jsx`, `engine/design.js` | E, T |
| Integration Bay: install parts, live budgets, orbit | `BayController`, `BayUI`, `CubeSatModel`, `BudgetsPanel`, `SpacecraftBudget` | procedural CubeSat | `pages/IntegrationBay.jsx`, `three/CubeSat3D.jsx`, `engine/budget.js`, `engine/cubesat.js`, `components/BudgetsPanel.jsx` | T, E, M |
| CubeSat wiring bench (cables, polarity, multimeter, validation) | `WiringBench`, `WiringGraph`, `WiringValidator`, `CableStyle`, `BenchTile`, `CableView` | – | `components/WiringBench.jsx` (2D schematic), `three/Cables3D.jsx` + `three/LoomView.jsx` (cables on the real 3D satellite), `engine/wiring.js` | T, E, M |
| VAB: stack Pathfinder, order/diameter rules, undo/redo, X-ray | `VabController`, `RocketView`, `AssemblyGraph`, `AssemblyRules`, `UndoStack`, `OrbitCamera` | `pf_*.fbx` → `pf_*.glb` | `pages/Vab.jsx`, `three/Rocket3D.jsx`, `three/LaunchPad3D.jsx`, `engine/assembly.js` | T, E, M |
| Bolting: star order, 3 torque passes, warp, over-torque, joint integrity | `BoltTool`, `BoltJointView`, `BoltPanel`, `TorqueGauge`, `TorqueWrench`, `BoltMath` | – | `Vab.jsx` bolt tool, `three/BoltRings.jsx`, `engine/bolts.js` | T, E |
| Saturn V / Rehbar-I inspect | `RocketView`, `ProceduralPartFactory` | procedural | `Vab.jsx` (inspect branch), `Rocket3D.jsx` procedural parts | M |
| Avionics Bay: 11 required cables, Safe/Arm | `AvionicsBayController`, `AvionicsReport`, `OpsWiring` | – | `pages/AvionicsBay.jsx`, `engine/avionics.js` | T, E |
| Pad: checklist by role, RBF pin, arm, GO/NO-GO poll, remote votes | `PrelaunchChecklist`, `BriefingUI.Pad`, `CrewCodes`, `CrewRelay` | – | `pages/Pad.jsx`, `engine/checklist.js`, `engine/relay.js` | T, E, M |
| Flight: ascent, max-Q, staging, fairing, orbit, deploy, abort rules | `FlightSim*`, `FlightGuidance`, `FlightPhysics`, `FlightModels`, `FlightController*` | – | `engine/flight/*`, `engine/flightSession.js`, `pages/Flight.jsx` | T, E |
| Flight visuals: chase/ground/map cameras, sky, Earth, plume, debris, explosion, HUD, charts, time warp, manual flight | `FlightView`, `FlightSky`, `FlightHud`, `FlightCharts`, `FlightPad`, `EngineSound` | procedural | `three/FlightScene.jsx`, `three/Earth3D.jsx`, `Flight.jsx` HUD, `audio.js` | E, M |
| Operations (30 days power, storage, downlink, random events) | `OpsSimulation`, `OpsModels` | – | `engine/ops.js` | T |
| Debrief: score, stars, goals, narration, causal timeline, fixes, charts | `DebriefUI`, `Scoring`, `DebriefNarration`, `MissionGoals` | – | `pages/Debrief.jsx`, `engine/scoring.js`, `components/Charts.jsx` | T, E, M |
| Landsat reward degraded to camera GSD, unlocked by thirds | `RewardGallery` | Landsat JPGs | `Debrief.jsx` `Tile` | E, M |
| Live NASA imagery for other regions | `LiveImagery` | – | `engine/liveImagery.js`, Briefing + Debrief | M |
| Share result, save picture, leaderboard, design compare, mission log, CSV export, class room | `ShareCard`, `Leaderboard`, `DesignCompare`, `MissionLog` | – | `Debrief.jsx`, `engine/missionLog.js`, `engine/relay.js` | T, M |
| Failure Lab: Broken Pathfinder, Loose fairing, Silent rocket, Wandering rocket | `FailureLab`, `FailureJobTracker` | – | `pages/FailureLab.jsx` (`JobBar`), `engine/failureLab.js` | T |
| Apollo 12 EECOM console | `Apollo12Console` | – | `FailureLab.jsx` `ApolloConsole`, `ApolloRun` | T |
| Moonshot (Saturn V, 185 km, ≥ 2,800 m/s) and Rehbar-I 1962 (≈ 130 km apogee) | flight-only paths in `FlightSim`, `Scoring` | – | same engine; `scoring.js` flight-only branch | T |
| Judge Mode (6-step demo, Space/Esc, F9) | `JudgeMode`, `DemoBuilds` | – | `components/JudgeOverlay.jsx`, `engine/design.js` `buildDemo` | M |
| HOUSTON: next step, scan, where-does-this-go, show me, bolt coach, what-if, codex matching, optional AI | `AssemblyAdvisor*`, `WhatIf`, `CodexMatcher`, `HoustonLLMClient`, `HoustonPanel*`, `ContextBuilder` | – | `components/HoustonPanel.jsx`, `engine/houston/*` | T |
| First-build guide | `FirstBuildGuide` | – | `components/FirstBuildGuide.jsx` | M |
| Space Guide (28 topics + quiz) | `MenuPanels`, `CodexProgress` | `codex.json`, `quiz.json` | `pages/SpaceGuide.jsx` | M |
| Settings: HOUSTON mode, language (Urdu), volume, fullscreen | `SettingsStore`, `Strings` | Noto Naskh Arabic | `pages/Settings.jsx`, Noto font via Google Fonts | M |
| Design codes `TM1-` and crew vote codes `TMV1-` | `DesignCode`, `DesignValidator`, `CrewCodes` | – | `engine/design.js` (gzip + base64, same JSON field names) | T |
| Teacher dashboard / school pages | `tools/web/*.html` | – | `public/teacher.html`, `schools.html`, `about.html` (unchanged static pages) | – |

## Data (unchanged JSON, loaded by `engine/data.js`)

`parts.json`, `rockets.json`, `missions.json`, `rules.json`, `codex.json`, `quiz.json`, `strings.json` are copied verbatim into `public/data/`.

## Differences and limitations (nothing removed silently)

| Unity feature | In the web edition |
|---|---|
| 3D wiring bench with rotating boards | Cables are edited on a 2D schematic bench (patterned cables, multimeter, polarity toggle) and are also drawn on the real 3D satellite (animated plug-in, live pulses). Same rules and consequences. |
| Windows build, Editor menu builders, `tools/agent`, `tools/sim`, Unity MCP | Not applicable on the web. `tools/sim` physics checks are reproduced as Vitest tests. |
| Unity Analytics hook | Not ported (no telemetry is sent). |
| UI Toolkit USS themes | Replaced by the new Tailwind design system. |
| Time slider scrubbing inside a failure replay | Implemented: the replay has a scrubber that rebuilds any moment of the deterministic flight (`FlightSession.seek`). |
| Pathfinder parts | Original Blender models, re-materialled with web PBR and original textures. Saturn V / Rehbar-I are procedural, as in the original. |

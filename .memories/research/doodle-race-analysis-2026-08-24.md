# Doodle Race Review

Last updated: 2026-08-26

## Summary

Paper Circuit has a sound separation between race simulation, public AIND Drawn assets, and the shared inked-solid scene pass. The main opportunity is gameplay legibility and track structure, not a renderer rewrite.

## Evidence

- The verification suites pass: 20 test files and 236 tests after the course compiler, continuous
  route-coverage, race-menu, explorer, vehicle-pose,
  hidden-carrier, Explore-camera, character-axis, and grandstand-grounding regressions were added.
  The focused Doodle Race suite passes 60 tests, including pencil-path validation, shortcut
  rejection, queued reroll, smoke-tail animation, and fixed-world minimap projection.
- Live browser QA at the desktop viewport confirms the initial `Graphite`/`5 laps` menu, a 10-lap
  start, the fixed-world Aerial camera, and a random-character grandstand walk with `idle`/`walk` state.
- At 320px, the brand/settings plates overlap and the fixed-size touch controls overlap adjacent targets. At 390px, the running-order plate overlaps the drift HUD.
- Follow remains the close oblique camera. Aerial is a marker-free, perfectly vertical,
  fixed-world driving view that follows the player across a 52-60 world-unit vertical field instead
  of shrinking the complete circuit into one frame.

## Reusable findings

- Runtime HUD buttons must explicitly return focus to the race canvas after activation. `InputController`
  intentionally ignores keyboard events targeting buttons, inputs, selects, and textareas; the SFX
  toggle originally omitted the canvas refocus used by camera, pause, route-debug, and medium controls.
  A focused SFX button therefore swallowed WASD/arrows and keyboard-emulated controller input. The
  published GitHub Pages source map matched local source exactly, and same-browser QA reproduced the
  issue on both origins, so this is not a Pages build/cache difference.
- `RaceSimulation` combines phase flow, ranking, lap detection, drift scoring, respawn, player physics, and opponent steering. Split rules into focused modules before adding more race systems.
- `nearestCoursePoint` projects continuously onto the 256 sampled course segments. Generated path
  validation keeps non-adjacent centre-line sections far enough apart to avoid ambiguous projection.
- Course layouts map route coverage over the same 256 segments used by rendering and nearest-road
  projection. Road contact evaluates all four oriented tyre footprints from the authored collision
  profile; one overlapping tyre is enough. Ranking freezes only when all tyres leave the road. A lap
  needs 85% coverage and no contiguous gap longer than three track widths. Permanent route anchors
  were removed; an optional public-pipeline debug overlay colors valid road amber and covered
  segments green.
- Opponents follow fixed lane offsets and pace targets and do not collide with each other, so the race currently behaves more like a player-versus-ghost contest than a tactical pack race.
- Renderer failures now pause an active race before the stage is discarded; retry can resume from a
  safe paused state. Medium rebuild failures follow the same pause/error path.

## Implemented decisions

- `CoursePathRecipe` stores the immutable normalized centre line, world scale, and track width for the
  experiment-local solid course. `compileCourseStroke` collapses duplicate samples, normalizes and
  simplifies a closed gesture, then compiles it through the same layout consumed by the Doodle ribbon,
  physics, AI, camera, and scenery. It rejects open paths, self-intersections, unsafe turn radii,
  insufficient non-adjacent clearance, and tracks too short for their width.
- Race progression is an independent pure route-coverage state backed by an immutable eight-word
  bitmap for the 256 course segments. Plausible forward motion marks contiguous road intervals;
  off-route motion leaves a measurable gap and does not advance ranking. Small gaps below three track
  widths are tolerated, total coverage must reach 85%, and respawn uses the last safe route projection.
  `RouteDebugOverlay` projects the same bitset and course ribbon through Doodle 3D only when enabled,
  avoiding a second diagnostic geometry model and its inevitable drift.
- Vehicle roots now own only world position and yaw. Drift lean is applied to the authored
  chassis' local X axis, while wheel-bearing roots remain level with the road. This fixes the
  disappearing-car failure caused by mutating `root.rotation.z` after writing a world quaternion.
- The race starts in an explicit menu. Supported lap counts are `3`, `5`, `10`, and `20`, with a
  default of `5`; Graphite is the factory-default medium, and Paper Circuit exposes only Graphite,
  Ink, and Oil. The last valid medium, lap count, Music/SFX state, and category volumes persist as
  one versioned local menu record and become the next launch defaults.
- `GrandstandExplorer` uses a Web Crypto session seed to choose a character species, lets the
  player roam the full course bounds, grounds movement on authored grandstand steps, blocks
  upward transitions above the maximum step height, and supports `Shift` run plus `Space` jump.
  Rerolling preserves the current world position and queues a registered Doodle smoke burst
  before the replacement character appears. The burst grows from the feet until it covers the
  actor, swaps at that coverage threshold, then floats upward while shrinking instead of being
  hidden at full size.
- The intro menu keeps the circuit visible, hides the crowd and vehicles, and frames a large
  procedural character directly beside the centered setup panel. Its seed-specific preview script
  mixes walking, running, play, airborne, and idle poses, and the menu automatically rerolls the
  character every few seconds with the same local smoke transition. Explore rerolls preserve the
  existing camera orbit as well as the actor's world position.
- The former full-course Map mode and its DOM racer labels were removed. `Aerial` keeps one stable
  world orientation, leads slightly with speed, and widens from 52 to 60 world units. A heading-up
  version was rejected during live QA because rotating the entire scene caused immediate nausea.
  The stable view preserves useful upcoming road without obscuring nearby cars or becoming a minimap.
- Race HUD now owns a separate fixed-world canvas minimap derived directly from the authoritative
  `CourseLayout`. It shows the full road, start stripe, a heading-aware player arrow, and small
  label-free opponent dots. Static course paths are rebuilt only when the canvas size or pixel ratio
  changes; each frame updates only the four racer markers. Keep it independent from camera mode.
- Hidden inked-solid carrier roots now skip repeated matrix/anchor synchronisation after their
  proxies have been hidden. This reduces exploration-mode CPU work for parked race assets.
- Explore now uses a persistent third-person orthographic orbit camera. Mouse drag and one-finger
  pointer drag rotate around the character, wheel/pinch zoom changes distance, and `R`/`Reset camera`
  restores the over-the-shoulder angle. The camera target follows the explorer without snapping the
  orbit when the character changes heading.
- Character solids face local `+Z`, unlike the race vehicles' `+X`. Explore movement and turning now
  use the character axis, so forward advances toward the grandstand rows and left/right turn in the
  intuitive direction. The camera's orbit heading uses the same convention. The turn sign must not
  be inferred from vehicle code: with a `+Z` front, the visual right turn is a negative world yaw.
- Grandstand step geometry now owns shared spacing, depth, height, and support-surface helpers.
  Static crowd roots are placed on the actual step tops; the controllable explorer uses gravity,
  vertical velocity, maximum step-up collision, grounded support resolution, and along/away edge
  constraints. Descending a step produces a short fall instead of interpolating or hovering.
- Grandstand rows must own adjacent, non-overlapping visible spans. The previous 1.15-unit boxes
  were placed only 0.72 units apart, leaving 0.43-unit coplanar overlaps across both end faces.
  Depth-buffer competition there was amplified by the scene contour pass into dense black ladder
  artifacts during camera motion. `grandstandStepSpan` now preserves the exact external stair
  profile and walking surface while giving every visible end-face pixel one carrier owner; the
  focused regression asserts row depth, centre, and boundary adjacency.
- Each race derives 12-16 grandstand spectators from a fresh Web Crypto seed. Every row receives
  three or four continuously positioned occupants with enforced along-row clearance and small depth
  jitter, replacing the visible four-by-five seating grid while keeping feet on authored step tops.
- Spectators use seeded seven-cue loops plus independent local animation clocks. Per-person cue
  duration, schedule offset, time offset, and time scale keep `play`, `dance`, `airborne`, `idle`,
  and `sit` motion out of phase even when several people share a pose. Celebration still requests
  `dance`, but it no longer samples one common choreography phase.
- The menu is a single centered composition: its wide translucent surface owns both the setup panel
  and an explicit framed preview bay on the right. Menu camera framing uses a `1.12` world-unit
  screen offset and `6.8` view size so the procedural character remains inside that bay at the
  reported 1289x556 viewport. The preview loop starts with the shared `dance` pose; at race finish
  the crowd switches to independently clocked `dance` cues before returning to its seeded loop.
- Doodle Race owns a human-only casting boundary through `createPaperCircuitPersonIdentity`; both
  the crowd and the menu/Explore character use it, so library species such as cats, creatures,
  nightmares, and robots cannot leak into the experiment through a random identity roll.
- The menu character now owns a dedicated `DoodleScene` and canvas inside the menu rather than
  being composited into the race canvas. Desktop may keep the live circuit around the menu, while
  viewports at or below 760 CSS pixels use a full-screen vertical menu and hide the race canvas.
  The menu preview seed is authoritative when entering Explore, preventing an in-flight automatic
  reroll from showing one driver and spawning another.
- Sound effects are bundled locally. The four distinct ElevenLabs ignition variants map to the four
  racers; `RaceEngineAudioController` finds a stable 0.72-second rev window in each, builds a
  crossfaded loop, then modulates rate, low-pass frequency, gain, and stereo position from speed,
  acceleration, and braking. Countdown ticks are synthesized before the authored GO cue. The
  existing HTML-audio controller owns UI/poof/GO/drift/applause plus a generated gravel loop and
  keeps all longer layers edge-triggered. One SFX toggle and volume control govern both controllers.
  The former generated eight-second score was replaced by the user-supplied three-minute
  `main-song.opus`, transcoded from 192 kbps MP3 to 80 kbps VBR Opus (4.14 MiB to 1.79 MiB). It
  loops only while the initial menu is active. Menu and pause open the same accessible second-level
  audio mixer; keyboard/controller focus returns to the invoking surface after close.
- Race drift feedback is one bounded `race-effects` solid registered through the shared Doodle
  pass. Rear-wheel sources come from the vehicles' authored `wheel:rear:left/right` nodes. A
  single dynamic faceted mesh stores up to 512 paired skid segments, avoiding one carrier and four
  proxies per decal; 40 smoke, 28 dust, and 24 spark parts form fixed reusable pools. Road drift
  leaves rubber and smoke, off-road speed raises warm dust, and a rising impact impulse emits seven
  short-lived sparks. Entering a new race clears the field; marks otherwise persist until the ring
  buffer overwrites the oldest segments.
- Explore's default orbit framing is intentionally wider (`7.4` world-unit distance and a `1.26`
  view-size multiplier) so nearby spectators stay inside the viewport; the wheel/pinch still allows
  a closer shot. Intro/finish cinematic close views use a minimum `7.2` view size and an inset
  along-track sweep to keep crowd figures from being clipped at the frame edges.
- Explore allows a near-horizontal `0.06`-radian minimum pitch. At low pitch, the lower rays of a
  symmetric orthographic frustum can begin below the ground plane and never intersect it, producing
  a paper-coloured horizontal void that resembles a clipped viewport. The Explore projection now
  shifts its vertical window only by the amount needed to keep the lower near-plane edge at ground
  height; race, menu, intro, and finish projections remain symmetric. Browser QA at the new minimum
  confirms rendered terrain reaches the lower frame edge while the default orbit stays unchanged.
- Explore projects the library's authored solid box, sphere, and capsule colliders into swept
  ground footprints instead of maintaining another scenery approximation. Static collision covers
  barriers, tyre stacks, trees, cones, and grandstand posts; parked vehicle body colliders are
  resolved dynamically from their current rigs. Vertical overlap lets the character clear low
  objects while airborne. The existing shared `airborne` pose now owns both jump ascent and fall.
- The four procedural race vehicles remain parked near the start line in Explore. `E` inside an
  authored door sensor opens that door, hides the character, transfers the shared arcade vehicle
  state to free drive, and follows the car with the Explore orbit camera. Engine ignition/loop,
  drift audio, off-road audio, decals, smoke, and dust remain active. A second edge-triggered `E`
  near standstill exits at the authored entry socket; holding the key cannot enter and immediately
  exit. Mouse orbit sensitivity is roughly half the touch sensitivity, while touch stays unchanged.
- Driving collision now derives an oriented capsule and axle/wheel step profile from each procedural
  vehicle identity instead of representing every car as a fixed-radius circle. Motion is swept along
  the frame with an AABB broad phase, so long noses and high-speed frames cannot tunnel through a
  barrier. Barrier height is one world-layout value consumed by both visible geometry and its solid
  collider. A low step is climbable only when wheel radius, clearance, and normal impact speed allow
  it; axle support then drives root elevation and terrain pitch. A taller barrier blocks and rebounds
  before any visible chassis overlap.
- The first climbable-curb contact now clamps motion at wheel entry instead of consuming the whole
  frame displacement. It retains only 28% of inward and 62% of tangential velocity, raises a
  short-lived curb penalty that suppresses throttle and top speed, and emits one shared impact pulse.
  That pulse drives suspension/elevation bounce, the bounded spark pool, and an edge-triggered local
  synthesized suspension-thump/metal-scrape WAV. Continued support does not retrigger the event.
- Vehicle interactions now use one keyboard contract. The public vehicle manifest exposes a
  `hood:service` activation socket beyond the front bumper; proximity to that socket selects the
  hood action, while proximity to `entry:left/right` selects the matching door. Edge-triggered `E`
  opens the hood configurator, enters at a door, or exits near standstill. There is no hood pointer
  picker competing with camera drag. The internal per-racer seed remains outside the DOM; vehicle
  replacements preserve world pose, visibility, motion state, and instance ID.
- Explore interaction prompts use a second `DoodleScene` fed by the exact public vehicle blueprint,
  rig, and ink strokes. Non-selected semantic carriers are hidden and the camera is fitted to the
  selected part bounds, so the callout shows only the real authored hood or door. The library makes
  this cheap because identity, topology, interactions, and projection are already shared. The public
  family-agnostic `isolateSolidRigParts(...)` runtime helper now owns carrier isolation, ID validation,
  and immutable world-space focus bounds; the experiment owns only callout camera composition. The
  callout derives its camera offset from the Explore camera's world-forward vector transformed by
  the inverse vehicle world rotation, preserving the visible side while retaining independent fit.
- The hood configurator owns another isolated `DoodleScene` and reuses the same focused-preview
  adapter with every authored vehicle part selected. It opens the hood on its private rig and fits
  the complete resulting bounds, so the edited build remains visible regardless of the parked
  vehicle's occlusion or Explore camera. Reseeding replaces the preview source immediately while
  retaining the preview viewport's camera orbit; only focus bounds and fit change with the rig.
  Ordinary interaction callouts render authored parts closed, matching the visible parked vehicle,
  while the configurator explicitly requests an open hood. Dialog close, medium changes, renderer
  recovery, and application disposal update or release that scene.
- Suspending Explore camera input for the hood configurator must not reset the orbit. Camera
  activation only gates semantic camera axes; `RaceStage` calls `resetExplorer()` explicitly when
  entering Explore or when the user requests a camera reset. Re-enabling input after closing the
  configurator therefore preserves the exact pre-dialog yaw, pitch, and distance.
- Free-drive Explore framing adds an orthographic zoom-out baseline on entry and a further monotonic
  speed term capped at the 24-world-unit reference speed. Walking keeps the existing orbit framing;
  the transition remains smoothed by the camera controller.
- Explore now starts with a map-authored cinematic entrance. `RaceWorldLayout.explorerSpawn` owns
  the smoke entrance, initial transform, and approach waypoints; the pure entrance director owns
  materialization, a three-impulse cough, surprised discovery, two happy hops, the run, and the
  explicit control handoff. The camera descends and rotates into a close-up during smoke, holds the
  cough plus discovery acting for 4.6 seconds after the smoke clears, then blends into the exact
  default Explore orbit without a cut. Character pose still flows through the public shared motion
  runtime; the reusable `cough` pose coordinates three body accents with a slightly open mouth and
  closed eyes at each peak. Orbit, reroll, and vehicle interaction remain
  locked until handoff. A bicycle or scooter entrance is a promising future proprietary vehicle
  family and integration example, but should not be faked before that articulated asset exists.
- Input bindings remain an experiment concern rather than an asset-library concern. The local
  action/axis snapshot records keyboard, mouse, standard gamepad, and touch provenance; axes also
  retain digital/analogue kind and continuous/delta time semantics. Race and Explore adapt that one
  snapshot into vehicle or character commands, and the Explore camera consumes the same abstraction.
  Extract it into a sibling game-input package only after a second consumer validates the contract.

## Performance evidence

- The earlier fixed 20-person crowd measured 43 registered instances, 1,509 carrier parts,
  588 semantic stroke meshes, and 8,388 compositor proxies. Treat that as a historical upper
  baseline: the seeded 12-16-person crowd now varies these totals per race. The shared pass uses
  four G-buffers and a composite render call sequence.
- The bounded race-effects field adds one registration, 93 carrier parts, and 372 proxies. Its 512
  skid decals share one mutable carrier mesh, so decal history grows in vertex updates rather than
  scene registrations or part count.
- The existing synthetic 48-instance inked-solid benchmark reports approximately 6.7 ms mean
  CPU time per render in this environment, with zero steady-state per-mesh allocations. This is
  not a GPU frame-time guarantee; profile the target desktop GPU before changing pixel ratio or
  reducing scene fidelity.
- Before incremental registration, one character reroll called `DoodleScene.setAssets()` and
  rebuilt the whole 45-asset pass, measuring about 484–526 ms in the local browser. The
  `DoodleAssetRegistry` now keeps unchanged registrations resident and replaces only the matching
  instance ID: Explore/menu rerolls measured about 1.3–4.4 ms. Cache generated stroke definitions
  on long-lived crowd and vehicle assets; recreating equivalent arrays defeats identity-based diffing.

## Reuse When

Use this note when revising `experiments/doodle-racing`, especially track rules, drift feedback,
Explore camera/input, grandstand physics, responsive HUD, opponent behavior, crowd animation, or
renderer recovery.

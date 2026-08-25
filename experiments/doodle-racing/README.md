# Paper Circuit

Paper Circuit is a quasi-isometric arcade drift-racing experiment. It exercises the public
AIND Drawn multi-instance Doodle 3D pipeline with one procedural technical course, four
independently animated procedural vehicles, procedural trees, visible race fixtures, a
grandstand, and animated procedural character spectators.

The experiment deliberately owns game concerns such as input bindings, arcade handling, opponent drivers,
lap counting, ranking, collision response, drift scoring, cinematic and race cameras, and world
placement. The library remains responsible for deterministic identity, solid topology, character
and vehicle motion sampling, material projection, and shared Doodle rendering. Every collider used
by gameplay comes from a visible fixture in the same world layout.

Physical controls feed an experiment-local action-and-axis layer before either gameplay mode sees
them. Each sample retains its keyboard, mouse, gamepad, or touch origin, distinguishes digital from
analogue values, and marks camera axes as continuous or frame-delta signals. Race and Explore then
map the same semantic snapshot into their own commands. This boundary is intentionally outside the
asset library: `CharacterMotion` describes a cough, jump, or run, while a game decides which button
requests it. The module is shaped for later extraction into a sibling input package once a second
game proves the contract instead of merely admiring it.

Course geometry is compiled from an immutable normalized `CoursePathRecipe`. `compileCourseStroke`
turns a closed sampled pencil gesture into that recipe and the shared `CourseLayout`: it collapses
duplicate input, simplifies the stroke, closes and smooths the loop, rejects self-intersections,
insufficient road clearance, short paths, and unsafe turn radii, then derives the exact road samples
used by rendering and gameplay. The current menu still uses the default recipe until the drawing
surface is integrated. Each compiled layout maps the same 256 road segments used by its spline.
The four authored tyre footprints determine road contact: any overlap between one tyre and the
road keeps route progress valid, including when the vehicle centre is already beyond the edge.
Ranking freezes only after every tyre leaves the road, and respawn returns the racer to the last safe
projection. A lap requires at least 85% route coverage and rejects any contiguous missed section
longer than three track widths. The optional route-debug overlay uses the exact gameplay segments:
amber shows valid road and green shows the road covered during the current lap. The finish stripe is
the only permanent route marker.

## Run locally

```sh
pnpm dev:doodle-racing
```

Open `http://127.0.0.1:4176`. The intro menu defaults to the Oil medium and five laps, with
three, five, ten, and twenty laps available. A selected race begins with a six-second seeded
grandstand camera pass, then a three-second starting countdown. Drive with the arrow keys, WASD, or
a standard gamepad (left stick, triggers, and `A` or left-stick click for the handbrake). Use `Space` or `Shift` for the
keyboard handbrake drift, and press `P` to pause. `Esc` or `M` returns to the
menu.

The default camera follows the player with speed lead; `Aerial` tracks the player from directly
above with a wider, fixed-world view of the surrounding circuit. Oil is
the default medium, and changing medium rebuilds only the shared drawing policy while preserving
race state. Aerial deliberately omits racer labels so the road and nearby vehicles remain readable
while driving. A separate fixed-world minimap uses the authoritative `CourseLayout` to show the
complete road, start line, player heading, and unobtrusive opponent positions without racer labels.
Vehicle drift lean is applied to the chassis' local longitudinal axis while the
wheel-bearing root stays level with the road.

The menu also opens `Explore grandstand`. This is a separate presentation mode: a seeded random
character first materializes inside the existing Doodle smoke burst while the camera descends and
rotates into a close-up. Once the smoke clears, the character coughs three times with a covering
arm, partly open mouth, and closed eyes, then spends the rest of a 4.6-second close performance
looking around in surprise. They hop twice and run toward the grandstand before camera and movement
control pass to the player without a cut.
Camera orbit, character reroll, and vehicle interaction remain locked during that entrance. Every
`RaceWorldLayout` owns an `explorerSpawn` map element with the smoke entrance, initial heading, and
approach waypoints, so another course can place or redirect the sequence without changing the stage
runtime. After the handoff, the character can roam the full course map, climb authored row steps through changing floor height,
with grounded gravity, maximum step-height collision, map-edge constraints, and collision against
the world-space footprints of authored solid colliders on trees, barriers, tyres, cones, posts,
and parked vehicles. Hold `Shift` to run, press `Space` to jump with the shared `airborne` motion,
and use `N` or `New character` to reroll the character from a fresh
Web Crypto seed. The reroll keeps the current world position and plays a volumetric smoke burst
from the character's feet: it expands until the old figure is fully covered, swaps the character,
then rises and shrinks into the air before leaving the scene. Walking up the high/back side of the
grandstand is blocked by the authored maximum step height. The camera is a third-person orthographic
orbit camera: drag with the mouse or one finger to orbit, use the wheel or pinch to zoom, and press
`R` or `Reset camera` to restore the over-the-shoulder view. On a standard gamepad, the left stick
moves and turns, the right stick orbits, the shoulder buttons zoom, `A` jumps, left-stick click runs,
`X` interacts, right-stick click resets the camera, and `Y` rerolls. Coarse-pointer layouts expose
the same movement, jump, run, interaction, and camera gestures through touch controls. The race simulation is not advanced
while exploring. The four race vehicles remain parked near the start line. Approaching an authored
door sensor exposes a focused callout rendered from that exact procedural door; pressing `E` opens
it, transfers control to the car, and enables free arcade driving with engine audio, collisions,
skid marks, smoke, and dust. The Explore camera pulls farther back as vehicle speed increases. Press
`E` again near standstill to exit at the door's authored entry socket. Standing at the authored
service socket in front of the hood exposes the hood-only callout; pressing `E` opens it and launches
an accessible under-hood configurator. The dialog owns a separate Doodle 3D viewport showing the
complete selected vehicle with its hood open, so scenery and the Explore camera cannot occlude the
build being edited. The focused interaction callout converts the gameplay camera direction into the
vehicle's local frame, so orbiting Explore shows the isolated part from the same side while keeping
its own bounds-fitted zoom. `Previous`, `Next`, and
`Surprise me` browse deterministic procedural builds without exposing their internal seed; each
replacement preserves the parked vehicle's pose and updates the registered Doodle asset in place.
The kept build remains assigned to that racer when Explore ends, when the next race begins, and if
the renderer is rebuilt during the session.

## Handling model

The driving model deliberately starts from bounded arcade kinematics rather than exposing a full
vehicle simulation as a tuning surface. Steering lock reduces with speed, but opposite lock responds
quickly so a slide can be caught. A fast car can enter power oversteer through committed steering and
throttle, while the handbrake remains the more immediate route into a tighter slide. Releasing the
handbrake no longer cancels the state on that frame: throttle and steering can carry the drift, and
countersteering restores lateral grip. The follow camera looks down the actual velocity trajectory
and adds a small handling roll, so the car can rotate inside a readable frame instead of dragging the
camera wherever its nose points. A falling torque curve and continuous speed-dependent drag give
analogue throttle positions distinct sustainable speeds. Drift slip consumes part of the total
velocity budget, keeping the faster grip line and the tighter drift line as meaningful alternatives.

This direction follows Criterion's
[Vehicle Feel Masterclass](https://www.gdcvault.com/play/1025295/Vehicle-Feel-Masterclass-Balancing-Arcade),
which treats assists, camera, and exaggeration as layers over a coherent physical base; Ghost Games'
[NFS handling notes](https://www.ea.com/games/battlefield/news/under-the-hood-the-handling-model),
which use multiple drift-entry techniques and throttle to add mastery; and the practical
[arcade-racing implementation survey](https://www.gamedeveloper.com/design/implementing-racing-games-an-intro-to-different-approaches-and-their-game-design-trade-offs),
which recommends speed-sensitive steering and mechanic-by-mechanic iteration. Steve Swink's
[game-feel framework](https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient) is the
broader test: input, response, context, and feedback have to agree moment by moment.

The intro menu uses a dedicated Doodle 3D viewport for the procedural driver and its graphic
backdrop; the character is not composited into the race canvas behind the menu. On desktop the
live circuit remains visible around the centered setup composition. At narrow viewports the menu
becomes a full-screen vertical selection surface and hides the race scene completely. The preview
gallery rasterizes one procedural race car through all six public drawing media using a single
short-lived Doodle renderer, then releases its WebGL context; native radio groups provide exclusive
medium and lap selection without keeping six thumbnail renderers alive on mobile. The preview
always opens its seed-specific animation script with the shared `dance` pose, then mixes in other
actions before automatically swapping to a fresh character with the same smoke-burst transition.
`N` and the visible `New driver` control reroll the preview, and entering Explore materializes the
exact seed currently shown in that viewport.
Rerolls do not reset the camera orbit in Explore. Every playable character and spectator is human.
Each race rebuilds a sparser 12-to-16-person grandstand from a fresh seed, with continuous placement
along each row instead of a fixed seating grid. Spectators also own independent animation clocks,
cue durations, and phases. When the race finishes, the grandstand enters a dance celebration without
collapsing back into one synchronized chorus line.

The menu and race use local WAV and Opus sound effects selected or generated in ElevenLabs: a UI
click, character poof, arcade GO cue, looping drift skid, gravel/off-road layer, and finish applause.
Each of the four racers owns one variant from the same rally-car ignition generation. At runtime the
engine controller extracts a stable crossfaded rev from each matching ignition, then continuously
modulates playback rate, low-pass filtering, gain, and stereo position from speed, acceleration, and
braking. A separate steady engine clip remains available as a decode/loop fallback, and synthesized
3-2-1 ticks lead into the authored GO cue. Audio stays lazy until the first user gesture; `SFX on` /
`SFX off` controls the complete mix in both the menu and race settings.

Spectators are not static props. Their seeded cue loops mix `idle`, `play`, `dance` (a goofy Macarena-style loop), `airborne`, and `sit`
poses, happy/surprised/idle expressions, autonomous blink and gaze, and a talking mouth command;
the apparent chatter and jumps are authored character runtime animation rather than camera noise.
Per-spectator time scale and offset keep identical pose families from sharing the same limb phase.

Scene-level instance and carrier counts vary with the seeded crowd size. The inked-solid pass uses
four G-buffers plus the composite pass; hidden rigs now short-circuit matrix and anchor
synchronisation, which keeps the exploration mode from paying for the parked cars. The remaining
high-impact performance lever is reducing visible scene complexity or lowering the render pixel
ratio after profiling on the target desktop GPU, not adding per-frame allocations to the asset
runtime. Character rerolls use incremental pass registration: only the replaced character is
unregistered and compiled while every unrelated race or preview asset remains resident.

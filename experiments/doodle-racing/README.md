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
requests it. The browser adapter also tracks the most recent device that produced meaningful input;
Paper Circuit uses that presentation metadata to switch every visible control hint without changing
gameplay policy.

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
amber shows valid road and green shows the road covered during the current lap. Enabling that same
debug mode reveals a rolling FPS/frame-time readout backed by the renderer-neutral game-runtime
meter. The finish stripe is the only permanent route marker.

## Run locally

```sh
pnpm dev:doodle-racing
```

Open `http://127.0.0.1:4176`. The intro menu defaults to the Graphite medium and five laps, with
three, five, ten, and twenty laps available. A selected race begins with a six-second seeded
grandstand camera pass, then a three-second starting countdown. Drive with the arrow keys, WASD, or
a standard gamepad (left stick, triggers, and `A` or left-stick click for the handbrake). Use `Space` or `Shift` for the
keyboard handbrake drift. `Esc` or the gamepad `Menu` button toggles the pause dialog; the sole
top-right HUD button opens the same surface. It can resume, toggle music and sound effects, switch
camera and medium, or return explicitly to the main menu.
The initial menu and pause dialog both open the same second-level audio mixer for Music/SFX toggles
and independent category volumes. Inside a nested dialog or the vehicle configurator, `Esc` remains
a contextual back action; gamepad `B` closes the active surface or resumes from pause. Neither ejects
a running game directly to the main menu.

The default camera follows the player with speed lead across an 18.5-unit desktop base field and
widens adaptively on portrait screens to preserve at least 13 horizontal world units; `Aerial` tracks the player from directly
above with a wider, fixed-world view of the surrounding circuit. Graphite is
the default medium; Graphite, Ink, and Oil are available, and changing medium rebuilds only the shared drawing policy while preserving
race state. Aerial deliberately omits racer labels so the road and nearby vehicles remain readable
while driving. A separate fixed-world minimap uses the authoritative `CourseLayout` to show the
complete road, start line, player heading, and unobtrusive opponent positions without racer labels.
Vehicle drift lean is applied to the chassis' local longitudinal axis while the
wheel-bearing root stays level with the road.

The menu also opens `Explore grandstand`. This is a separate presentation mode: a seeded random
character first materializes inside the existing Doodle smoke burst while the camera descends and
settles into a low, front-facing close-up whose horizontal composition remains locked while the
character looks around. About halfway through the smoke, the character coughs three times with a
covering arm, partly open mouth, and closed eyes, then continues the close performance
looking around in surprise. They hop twice and run toward the grandstand before camera and movement
control pass to the player without a cut.
Camera orbit, character reroll, and vehicle interaction remain locked during that entrance. Every
`RaceWorldLayout` owns an `explorerSpawn` map element with the smoke entrance, initial heading, and
approach waypoints, so another course can place or redirect the sequence without changing the stage
runtime. After the handoff, the character can roam the full course map, climb authored row steps through changing floor height,
with grounded gravity, maximum step-height collision, map-edge constraints, and collision against
the world-space footprints of authored solid colliders on trees, barriers, tyres, cones, posts,
and parked vehicles. Hold `Shift` or gamepad `B` to run, press `Space` to jump with the shared `airborne` motion,
and use `N` or the pause menu's `New driver` action to reroll the character from a fresh
Web Crypto seed. The reroll keeps the current world position and plays a volumetric smoke burst
from the character's feet: it expands until the old figure is fully covered, swaps the character,
then rises and shrinks into the air before leaving the scene. Walking up the high/back side of the
grandstand is blocked by the authored maximum step height. The camera is a third-person orthographic
orbit camera: drag with the mouse or one finger to orbit, use the wheel or pinch to zoom, and press
`R` or the pause menu's `Reset camera` action to restore the over-the-shoulder view. On a standard gamepad, the left stick
moves and turns, the right stick orbits, the shoulder buttons zoom, `A` jumps, left-stick click runs,
`X` interacts, right-stick click resets the camera, and `Y` rerolls. Coarse-pointer layouts expose
the same movement, jump, run, interaction, and camera gestures through touch controls. The race simulation is not advanced
while exploring. The four race vehicles remain parked near the start line. Approaching an authored
door sensor exposes a focused callout rendered from that exact procedural door; pressing `E` opens
an entry vignette: the character turns with their back to the car, the camera moves to a face-level
close-up, and a deterministic reaction varies the pre-smirk expression and wink side. They equip
the helmet stored in an articulated backpack, step clear of the authored door swing, wait for the
door to open, turn toward the steering wheel while sitting, and move quickly to the authored driver
socket. The camera then restores the exact orbit held when the interaction started before free
arcade driving begins with engine audio, collisions, skid marks, smoke, and dust. It remains
orbitable and pulls farther back as vehicle speed increases. Press
`E` again near standstill to exit at the door's authored entry socket; the helmet then returns from
head to hand and into the backpack. Standing at the authored
service socket in front of the hood exposes the hood-only callout; pressing `E` opens it and launches
an accessible under-hood configurator. The dialog owns a separate Doodle 3D viewport showing the
complete selected vehicle with its hood open, so scenery and the Explore camera cannot occlude the
build being edited. The configurator consumes the same abstract navigation axes, confirmation, and
back actions as the main and pause menus; there is no gamepad-only event path. The focused interaction callout converts the gameplay camera direction into the
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

`RaceFlowController` turns that handling into one risk-and-release loop. Sustained angle builds a
shared flow charge; a controlled opposite-lock exit converts it into an automatic snap boost, while
a momentary transition into an opposite-direction drift counts as a linked corner instead of ending
the sequence. Passing an authored obstacle or rival with a small positive clearance adds charge only
after the danger zone has been cleared, preventing wall rubbing from farming near misses. Following
an aligned rival reduces drag progressively; leaving a mature draft laterally triggers a short
slingshot. Collisions and leaving the road clear the active flow, so none of these rewards erase the
cost of a mistake.

Three deterministic low ramps are placed on the straighter course regions and rendered through the
same public race-scenery blueprint as the other visible fixtures. Every oxide ramp has the same
behaviour; the white cross-bars are launch markings, not a different ramp type. Crossing a ramp in
its forward direction above the launch threshold produces a short airborne arc. Steering still gives
limited yaw control in the air, but tyre forces are mostly absent. A straight, settled touchdown
preserves speed and earns a short landing boost; arriving crossed up sheds speed and breaks the drift
state. The HUD announces takeoff and explains the landing objective, while a short audio cue makes
the transition perceptible even when the car is visually small.

Engine audio combines each sampled loop with a quiet synthesized tonal layer. Five overlapping speed
bands act as arcade gears: revs climb audibly inside a band, fall on an upshift, and use hysteresis on
the way back down so the sound does not chatter around a threshold. Throttle, braking, airborne
free-rev, boost, gain, and filter brightness remain secondary modulation instead of pretending that
one linear playback-rate curve can communicate speed on its own.

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
gallery rasterizes one procedural race car through the three supported drawing media using a single
short-lived Doodle renderer, then releases its WebGL context; native radio groups provide exclusive
medium and lap selection without keeping three thumbnail renderers alive on mobile. The preview
always opens its seed-specific animation script with the shared `dance` pose, then mixes in other
actions before automatically swapping to a fresh character with the same smoke-burst transition.
`N` and the visible `New driver` control reroll the preview, and entering Explore materializes the
exact seed currently shown in that viewport.
The standalone helmet starts inside a solid-only backpack with a padded back panel, deep main
compartment, base, front storage and three deterministic silhouettes: rally, roll-top, and courier.
For a rerolled menu character it remains stored throughout the smoke and for two full seconds after
the smoke finishes; the flap then opens while the helmet follows the authored storage-to-hand-to-head
equip path. The initial preview uses the same two-second delay.
Rerolls do not reset the camera orbit in Explore. Every playable character and spectator is human.
Each race rebuilds a 24-to-32-person grandstand from a fresh seed, with continuous placement along
each row instead of a fixed seating grid. Ten more spectators stand beyond authored guardrail runs:
they turn toward nearby cars, predict short-horizon impacts, and sprint farther away from the road
when a vehicle leaves the racing line toward them. A procedural start marshal holds an articulated
solid-volume green flag and waves through the countdown and launch. Spectators also own independent
animation clocks, cue durations, and phases.

The finish remains playable. The opponents continue around the circuit while the player's car brakes.
The camera flashes across the grandstand, whips toward the driver during the exit, and settles into a
smoothed rear three-quarter chase view. The driver stows the helmet and can run using the Explore movement
bindings. Grandstand and trackside spectators wait until two seconds after control unlocks, then invade
the circuit, steer around moving cars, and pursue the driver. Invaders use
the shared game-runtime spatial broad phase and soft-disc separation, while the captured-winner crowd
settles into deterministic concentric celebration slots instead of converging on one point. A bounded
subset invades while the remainder celebrates in place, preserving the scale of the audience without
turning every visible grandstand actor into a finish-line simulation. If they get close enough, control
hands over to a short orbiting cinematic in which the mob repeatedly tosses the driver into the air.
Only after that capture cinematic settles does an accessible result dialog report position and elapsed
time, then offer `Race again` with the current setup or an explicit return to the main menu. Escaping
indefinitely never triggers the dialog. Keyboard and gamepad navigation use the same focus policy as
the other menus; `Esc` or gamepad back returns to the main menu from this terminal state.

The menu and race use local WAV and Opus sound effects selected or generated in ElevenLabs: a UI
click, character poof, arcade GO cue, looping drift skid, gravel/off-road layer, and finish applause.
Each of the four racers owns one variant from the same rally-car ignition generation. At runtime the
engine controller extracts a stable crossfaded rev from each matching ignition, then continuously
modulates playback rate, low-pass filtering, gain, and stereo position from speed, acceleration, and
braking. Opponent voices use distance-aware gain so nearby rivals remain clearly audible without
turning distant cars into a constant engine wall. A separate steady engine clip remains available as a decode/loop fallback, and synthesized
3-2-1 ticks lead into the authored GO cue. Audio stays lazy until the first user gesture. Sound
effects and engine audio share the `SFX` category. The bundled `main-song.opus` theme plays on the
initial menu, while `explore-song.opus` plays only in Explore; both route through the independent
`Music` category and stop during races. Both categories expose on/off and
volume controls through the shared controller-navigable audio mixer. Medium, lap count, and the
complete audio mix persist together in browser storage on the device, making the last valid menu
configuration the next launch default.

Spectators are not static props. Their seeded cue loops mix `idle`, `play`, `dance` (a goofy Macarena-style loop), `airborne`, and `sit`
poses, happy/surprised/idle expressions, autonomous blink and gaze, and a talking mouth command;
the apparent chatter and jumps are authored character runtime animation rather than camera noise.
Per-spectator time scale and offset keep identical pose families from sharing the same limb phase.
Roadside spectators replan their escape direction while a threatening car keeps pursuing them, hold
the panic briefly after it passes, then walk back to their authored guardrail position even when another
safe car is still close enough to watch. Their product-specific state machine lives beside the trackside
role under `game/characters/trackside`; explorer, grandstand crowd, and marshal code have matching role
folders, while identity and steering primitives remain under `game/characters/shared`.

Scene-level instance and carrier counts vary with the seeded crowd size. The inked-solid pass uses
four G-buffers plus the composite pass. Hidden rigs and whole carriers outside the camera frustum now
short-circuit child-matrix, anchor, stroke, and proxy synchronisation; visible carriers retain
per-proxy frustum culling. Crowd root locomotion remains smooth, while expensive character motion is
sampled on staggered deterministic 20 Hz ticks from `@mithrilman/aind-game-runtime`. Character rerolls
use incremental pass registration: only the replaced character is unregistered and compiled while
every unrelated race or preview asset remains resident. The authored grandstand steps now also own
matching gameplay obstacles and solid colliders, so race and Explore vehicles cannot pass through
the seating volume.

On narrow viewports, the full race renderer is suspended while the menu is open. Its canvas and
inked-solid render targets shrink to one pixel and no race frame is submitted; the dedicated menu
character preview remains active. Starting a race or entering Explore restores the race renderer.

Development builds expose a deterministic route profiler at `?route-profile=1`. It skips preview
prewarming, starts a race automatically, forces all four cars along precompiled course poses for two
measured laps, and logs per-segment frame time, render CPU time, real renderer draw calls, triangles,
visible instances, and submitted proxy meshes as `Paper Circuit route performance`. The probe is
excluded from production behavior.

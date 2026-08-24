# Paper Circuit

Paper Circuit is a quasi-isometric arcade drift-racing experiment. It exercises the public
AIND Drawn multi-instance Doodle 3D pipeline with one procedural technical course, four
independently animated procedural vehicles, procedural trees, visible race fixtures, a
grandstand, and animated procedural character spectators.

The experiment deliberately owns game concerns such as input, arcade handling, opponent drivers,
lap counting, ranking, collision response, drift scoring, cinematic and race cameras, and world
placement. The library remains responsible for deterministic identity, solid topology, character
and vehicle motion sampling, material projection, and shared Doodle rendering. Every collider used
by gameplay comes from a visible fixture in the same world layout.

## Run locally

```sh
pnpm dev:doodle-racing
```

Open `http://127.0.0.1:4176`. The intro menu defaults to the Oil medium and five laps, with
three, five, ten, and twenty laps available. A selected race begins with a six-second seeded
grandstand camera pass, then a three-second starting countdown. Drive with the arrow keys or WASD,
use `Space` or `Shift` for the handbrake drift, and press `P` to pause. `Esc` or `M` returns to the
menu.

The default camera follows the player with speed lead; `Map` frames the complete circuit. Oil is
the default medium, and changing medium rebuilds only the shared drawing policy while preserving
race state. Full-course mode adds four position markers anchored to the actual vehicle transforms,
so cars remain identifiable at map scale and cannot be confused with tyre stacks. Vehicle drift
lean is applied to the chassis' local longitudinal axis while the wheel-bearing root stays level
with the road.

The menu also opens `Explore grandstand`. This is a separate presentation mode: a seeded random
character can roam the full course map, climb authored row steps through changing floor height,
with grounded gravity, maximum step-height collision, map-edge constraints, and collision against
the world-space footprints of authored solid colliders on trees, barriers, tyres, cones, posts,
and parked vehicles. Hold `Shift` to run, press `Space` to jump with the shared `airborne` motion,
and use `N` or `New character` to reroll the character from a fresh
Web Crypto seed. The reroll keeps the current world position and plays a volumetric smoke burst
from the character's feet: it expands until the old figure is fully covered, swaps the character,
then rises and shrinks into the air before leaving the scene. Walking up the high/back side of the
grandstand is blocked by the authored maximum step height. The camera is a third-person orthographic
orbit camera: drag with the mouse or one finger to orbit, use the wheel or pinch to zoom, and press
`R` or `Reset camera` to restore the over-the-shoulder view. The race simulation is not advanced
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
Rerolls do not reset the camera orbit in Explore. When the race finishes, the grandstand enters an
explicit staggered dance celebration instead of relying on a random crowd cue.

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

The scene-level diagnostics currently report 43 registered instances, 1,509 solid carrier parts,
588 semantic stroke meshes, and 8,388 compositor proxies for the full race scene. The inked-solid
pass uses four G-buffers plus the composite pass; hidden rigs now short-circuit matrix and anchor
synchronisation, which keeps the exploration mode from paying for the parked cars. The remaining
high-impact performance lever is reducing visible scene complexity or lowering the render pixel
ratio after profiling on the target desktop GPU, not adding per-frame allocations to the asset
runtime. Character rerolls use incremental pass registration: only the replaced character is
unregistered and compiled while every unrelated race or preview asset remains resident.

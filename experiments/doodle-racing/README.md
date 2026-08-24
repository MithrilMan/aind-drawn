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

Open `http://127.0.0.1:4176`. A new race begins with a six-second seeded grandstand camera pass,
then a three-second starting countdown. Drive with the arrow keys or WASD, use `Space` or `Shift`
for the handbrake drift, and press `P` to pause. Equivalent touch controls appear for narrow or
coarse-pointer layouts.

The default camera follows the player with speed lead; `Map` frames the complete circuit. Oil is
the default medium, and changing medium rebuilds only the shared drawing policy while preserving
race state. The player and all three opponents use the same bounded arcade vehicle integrator;
opponents steer toward look-ahead targets instead of snapping to the course spline.

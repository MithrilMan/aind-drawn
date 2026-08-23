# Paper Circuit

Paper Circuit is a small quasi-isometric arcade racing experiment. It exercises the public
AIND Drawn multi-instance Doodle 3D pipeline with one procedural course and four independently
animated procedural vehicles.

The experiment deliberately owns game concerns such as input, arcade handling, opponent logic,
lap counting, ranking, and camera direction. The library remains responsible for deterministic
vehicle identity, solid topology, motion sampling, material projection, and shared Doodle
rendering.

## Run locally

```sh
pnpm dev:doodle-racing
```

Open `http://127.0.0.1:4176`. Drive with the arrow keys or WASD. Press `P` to pause. The default
camera follows the player; `Full course` frames the complete circuit. Oil is the default medium,
and changing medium rebuilds only the drawing policy while preserving race state.

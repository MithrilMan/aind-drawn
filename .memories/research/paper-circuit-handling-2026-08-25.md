# Paper Circuit Handling

Last updated: 2026-08-26

## Summary

Paper Circuit's arcade vehicle model now treats drift as a controllable handling state rather than
a handbrake-held effect. It supports power-oversteer entry, carried drift, fast countersteer
recovery, speed-sensitive steering, analogue gamepad input, and trajectory-aware follow framing.
The race mode adds one shared flow loop across clean drift exits, linked corners, near misses,
draft slingshots, and active landings from authored low ramps.

## Details

- `arcade-vehicle-physics.ts` remains the single deterministic handling model used by racers and
  Explore free drive. Optional `steeringAxis`, `throttle`, and `brakePressure` values preserve all
  existing digital callers.
- High-speed steering lock falls to 74% while sign reversal responds faster than turn-in. Do not
  collapse these into one smoothing constant; quick opposite lock is part of drift recovery.
- Throttle uses a mildly progressive response, falling torque near maximum speed, and continuous
  quadratic drag. Measured sustainable road speeds are approximately 136, 176, and 192 km/h at
  35%, 70%, and full throttle; partial input must not converge to the same hard speed cap.
- Power oversteer requires road surface, speed above 15.5 world units per second, throttle above
  0.72, and committed steering. Handbrake entry stays more immediate.
- A drift carries after handbrake release while the player is still giving throttle or steering.
  Opposite steering raises lateral grip, making recovery deliberate rather than automatic.
- Gamepad mapping uses standard left stick, analogue triggers, and button `A` for handbrake. Stick
  and trigger deadzones are rescaled, not merely clipped, so full range remains available without
  idle input noise leaking into motion.
- Tall-obstacle collision response must clear `slipAngle` and `drifting`. Leaving those values stale
  lets drift carry and scoring survive a reflected velocity after impact.
- Total velocity, not only longitudinal velocity, owns the speed cap. Mature slip consumes up to
  16% of that budget. In the evaluation sequence, full-grip corner exit measured about 181 km/h,
  power drift 164 km/h at 25 degrees of slip, and handbrake drift 88 km/h at 39 degrees.
- Engine parameters consume analogue pedal values. Five overlapping speed bands now provide audible
  arcade gears: pitch and a quiet triangle-wave fundamental climb with normalized RPM, then fall on
  upshift. Band overlap provides downshift hysteresis and prevents threshold chatter. Follow camera
  lead uses `heading - slipAngle`, matching the velocity trajectory, plus a bounded handling roll
  disabled by reduced-motion preference.
- `RaceFlowController` owns reward state separately from route progress and base kinematics. A drift
  exit waits 0.32 seconds before committing, allowing an opposite-direction transition to link the
  next corner instead of releasing the charge too early.
- Near misses are awarded only after leaving a tracked clearance envelope. Barrier segments are
  grouped by authored run, so driving alongside one barrier cannot farm dozens of rewards.
- Draft strength depends on longitudinal distance, lateral alignment, and heading agreement. The
  slingshot requires at least 0.58 seconds of accumulated draft and a lateral exit; simply losing
  the target or falling behind does not trigger it.
- `RaceWorldLayout.ramps` is the source for both visible ramp meshes and deterministic launch
  sampling. Three ramps are selected from low-curvature course windows. The first appears shortly
  after the start so the mechanic is learned early.
- Ramp color has no gameplay semantics. All ramp bodies use oxide paint; three white cross-bars on
  each are launch markings. Takeoff emits a dedicated HUD event and a short engine-unload cue, while
  landing still owns the reward or penalty.
- Airborne vehicles retain limited yaw authority but almost no tyre force. A touchdown above 68%
  alignment quality grants a short boost; a crossed-up landing retains only 72-95% of horizontal
  speed and clears drift.
- Flow feedback reuses the existing HUD, camera, and engine layers: charge and draft share one meter,
  callouts describe rewards, boost widens framing, and the engine gets a short synthesized rise.
- Relevant references are linked in `experiments/doodle-racing/README.md`: Criterion's GDC vehicle
  feel talk, Ghost Games' NFS handling notes, an arcade-racing implementation survey, and Steve
  Swink's game-feel framework.
- Verification on the current concurrent worktree: 57 focused Doodle Race tests and 217 full tests
  pass; the Doodle Race production build, global typecheck, and scoped ESLint pass. Browser QA at
  1280x720 confirms that every visible ramp reads as one oxide launch surface with three white bars.
  Earlier browser QA found and corrected one bottom-HUD overlap and reported no console warnings or
  errors. Full verification reaches public API verification, then stops because the concurrently
  added extension system exports are not yet represented in `scripts/public-api.snapshot.json`.
  Flow tests cover linked countersteer boost, pass-envelope near misses, physical drafting plus
  lateral slingshot, authored ramp dimensions, clean airborne arcs, rough landing speed loss, and
  the prior 30-versus-120-Hz handling comparison.

## Reuse When

Use this note when tuning grip, drift thresholds, control devices, engine response, camera framing,
AI steering, or when adding a drift reward/boost loop. Prefer short simulation scenarios with
relative assertions over magic single-frame values.

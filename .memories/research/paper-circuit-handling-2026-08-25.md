# Paper Circuit Handling

Last updated: 2026-08-25

## Summary

Paper Circuit's arcade vehicle model now treats drift as a controllable handling state rather than
a handbrake-held effect. It supports power-oversteer entry, carried drift, fast countersteer
recovery, speed-sensitive steering, analogue gamepad input, and trajectory-aware follow framing.

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
- Engine parameters consume analogue pedal values. Follow camera lead uses `heading - slipAngle`,
  matching the velocity trajectory, plus a bounded handling roll disabled by reduced-motion preference.
- Relevant references are linked in `experiments/doodle-racing/README.md`: Criterion's GDC vehicle
  feel talk, Ghost Games' NFS handling notes, an arcade-racing implementation survey, and Steve
  Swink's game-feel framework.
- Verification on the current concurrent worktree: ESLint, TypeScript, 44 focused Doodle Race tests,
  179 full tests, public-export verification, all production experiment builds, and an earlier local
  browser reload with no renderer or console errors. Handling tests cover planted grip, both drift
  entries, carry, countersteer, analogue range, complete gamepad mapping, collision reset, and a
  bounded 30-versus-120-Hz outcome comparison.

## Reuse When

Use this note when tuning grip, drift thresholds, control devices, engine response, camera framing,
AI steering, or when adding a drift reward/boost loop. Prefer short simulation scenarios with
relative assertions over magic single-frame values.

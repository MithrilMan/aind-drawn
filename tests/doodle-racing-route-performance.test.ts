import { describe, expect, it } from 'vitest';

import { createCourseLayout } from '../experiments/doodle-racing/src/game/course.js';
import { RaceSimulation } from '../experiments/doodle-racing/src/game/race-model.js';
import { createRaceWorldLayout } from '../experiments/doodle-racing/src/game/race-world.js';
import { RoutePerformanceProbe } from '../experiments/doodle-racing/src/game/route-performance-probe.js';

describe('Doodle Racing route performance probe', () => {
  it('forces racers around the authored route and aggregates samples by route segment', () => {
    const course = createCourseLayout();
    const simulation = new RaceSimulation(course, createRaceWorldLayout(course));
    const probe = new RoutePerformanceProbe(course, 4, 1, 1);

    simulation.start();
    const warming = probe.force(simulation.snapshot(), 0);
    const measured = probe.force(warming, 2_250);

    expect(measured.phase).toBe('running');
    expect(measured.racers).toHaveLength(4);
    expect(measured.racers.every(({ steering }) => steering >= -1 && steering <= 1)).toBe(true);
    expect(measured.racers.every(({ progress }) => progress >= 0 && progress < 1)).toBe(true);

    expect(probe.record(
      16,
      12,
      { drawCalls: 120, triangles: 4_800, lines: 0, points: 0 },
      {
        registeredInstances: 8,
        visibleInstances: 6,
        carrierParts: 100,
        semanticStrokeMeshes: 20,
        proxyMeshes: 480,
        submittedProxyMeshes: 380,
        passMaterials: 12,
        compiledInstances: 8,
        dynamicInstances: 1,
        compilation: {
          artifacts: 8,
          cacheHits: 0,
          cacheMisses: 8,
          compiledBytes: 1_024,
          sourceMeshes: 480,
          compiledMeshes: 8,
        },
        renderTargets: 4,
        renderCalls: 2,
        steadyStatePerMeshAllocations: 0,
      },
    )).toBe(false);

    probe.force(measured, 3_001);
    const report = probe.report();

    expect(report).not.toBeNull();
    expect(report?.frames).toBe(1);
    expect(report?.bins).toHaveLength(4);
    expect(report?.summary.meanDrawCalls).toBe(120);
    expect(report?.summary.meanTriangles).toBe(4_800);
    expect(report?.summary.meanVisibleInstances).toBe(6);
    expect(report?.summary.meanSubmittedProxyMeshes).toBe(380);
    expect(probe.report()).toBeNull();
  });
});

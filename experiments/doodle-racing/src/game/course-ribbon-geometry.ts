import type { MeshGeometrySpec, Point3 } from '../../../../src/index.js';
import type { CourseLayout } from './course.js';

function ribbonVertices(
  layout: CourseLayout,
  innerOffset: number,
  outerOffset: number,
  elevation: number,
): readonly Point3[] {
  const vertices: Point3[] = [];
  for (const sample of layout.samples) {
    vertices.push(
      Object.freeze([
        sample.x + sample.normalX * innerOffset,
        elevation,
        sample.z + sample.normalZ * innerOffset,
      ] as const),
      Object.freeze([
        sample.x + sample.normalX * outerOffset,
        elevation,
        sample.z + sample.normalZ * outerOffset,
      ] as const),
    );
  }
  return Object.freeze(vertices);
}

export function createCourseRibbonGeometry(
  layout: CourseLayout,
  innerOffset: number,
  outerOffset: number,
  elevation = 0.035,
): MeshGeometrySpec {
  const faces = layout.samples.map((_, index) => {
    const next = (index + 1) % layout.samples.length;
    return Object.freeze([index * 2, index * 2 + 1, next * 2 + 1, next * 2]);
  });
  return Object.freeze({
    type: 'mesh',
    vertices: ribbonVertices(layout, innerOffset, outerOffset, elevation),
    faces: Object.freeze(faces),
    smooth: false,
  });
}

export function createCourseSegmentRibbonGeometry(
  layout: CourseLayout,
  segmentIndex: number,
  innerOffset: number,
  outerOffset: number,
  elevation: number,
): MeshGeometrySpec {
  const first = layout.samples[segmentIndex];
  const second = layout.samples[(segmentIndex + 1) % layout.samples.length];
  if (first === undefined || second === undefined) {
    throw new RangeError(`Unknown course segment: ${segmentIndex}`);
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze([
      Object.freeze([
        first.x + first.normalX * innerOffset,
        elevation,
        first.z + first.normalZ * innerOffset,
      ] as const),
      Object.freeze([
        first.x + first.normalX * outerOffset,
        elevation,
        first.z + first.normalZ * outerOffset,
      ] as const),
      Object.freeze([
        second.x + second.normalX * innerOffset,
        elevation,
        second.z + second.normalZ * innerOffset,
      ] as const),
      Object.freeze([
        second.x + second.normalX * outerOffset,
        elevation,
        second.z + second.normalZ * outerOffset,
      ] as const),
    ]),
    faces: Object.freeze([Object.freeze([0, 1, 3, 2])]),
    smooth: false,
  });
}

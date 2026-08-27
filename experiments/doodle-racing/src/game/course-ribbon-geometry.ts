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

export function createCourseRibbonPrismGeometry(
  layout: CourseLayout,
  innerOffset: number,
  outerOffset: number,
  bottomElevation: number,
  topElevation: number,
): MeshGeometrySpec {
  if (topElevation <= bottomElevation) {
    throw new RangeError('Course ribbon prism top must be above its bottom');
  }
  const bottom = ribbonVertices(layout, innerOffset, outerOffset, bottomElevation);
  const top = ribbonVertices(layout, innerOffset, outerOffset, topElevation);
  const topOffset = bottom.length;
  const faces: (readonly number[])[] = [];
  for (let index = 0; index < layout.samples.length; index += 1) {
    const next = (index + 1) % layout.samples.length;
    const innerBottom = index * 2;
    const outerBottom = innerBottom + 1;
    const nextInnerBottom = next * 2;
    const nextOuterBottom = nextInnerBottom + 1;
    const innerTop = topOffset + innerBottom;
    const outerTop = topOffset + outerBottom;
    const nextInnerTop = topOffset + nextInnerBottom;
    const nextOuterTop = topOffset + nextOuterBottom;
    faces.push(
      Object.freeze([innerTop, outerTop, nextOuterTop, nextInnerTop]),
      Object.freeze([outerTop, outerBottom, nextOuterBottom, nextOuterTop]),
      Object.freeze([innerBottom, innerTop, nextInnerTop, nextInnerBottom]),
      Object.freeze([innerBottom, nextInnerBottom, nextOuterBottom, outerBottom]),
    );
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze([...bottom, ...top]),
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

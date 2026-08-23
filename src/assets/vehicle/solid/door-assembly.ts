import type { Point } from '../../../core/geometry.js';
import type { Point3 } from '../../../core/geometry3.js';
import type {
  ExtrudedProfileGeometrySpec,
  MeshGeometrySpec,
  SolidPartDefinition,
  SuperellipsoidGeometrySpec,
} from '../../../contracts/solid-asset.js';
import {
  createVehicleBodySideSection,
  vehicleBodyHalfWidthAt,
} from '../identity/body-side-section.js';
import {
  vehicleSideSign,
  type VehicleIdentityRecipe,
  type VehicleSide,
} from '../identity/recipe.js';
import type { SolidVehicleLayout } from './layout.js';

export type VehicleDoorPartDefinition = Omit<SolidPartDefinition, 'semanticPartId'>;

function freezeMesh(
  vertices: readonly Point3[],
  faces: readonly (readonly number[])[],
): MeshGeometrySpec {
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices.map((vertex) => Object.freeze(vertex))),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    smooth: false,
  });
}

function plate(
  outline: readonly Point[],
  depth: number,
  bevel: number,
): ExtrudedProfileGeometrySpec {
  return Object.freeze({
    type: 'extruded-profile', outline, depth, bevel, curveSegments: 1,
  });
}

function roundedVolume(radii: Point3, exponent: number): SuperellipsoidGeometrySpec {
  return Object.freeze({
    type: 'superellipsoid', radii, exponent, widthSegments: 32, heightSegments: 20,
  });
}

function centeredPlateZ(center: number, depth: number): number {
  return center + depth * 0.5;
}

function uniqueSorted(values: readonly number[]): readonly number[] {
  return Object.freeze([...values]
    .sort((left, right) => left - right)
    .filter((value, index, sorted) => (
      index === 0 || Math.abs(value - (sorted[index - 1] ?? value)) > 1e-6
    )));
}

function warpedPanelGeometry(
  identity: VehicleIdentityRecipe,
  layout: SolidVehicleLayout,
  side: VehicleSide,
  proud: number,
  thickness: number,
): MeshGeometrySpec {
  const section = createVehicleBodySideSection(identity);
  const sideSign = vehicleSideSign(side);
  const minimumY = Math.min(...layout.doorPanelOutline.map(([, y]) => y));
  const maximumY = Math.max(...layout.doorPanelOutline.map(([, y]) => y));
  const rearX = Math.min(...layout.doorPanelOutline.map(([x]) => x));
  const frontX = Math.max(...layout.doorPanelOutline.map(([x]) => x));
  const lowerRear = layout.doorPanelOutline[0] as Point;
  const cornerRear = layout.doorPanelOutline[1] as Point;
  const cornerHeight = cornerRear[1];
  const cornerInset = lowerRear[0] - rearX;
  const sectionLevels = section.samples
    .map(([y]) => y - layout.bodyBottom)
    .filter((y) => y > cornerHeight + 1e-6 && y < maximumY - 1e-6);
  const levels = uniqueSorted([minimumY, cornerHeight, ...sectionLevels, maximumY]);
  const vertices: Point3[] = [];
  const xBoundsAt = (y: number): readonly [number, number] => {
    if (y >= cornerHeight) return [rearX, frontX];
    const amount = (y - minimumY) / Math.max(1e-9, cornerHeight - minimumY);
    const inset = cornerInset * (1 - amount);
    return [rearX + inset, frontX - inset];
  };
  for (const y of levels) {
    const [rear, front] = xBoundsAt(y);
    const halfWidth = vehicleBodyHalfWidthAt(section, layout.bodyBottom + y);
    const surfaceZ = sideSign * (halfWidth - layout.doorSurfaceHalfWidth + proud);
    vertices.push([rear, y, surfaceZ], [front, y, surfaceZ]);
  }
  const frontVertexCount = vertices.length;
  for (const vertex of vertices.slice(0, frontVertexCount)) {
    vertices.push([vertex[0], vertex[1], vertex[2] - sideSign * thickness]);
  }
  const faces: number[][] = [];
  const levelCount = levels.length;
  const frontFace = (face: number[]): number[] => sideSign === 1 ? face : [...face].reverse();
  for (let level = 0; level < levelCount - 1; level += 1) {
    const rear = level * 2;
    const front = rear + 1;
    const nextRear = rear + 2;
    const nextFront = rear + 3;
    faces.push(frontFace([rear, front, nextFront, nextRear]));
    faces.push(frontFace([
      frontVertexCount + nextRear,
      frontVertexCount + nextFront,
      frontVertexCount + front,
      frontVertexCount + rear,
    ]));
    faces.push([rear, nextRear, frontVertexCount + nextRear, frontVertexCount + rear]);
    faces.push([front, frontVertexCount + front, frontVertexCount + nextFront, nextFront]);
  }
  const finalRear = (levelCount - 1) * 2;
  const finalFront = finalRear + 1;
  faces.push(
    [0, frontVertexCount, frontVertexCount + 1, 1],
    [finalRear, finalFront, frontVertexCount + finalFront, frontVertexCount + finalRear],
  );
  return freezeMesh(vertices, faces);
}

function part(definition: VehicleDoorPartDefinition): VehicleDoorPartDefinition {
  return Object.freeze(definition);
}

/** Builds one side's recessed aperture and complete hinged door assembly. */
export function createSolidVehicleDoorParts(
  identity: VehicleIdentityRecipe,
  layout: SolidVehicleLayout,
  side: VehicleSide,
): readonly VehicleDoorPartDefinition[] {
  const sideSign = vehicleSideSign(side);
  const apertureProud = 0.001;
  const skinProud = 0.004;
  const apertureDepth = 0.012;
  const panelDepth = 0.045;
  const frameDepth = 0.032;
  const windowDepth = 0.018;
  const windowCenter = sideSign * (
    layout.cabinSideHalfWidth - layout.doorSurfaceHalfWidth + skinProud
  );
  const apertureWindowCenter = sideSign * (
    layout.cabinSideHalfWidth - layout.doorSurfaceHalfWidth + apertureProud
  );
  const openingPlacement: Point3 = [
    layout.doorHingeX,
    layout.bodyBottom,
    sideSign * layout.doorSurfaceHalfWidth,
  ];
  const parts: VehicleDoorPartDefinition[] = [
    part({
      id: `door:${side}:opening`, node: 'chassis', order: 7,
      geometry: warpedPanelGeometry(identity, layout, side, apertureProud, apertureDepth),
      materialId: 'interior', placement: Object.freeze({ position: openingPlacement }),
      castShadow: false, receiveShadow: false,
    }),
    part({
      id: `door:${side}:window-opening`, node: 'chassis', order: 7,
      geometry: plate(layout.doorWindowOutline, apertureDepth, 0.002),
      materialId: 'interior',
      placement: Object.freeze({
        position: Object.freeze([
          layout.doorHingeX,
          layout.bodyBottom,
          sideSign * layout.doorSurfaceHalfWidth
            + centeredPlateZ(apertureWindowCenter, apertureDepth),
        ] as const),
      }),
      castShadow: false, receiveShadow: false,
    }),
    part({
      id: `door:${side}`, node: `door:${side}`, order: 8,
      geometry: warpedPanelGeometry(identity, layout, side, skinProud, panelDepth),
      materialId: 'body', placement: Object.freeze({ position: [0, 0, 0] as const }),
      castShadow: true, receiveShadow: true,
    }),
  ];
  if (identity.doors.windowFrame === 'framed') {
    parts.push(part({
      id: `door:${side}:window-frame`, node: `door:${side}`, order: 8,
      geometry: plate(layout.doorWindowOutline, frameDepth, 0.006),
      materialId: 'body',
      placement: Object.freeze({
        position: Object.freeze([
          0,
          0,
          centeredPlateZ(windowCenter, frameDepth),
        ] as const),
      }),
      castShadow: true, receiveShadow: true,
    }));
  }
  parts.push(part({
    id: `door:${side}:window`, node: `door:${side}`, order: 9,
    geometry: plate(layout.doorWindowGlassOutline, windowDepth, 0.004),
    materialId: 'glass',
    placement: Object.freeze({
      position: Object.freeze([
        0,
        0,
        centeredPlateZ(windowCenter + sideSign * 0.003, windowDepth),
      ] as const),
    }),
    castShadow: false, receiveShadow: false,
  }));
  const section = createVehicleBodySideSection(identity);
  const handleHalfWidth = vehicleBodyHalfWidthAt(
    section,
    layout.bodyBottom + layout.doorHandle[1],
  );
  parts.push(part({
    id: `door:${side}:handle`, node: `door:${side}`, order: 10,
    geometry: roundedVolume([0.11, 0.025, 0.025], 2.8),
    materialId: 'accent',
    placement: Object.freeze({
      position: Object.freeze([
        layout.doorHandle[0],
        layout.doorHandle[1],
        sideSign * (handleHalfWidth - layout.doorSurfaceHalfWidth + 0.03),
      ] as const),
    }),
    castShadow: true, receiveShadow: false,
  }));
  return Object.freeze(parts);
}

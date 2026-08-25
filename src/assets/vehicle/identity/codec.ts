import { AssetValidationCollector } from '../../../validation/value-validator.js';
import {
  colorRecord,
  finishIdentity,
  validateIdentityRoot,
  validatePositiveFields,
  validateUnitFields,
} from '../../../codecs/identity-validation.js';
import {
  VEHICLE_ARCHETYPES,
  VEHICLE_HEADLIGHT_STYLES,
  VEHICLE_SIDES,
  VEHICLE_WHEEL_STYLES,
  type VehicleIdentityRecipe,
} from './recipe.js';

const DOOR_COUNTS = [2, 4] as const;
const WINDOW_FRAMES = ['framed', 'frameless'] as const;

/** Decodes an untrusted JSON value into a detached, deeply immutable vehicle identity. */
export function decodeVehicleIdentity(input: unknown): VehicleIdentityRecipe {
  const collector = new AssetValidationCollector();
  const root = validateIdentityRoot(input, 'vehicle', [
    'archetype', 'dimensions', 'body', 'cabin', 'wheels', 'doors', 'details', 'palette',
  ], collector);
  collector.oneOf(root.archetype, ['archetype'], VEHICLE_ARCHETYPES);

  const dimensions = collector.object(root.dimensions, ['dimensions'], [
    'length', 'width', 'height', 'groundClearance',
  ]);
  validatePositiveFields(dimensions, ['dimensions'], [
    'length', 'width', 'height', 'groundClearance',
  ], collector);

  const body = collector.object(root.body, ['body'], [
    'bonnetRatio', 'cargoRatio', 'beltHeightRatio', 'cornerRoundness',
  ]);
  validateUnitFields(body, ['body'], ['bonnetRatio', 'cargoRatio', 'beltHeightRatio'], collector);
  collector.number(body.cornerRoundness, ['body', 'cornerRoundness'], { exclusiveMinimum: 0 });

  const cabin = collector.object(root.cabin, ['cabin'], [
    'startRatio', 'endRatio', 'roofHeightRatio', 'windscreenSlope', 'rearSlope', 'seatCount',
  ]);
  validateUnitFields(cabin, ['cabin'], ['startRatio', 'endRatio', 'roofHeightRatio'], collector);
  validatePositiveFields(cabin, ['cabin'], ['windscreenSlope', 'rearSlope'], collector);
  collector.number(cabin.seatCount, ['cabin', 'seatCount'], { integer: true, minimum: 1 });
  if (
    typeof cabin.startRatio === 'number' && typeof cabin.endRatio === 'number'
    && !(cabin.startRatio < cabin.endRatio)
  ) {
    collector.issue(['cabin', 'endRatio'], 'identity.invariant', 'Cabin end must follow cabin start');
  }

  const wheels = collector.object(root.wheels, ['wheels'], [
    'wheelbaseRatio', 'radius', 'width', 'hubRadiusRatio', 'style',
  ]);
  validateUnitFields(wheels, ['wheels'], ['wheelbaseRatio', 'hubRadiusRatio'], collector);
  validatePositiveFields(wheels, ['wheels'], ['radius', 'width'], collector);
  collector.oneOf(wheels.style, ['wheels', 'style'], VEHICLE_WHEEL_STYLES);

  const doors = collector.object(root.doors, ['doors'], [
    'count', 'sides', 'hinge', 'windowFrame', 'openingAngle',
    'frontStartRatio', 'frontEndRatio', 'rearEndRatio',
  ]);
  collector.oneOf(doors.count, ['doors', 'count'], DOOR_COUNTS);
  const sides = collector.array(doors.sides, ['doors', 'sides']);
  collector.uniqueStrings(sides, ['doors', 'sides']);
  sides.forEach((side, index) => {
    collector.oneOf(side, ['doors', 'sides', index], VEHICLE_SIDES);
  });
  for (const side of VEHICLE_SIDES) {
    if (!sides.includes(side)) {
      collector.issue(['doors', 'sides'], 'identity.invariant', `Vehicle doors must include side ${side}`);
    }
  }
  collector.literal(doors.hinge, ['doors', 'hinge'], 'front');
  collector.oneOf(doors.windowFrame, ['doors', 'windowFrame'], WINDOW_FRAMES);
  collector.number(doors.openingAngle, ['doors', 'openingAngle'], {
    exclusiveMinimum: 0, maximum: Math.PI,
  });
  validateUnitFields(doors, ['doors'], ['frontStartRatio', 'frontEndRatio', 'rearEndRatio'], collector);
  if (
    typeof doors.frontStartRatio === 'number' && typeof doors.frontEndRatio === 'number'
    && !(doors.frontStartRatio < doors.frontEndRatio)
  ) {
    collector.issue(['doors', 'frontEndRatio'], 'identity.invariant', 'Front door end must follow its start');
  }
  if (
    typeof doors.rearEndRatio === 'number' && typeof doors.frontStartRatio === 'number'
    && doors.rearEndRatio > doors.frontStartRatio
  ) {
    collector.issue(['doors', 'rearEndRatio'], 'identity.invariant', 'Rear door cannot overlap the front door');
  }

  const details = collector.object(root.details, ['details'], [
    'roofRack', 'spoiler', 'towHitch', 'spareWheel', 'headlight',
  ]);
  for (const field of ['roofRack', 'spoiler', 'towHitch', 'spareWheel'] as const) {
    collector.boolean(details[field], ['details', field]);
  }
  collector.oneOf(details.headlight, ['details', 'headlight'], VEHICLE_HEADLIGHT_STYLES);

  colorRecord(root.palette, ['palette'], [
    'body', 'accent', 'glass', 'tyre', 'hub', 'light', 'rearLight', 'interior',
  ], collector);
  return finishIdentity(input, collector) as unknown as VehicleIdentityRecipe;
}

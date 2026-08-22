import type { MediumId } from '../../materials/medium.js';
import { chalkProjectionProvider } from './projection-providers/chalk.js';
import { graphiteProjectionProvider } from './projection-providers/graphite.js';
import { inkProjectionProvider } from './projection-providers/ink.js';
import { markerProjectionProvider } from './projection-providers/marker.js';
import { oilProjectionProvider } from './projection-providers/oil.js';
import { watercolorProjectionProvider } from './projection-providers/watercolor.js';
import type { InkedSolidMediumDefaults } from './projection-provider.js';

export type {
  InkedSolidMediumDefaults,
  InkedSolidViewMarkDefaults,
} from './projection-provider.js';

const MEDIUM_PROJECTION_PROVIDERS: Readonly<Record<MediumId, InkedSolidMediumDefaults>> =
  Object.freeze({
    graphite: graphiteProjectionProvider,
    ink: inkProjectionProvider,
    watercolor: watercolorProjectionProvider,
    oil: oilProjectionProvider,
    chalk: chalkProjectionProvider,
    marker: markerProjectionProvider,
  });

/**
 * Resolves drawing-medium policy without inspecting asset kind, material ID,
 * semantic part ID, or family vocabulary. Families declare a generic drawing
 * application on each material; the selected medium owns its projection.
 */
export function inkedSolidMediumDefaults(medium: MediumId): InkedSolidMediumDefaults {
  return MEDIUM_PROJECTION_PROVIDERS[medium];
}

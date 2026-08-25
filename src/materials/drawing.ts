/** Perceptual value is independent from the marks a renderer uses to express it. */
export type DrawingValue = 'paper' | 'light' | 'mid' | 'dark' | 'solid';

/** Gesture describes energy and regularity without naming a renderer primitive. */
export type DrawingGesture = 'quiet' | 'regular' | 'agitated' | 'granular';

export type DrawingIntent = Readonly<{
  value: DrawingValue;
  gesture: DrawingGesture;
}>;

export const DRAWING_VALUES: readonly DrawingValue[] = Object.freeze([
  'paper', 'light', 'mid', 'dark', 'solid',
]);

export const DRAWING_GESTURES: readonly DrawingGesture[] = Object.freeze([
  'quiet', 'regular', 'agitated', 'granular',
]);

export function drawingIntent(
  value: DrawingValue,
  gesture: DrawingGesture = 'regular',
): DrawingIntent {
  return Object.freeze({ value, gesture });
}

export const DRAWING_INTENTS = Object.freeze({
  paper: drawingIntent('paper', 'quiet'),
  light: drawingIntent('light', 'quiet'),
  mid: drawingIntent('mid', 'regular'),
  dark: drawingIntent('dark', 'regular'),
  solid: drawingIntent('solid', 'regular'),
  agitated: drawingIntent('mid', 'agitated'),
  granular: drawingIntent('mid', 'granular'),
});

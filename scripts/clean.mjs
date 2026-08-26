import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectories = [
  resolve('dist'),
  resolve('packages/game-runtime/dist'),
];
await Promise.all(outputDirectories.map(async (outputDirectory) => {
  await rm(outputDirectory, { recursive: true, force: true });
}));

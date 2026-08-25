import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const experimentsDirectory = resolve('dist', 'experiments');
const pagesDirectory = resolve('dist', 'pages');

await rm(pagesDirectory, { recursive: true, force: true });
await mkdir(pagesDirectory, { recursive: true });

await cp(resolve(experimentsDirectory, 'landing'), pagesDirectory, {
  recursive: true,
});
await cp(
  resolve(experimentsDirectory, 'projection-studio'),
  resolve(pagesDirectory, 'projection-studio'),
  { recursive: true },
);
await cp(
  resolve(experimentsDirectory, 'doodle-racing'),
  resolve(pagesDirectory, 'doodle-racing'),
  { recursive: true },
);

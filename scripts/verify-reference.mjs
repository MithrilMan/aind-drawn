import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, '..');
const referencesRoot = resolve(projectRoot, 'references');
const metadataPath = resolve(referencesRoot, 'kindergrimm.reference.json');

function fail(message) {
  throw new Error(`Invalid reference metadata: ${message}`);
}

function validateMetadata(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('root must be an object');
  }
  const metadata = value;
  const requiredKeys = [
    '$schema',
    'name',
    'repository',
    'checkoutDirectory',
    'referenceRef',
    'referenceCommit',
    'referenceDate',
    'reviewedAreas',
  ];
  const unexpected = Object.keys(metadata).filter((key) => !requiredKeys.includes(key));
  const missing = requiredKeys.filter((key) => !(key in metadata));
  if (missing.length > 0) fail(`missing ${missing.join(', ')}`);
  if (unexpected.length > 0) fail(`unexpected ${unexpected.join(', ')}`);
  if (typeof metadata.name !== 'string' || metadata.name.trim() === '') fail('name must be non-empty');
  if (typeof metadata.repository !== 'string') fail('repository must be a URL');
  const repositoryUrl = new URL(metadata.repository);
  if (repositoryUrl.protocol !== 'https:') fail('repository must use HTTPS');
  if (typeof metadata.checkoutDirectory !== 'string' || metadata.checkoutDirectory.trim() === '') {
    fail('checkoutDirectory must be non-empty');
  }
  if (typeof metadata.referenceRef !== 'string' || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(metadata.referenceRef)) {
    fail('referenceRef must name a branch');
  }
  if (typeof metadata.referenceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(metadata.referenceCommit)) {
    fail('referenceCommit must be a full lowercase SHA-1');
  }
  if (typeof metadata.referenceDate !== 'string' || Number.isNaN(Date.parse(metadata.referenceDate))) {
    fail('referenceDate must be an ISO date-time');
  }
  if (
    !Array.isArray(metadata.reviewedAreas)
    || metadata.reviewedAreas.length === 0
    || metadata.reviewedAreas.some((area) => typeof area !== 'string' || area.trim() === '')
    || new Set(metadata.reviewedAreas).size !== metadata.reviewedAreas.length
  ) {
    fail('reviewedAreas must contain unique non-empty paths');
  }
  return metadata;
}

const metadata = validateMetadata(JSON.parse(await readFile(metadataPath, 'utf8')));
const checkout = resolve(projectRoot, metadata.checkoutDirectory);
const relativeCheckout = relative(referencesRoot, checkout);
if (
  relativeCheckout === ''
  || relativeCheckout === '..'
  || relativeCheckout.startsWith(`..${sep}`)
  || resolve(checkout) === projectRoot
) {
  fail('checkoutDirectory must stay inside references/ and name a child directory');
}

async function git(arguments_) {
  return (await execFileAsync('git', ['-C', checkout, ...arguments_])).stdout.trim();
}

try {
  const [currentHead, origin, trackedChanges] = await Promise.all([
    git(['rev-parse', 'HEAD']),
    git(['remote', 'get-url', 'origin']),
    git(['status', '--porcelain', '--untracked-files=no']),
    git(['cat-file', '-e', `${metadata.referenceCommit}^{commit}`]),
  ]);

  if (currentHead !== metadata.referenceCommit) {
    throw new Error([
      'Reference checkout does not match the recorded revision.',
      `Recorded: ${metadata.referenceCommit}`,
      `Checkout: ${currentHead}`,
    ].join('\n'));
  }
  if (origin.replace(/\/$/, '') !== metadata.repository.replace(/\/$/, '')) {
    throw new Error([
      'Reference checkout uses a different origin.',
      `Recorded: ${metadata.repository}`,
      `Checkout: ${origin}`,
    ].join('\n'));
  }
  if (trackedChanges !== '') {
    throw new Error(`Reference checkout contains tracked changes:\n${trackedChanges}`);
  }
  console.log(`KinderGrimm reference verified: ${currentHead}`);
} catch (error) {
  console.error(`Reference checkout is unavailable or inconsistent at ${checkout}.`);
  console.error('Follow references/README.md to reconstruct it.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : '.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.template.json'), 'utf8'));
const fail = (message) => { throw new Error(message); };
const packId = manifest.packId ?? manifest.pack ?? manifest.id;
const artifacts = Array.isArray(manifest.artifacts)
  ? manifest.artifacts
  : manifest.artifactName
    ? [{ name: manifest.artifactName, url: manifest.artifactUrl, sha256: manifest.artifactSha256, size: manifest.artifactSize }]
    : [];
const loaderLabel = typeof manifest.loader === 'object' && manifest.loader
  ? manifest.loader.type ?? manifest.loader.version ?? 'object'
  : manifest.loader;

const requiredDocs = [
  'README.md',
  'docs/install.md',
  'docs/update-flow.md',
  'docs/rollback.md',
  'docs/module-requirements.md',
  'docs/runtime-evidence.md',
  'docs/gameplay-evidence.md',
  'docs/troubleshooting.md',
  'scripts/init-manual-gameplay-evidence.mjs',
  'scripts/verify-manual-gameplay-evidence.mjs',
  'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json',
  'fixtures/sky-relay/gameplay-qa/evidence/CAPTURE_CHECKLIST.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/fresh-world-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-30-minutes-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-2-hours-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/signal-crown-verification.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/no-crash-review.template.md',
  `evidence/${manifest.runtimeTarget === 'echo_native' ? 'native' : manifest.runtimeTarget === 'neoforge' ? 'neoforge' : 'standalone'}-harness-driver-manifest.template.json`
];

if (!packId?.startsWith('sky-relay-')) fail('packId must start with sky-relay-.');
if (manifest.moduleRequirements?.some((entry) => entry.id === 'echoskyrelayprotocol') !== true) {
  fail('release manifest must require echoskyrelayprotocol.');
}
if (!artifacts.length) fail('artifacts must be declared.');
for (const doc of requiredDocs) {
  if (!fs.existsSync(path.join(root, doc))) fail(`Missing required file ${doc}.`);
}

console.log(JSON.stringify({
  ok: true,
  packId,
  runtimeTarget: manifest.runtimeTarget,
  loader: loaderLabel,
  artifactFamily: manifest.moduleArtifactFamily,
  evidenceCount: Array.isArray(manifest.requiredPublicAlphaEvidence) ? manifest.requiredPublicAlphaEvidence.length : 0
}, null, 2));

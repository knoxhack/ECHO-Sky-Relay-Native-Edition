#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : '.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.template.json'), 'utf8'));
const fail = (message) => { throw new Error(message); };

const requiredDocs = [
  'README.md',
  'scripts/init-manual-gameplay-evidence.mjs',
  'scripts/test-manual-gameplay-evidence-tools.mjs',
  'scripts/verify-manual-gameplay-evidence.mjs',
  'docs/install.md',
  'docs/update-flow.md',
  'docs/rollback.md',
  'docs/gameplay-evidence.md',
  'docs/module-requirements.md',
  'docs/runtime-evidence.md',
  'docs/troubleshooting.md',
  `evidence/${manifest.runtimeTarget === 'echo_native' ? 'native' : manifest.runtimeTarget === 'neoforge' ? 'neoforge' : 'standalone'}-harness-driver-manifest.template.json`,
  'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json',
  'fixtures/sky-relay/gameplay-qa/evidence/CAPTURE_CHECKLIST.md'
];

if (!manifest.packId?.startsWith('sky-relay-')) fail('packId must start with sky-relay-.');
if (manifest.moduleRequirements?.some((entry) => entry.id === 'echoskyrelayprotocol') !== true) {
  fail('release manifest must require echoskyrelayprotocol.');
}
if (!manifest.artifacts || !Array.isArray(manifest.artifacts)) fail('artifacts must be an array.');
for (const doc of requiredDocs) {
  if (!fs.existsSync(path.join(root, doc))) fail(`Missing required file ${doc}.`);
}

console.log(JSON.stringify({
  ok: true,
  packId: manifest.packId,
  runtimeTarget: manifest.runtimeTarget,
  loader: manifest.loader,
  artifactFamily: manifest.moduleArtifactFamily,
  evidenceCount: manifest.requiredPublicAlphaEvidence.length
}, null, 2));

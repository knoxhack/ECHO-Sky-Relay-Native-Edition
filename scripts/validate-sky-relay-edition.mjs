#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : '.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.template.json'), 'utf8'));
const fail = (message) => { throw new Error(message); };
const edition = manifest.runtimeTarget === 'echo_native' ? 'native' : manifest.runtimeTarget === 'neoforge' ? 'neoforge' : 'standalone';
const releaseTagByPackId = {
  'sky-relay-native-edition': 'sky-relay-native-0.1.0-alpha',
  'sky-relay-neoforge-edition': 'sky-relay-neoforge-0.1.0-alpha',
  'sky-relay-standalone-edition': 'sky-relay-standalone-0.1.0-alpha'
};

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
  `evidence/${edition}-harness-driver-manifest.template.json`,
  'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json',
  'fixtures/sky-relay/gameplay-qa/evidence/CAPTURE_CHECKLIST.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-30-minutes-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-2-hours-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/signal-crown-verification.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/no-crash-review.template.md'
];

if (!manifest.packId?.startsWith('sky-relay-')) fail('packId must start with sky-relay-.');
if (manifest.moduleRequirements?.some((entry) => entry.id === 'echoskyrelayprotocol') !== true) {
  fail('release manifest must require echoskyrelayprotocol.');
}
if (!manifest.artifacts || !Array.isArray(manifest.artifacts)) fail('artifacts must be an array.');
for (const doc of requiredDocs) {
  if (!fs.existsSync(path.join(root, doc))) fail(`Missing required file ${doc}.`);
}

const template = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json'), 'utf8'));
const requiredSessionIds = [
  'first_30_minutes',
  'first_2_hours',
  'signal_crown_completion',
  'save_reload_verification',
  'no_crash_review'
];
if (template.run?.releaseTag !== releaseTagByPackId[manifest.packId]) {
  fail('manual evidence template run.releaseTag must match the edition public alpha tag.');
}
if (template.run?.launcherChannel !== 'alpha') fail('manual evidence template run.launcherChannel must be alpha.');
if (!Array.isArray(template.sessions)) fail('manual evidence template sessions must be an array.');
for (const sessionId of requiredSessionIds) {
  const session = template.sessions.find((entry) => entry?.id === sessionId);
  if (!session) fail(`manual evidence template missing session ${sessionId}.`);
  if (!session.evidence || typeof session.evidence !== 'object') {
    fail(`manual evidence template session ${sessionId} must include evidence links.`);
  }
}

console.log(JSON.stringify({
  ok: true,
  packId: manifest.packId,
  runtimeTarget: manifest.runtimeTarget,
  loader: manifest.loader,
  artifactFamily: manifest.moduleArtifactFamily,
  evidenceCount: manifest.requiredPublicAlphaEvidence.length
}, null, 2));

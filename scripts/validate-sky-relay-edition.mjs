#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : '.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.template.json'), 'utf8'));
const officialSelections = JSON.parse(fs.readFileSync(path.join(root, '..', 'ECHO-Modules', 'metadata', 'official-pack-module-selections.json'), 'utf8'));
const fail = (message) => { throw new Error(message); };
const edition = manifest.runtimeTarget === 'echo_native' ? 'native' : manifest.runtimeTarget === 'neoforge' ? 'neoforge' : 'standalone';
const requiredModules = officialSelections.packs['sky-relay'].modules;
const expectedFamily = {
  echo_native: 'echo-addon',
  neoforge: 'neoforge',
  echo_runtime_standalone: 'standalone'
}[manifest.runtimeTarget];
const releaseTagByPackId = {
  'sky-relay-native-edition': 'sky-relay-native-0.1.0-alpha',
  'sky-relay-neoforge-edition': 'sky-relay-neoforge-0.1.0-alpha',
  'sky-relay-standalone-edition': 'sky-relay-standalone-0.1.0-alpha'
};
const artifactByPackId = {
  'sky-relay-native-edition': {
    artifactAsset: 'sky-relay-native-edition-0.1.0.zip',
    artifactSha256: '8cf781726f5cfbd1e9d87c0c8eb3c1fc502c1e6459d66a697941f814b0fa71fa',
    artifactSize: 39163330
  },
  'sky-relay-neoforge-edition': {
    artifactAsset: 'sky-relay-neoforge-edition-0.1.0.zip',
    artifactSha256: '04fde5ab03cd89ee3717a90491d818de2659cf77cfc5ea9b0e1ad43e64a9ca7b',
    artifactSize: 40132235
  },
  'sky-relay-standalone-edition': {
    artifactAsset: 'sky-relay-standalone-edition-0.1.0.zip',
    artifactSha256: '93c7ae635467138c2b0e594d18de535ee7a25075e361e64c111b2505d84f8cf2',
    artifactSize: 40131817
  }
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
if (manifest.moduleArtifactFamily !== expectedFamily) fail(`moduleArtifactFamily must be ${expectedFamily} for ${manifest.runtimeTarget}.`);
const actualModules = (manifest.moduleRequirements ?? []).map((entry) => entry.id);
for (const moduleId of requiredModules) {
  if (!actualModules.includes(moduleId)) fail(`release manifest must require ${moduleId}.`);
}
const extraModules = actualModules.filter((moduleId) => !requiredModules.includes(moduleId));
if (actualModules.length !== requiredModules.length) fail(`release manifest must require exactly ${requiredModules.length} Sky Relay modules.`);
if (extraModules.length) fail(`release manifest has unexpected modules: ${extraModules.join(', ')}.`);
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
for (const [field, expected] of Object.entries(artifactByPackId[manifest.packId] ?? {})) {
  if (template.run?.[field] !== expected) {
    fail(`manual evidence template run.${field} must match the edition public alpha artifact.`);
  }
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
  moduleRequirements: manifest.moduleRequirements.length,
  evidenceCount: manifest.requiredPublicAlphaEvidence.length
}, null, 2));

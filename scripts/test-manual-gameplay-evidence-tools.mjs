#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const initScript = path.join(repoRoot, 'scripts', 'init-manual-gameplay-evidence.mjs');
const verifyScript = path.join(repoRoot, 'scripts', 'verify-manual-gameplay-evidence.mjs');
const evidencePath = 'fixtures/sky-relay/gameplay-qa/manual-evidence.json';
const templatePath = 'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json';
const noteTemplatePaths = [
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-30-minutes-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-2-hours-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/signal-crown-verification.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/no-crash-review.template.md'
];
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const zipFixture = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

function pngFixture(width = 1280, height = 720) {
  const header = Buffer.alloc(33);
  pngSignature.copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8;
  header[25] = 6;
  return header;
}

function run(script, root, args = []) {
  return spawnSync(process.execPath, [script, '--root', root, ...args], {
    encoding: 'utf8',
    windowsHide: true
  });
}

async function copySeedFiles(root) {
  await fs.mkdir(path.join(root, 'fixtures/sky-relay/gameplay-qa'), { recursive: true });
  await fs.copyFile(path.join(repoRoot, 'release-manifest.template.json'), path.join(root, 'release-manifest.template.json'));
  await fs.copyFile(path.join(repoRoot, templatePath), path.join(root, templatePath));
  for (const relPath of noteTemplatePaths) {
    const target = path.join(root, relPath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(repoRoot, relPath), target);
  }
}

async function writeText(root, relPath, value = 'test fixture\n') {
  const filePath = path.join(root, relPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, 'utf8');
}

function noteFixture(relPath) {
  if (relPath.includes('no-crash')) {
    return `# No Crash Review

## Reviewed Files

- Client playthrough log: client-playthrough.log reviewed
- Launcher install log: launcher-install.log reviewed
- Save snapshots: all snapshots opened
- Screenshots: all screenshots reviewed

## Required Checks

- No blocking crash: confirmed
- No world corruption: confirmed
- Save reload verified: confirmed
- Fresh world/profile confirmed: confirmed
- Known non-blocking warnings: none

## Reviewer Notes

- Reviewer: test fixture
- Date: 2026-06-11
- Decision: pass
- Follow-up: none
`;
  }
  const routeSection = relPath.includes('signal-crown') ? 'Required Completion Checks' : 'Required Route Checks';
  return `# Gameplay Notes

## Run Identity

- Pack: sky-relay-test-edition
- Release tag: sky-relay-test-0.1.0-alpha
- Tester: test fixture
- Date: 2026-06-11
- World or profile: fixture-world

## ${routeSection}

- Gate reached: confirmed
- Terminal state: confirmed
- Lens scan state: confirmed
- Save state: confirmed

## Evidence Links

- Screenshot: fixture.png
- Save snapshot: fixture.zip
- Client log: client-playthrough.log

## Notes

- Observations: fixture observations recorded
- Issues: none
- Follow-up: none
`;
}

async function writeBytes(root, relPath, value) {
  const filePath = path.join(root, relPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value);
}

async function completeEvidence(root) {
  const filePath = path.join(root, evidencePath);
  const evidence = JSON.parse(await fs.readFile(filePath, 'utf8'));
  for (const claim of Object.keys(evidence.claims)) evidence.claims[claim] = true;

  for (const relPath of evidence.supportingFiles) await writeText(root, relPath, noteFixture(relPath));
  for (const relPath of evidence.screenshots) await writeBytes(root, relPath, pngFixture());
  for (const relPath of evidence.logs) await writeText(root, relPath);
  for (const relPath of evidence.saveSnapshots) await writeBytes(root, relPath, zipFixture);

  await fs.writeFile(filePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sky-relay-edition-evidence-tools-'));
try {
  await copySeedFiles(tmp);

  const dryRun = run(initScript, tmp, ['--dry-run']);
  assert.equal(dryRun.status, 0, `${dryRun.stdout}\n${dryRun.stderr}`);
  const dryRunReport = JSON.parse(dryRun.stdout);
  assert.equal(dryRunReport.status, 'PASS');
  assert.equal(dryRunReport.noteFiles.length, 4);
  await assert.rejects(fs.stat(path.join(tmp, evidencePath)));

  const init = run(initScript, tmp);
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);
  const initReport = JSON.parse(init.stdout);
  assert.equal(initReport.status, 'PASS');
  assert.equal(initReport.willWriteEvidence, true);

  const initializedEvidence = JSON.parse(await fs.readFile(path.join(tmp, evidencePath), 'utf8'));
  assert.ok(Object.values(initializedEvidence.claims).every((claim) => claim === false));
  const initializedNote = await fs.readFile(
    path.join(tmp, 'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md'),
    'utf8'
  );
  assert.match(initializedNote, /ECHO_SKY_RELAY_TEMPLATE_ONLY/u);

  const templateOnly = run(verifyScript, tmp, ['--template-only']);
  assert.equal(templateOnly.status, 0, `${templateOnly.stdout}\n${templateOnly.stderr}`);

  const blocked = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(blocked.status, 1);
  assert.match(`${blocked.stdout}\n${blocked.stderr}`, /manualEvidence claim realFirst30Playthrough must be true|target does not exist/u);
  assert.match(`${blocked.stdout}\n${blocked.stderr}`, /template marker ECHO_SKY_RELAY_TEMPLATE_ONLY/u);

  await completeEvidence(tmp);
  const firstNotePath = 'fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md';
  await writeText(tmp, firstNotePath, noteFixture(firstNotePath).replace('- Tester: test fixture', '- Tester:'));
  const blankField = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(blankField.status, 1);
  assert.match(`${blankField.stdout}\n${blankField.stderr}`, /blank worksheet fields/u);

  await writeText(tmp, firstNotePath, noteFixture(firstNotePath).replace('## Evidence Links\n\n', ''));
  const missingSection = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(missingSection.status, 1);
  assert.match(`${missingSection.stdout}\n${missingSection.stderr}`, /missing section ## Evidence Links/u);

  await writeText(tmp, firstNotePath, noteFixture(firstNotePath));
  const ready = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(ready.status, 0, `${ready.stdout}\n${ready.stderr}`);
  const readyReport = JSON.parse(ready.stdout);
  assert.equal(readyReport.status, 'PASS');
  assert.match(readyReport.manualEvidence.checked.supportingFiles[0].sha256, /^[a-f0-9]{64}$/u);
  assert.ok(readyReport.manualEvidence.checked.supportingFiles[0].size > 100);
  assert.equal(readyReport.manualEvidence.checked.screenshots[0].size, 33);
  assert.match(readyReport.manualEvidence.checked.screenshots[0].sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(readyReport.manualEvidence.checked.screenshots[0].dimensions, { width: 1280, height: 720 });
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}

console.log('Sky Relay edition gameplay evidence tools passed.');

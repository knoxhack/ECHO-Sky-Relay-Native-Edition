#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';

const repoRoot = process.cwd();
const initScript = path.join(repoRoot, 'scripts', 'init-manual-gameplay-evidence.mjs');
const verifyScript = path.join(repoRoot, 'scripts', 'verify-manual-gameplay-evidence.mjs');
const evidencePath = 'fixtures/sky-relay/gameplay-qa/manual-evidence.json';
const templatePath = 'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json';
const noteTemplatePaths = [
  'fixtures/sky-relay/gameplay-qa/evidence/templates/fresh-world-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-30-minutes-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/first-2-hours-notes.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/signal-crown-verification.template.md',
  'fixtures/sky-relay/gameplay-qa/evidence/templates/no-crash-review.template.md'
];
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

function pngFixture(width = 1280, height = 720) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const rawScanlines = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    pngSignature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(rawScanlines)),
    pngChunk('IEND')
  ]);
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function pngHeaderOnlyFixture(width = 1280, height = 720) {
  const header = Buffer.alloc(33);
  pngSignature.copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8;
  header[25] = 0;
  return header;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipFixture(filename = 'save/level.dat', content = 'fixture save snapshot\n') {
  const name = Buffer.from(filename, 'utf8');
  const data = Buffer.from(content, 'utf8');
  const checksum = crc32(data);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(data.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(name.length, 26);

  const centralDirectoryOffset = localHeader.length + name.length + data.length;
  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(data.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);

  const centralDirectorySize = centralHeader.length + name.length;
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);

  return Buffer.concat([localHeader, name, data, centralHeader, name, endOfCentralDirectory]);
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
  const routeSection = relPath.includes('fresh-world')
    ? 'Required Fresh World Checks'
    : relPath.includes('signal-crown')
      ? 'Required Completion Checks'
      : 'Required Route Checks';
  const checks = noteChecks(relPath);
  return `# Gameplay Notes

## Run Identity

- Pack: sky-relay-test-edition
- Release tag: sky-relay-test-0.1.0-alpha
- Tester: test fixture
- Date: 2026-06-11
- World or profile: fixture-world

## ${routeSection}

${checks.map((line) => `- ${line}: confirmed`).join('\n')}

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

function noteChecks(relPath) {
  if (relPath.includes('fresh-world')) {
    return [
      'Public alpha package installed from launcher',
      'New Sky Relay profile or world created',
      'No existing save or copied world used',
      'Initial spawn loaded successfully',
      'Damaged Relay Core visible or reachable'
    ];
  }
  if (relPath.includes('first-30')) {
    return [
      'Damaged Relay Core reached',
      'Terminal relay status opened',
      'Lens scan completed',
      'Hand crank restored',
      'Small battery power restored',
      'relay_anchor_key claimed',
      'hydroponics_deck revealed and attached'
    ];
  }
  if (relPath.includes('first-2')) {
    return [
      'Food stabilized',
      'Water stabilized',
      'atmospheric_condenser built',
      'aero_salvage_yard attached',
      'relay_alloy_plate processed',
      'storm_shield_pylon built',
      'solar_wing attached',
      'Logistics route started',
      'weather_mast unlocked',
      'Severe storm survived',
      'stabilized_platform_core crafted'
    ];
  }
  return [
    'Stabilized platform core restored',
    'relay_signal_array online',
    'Storm shield network confirmed',
    'Logistics route confirmed',
    'Orbital alloy components collected',
    'Terminal restoration sequence completed',
    'sky_relay_badge awarded'
  ];
}

function releaseTagFor(packId) {
  return {
    'sky-relay-native-edition': 'sky-relay-native-0.1.0-alpha',
    'sky-relay-neoforge-edition': 'sky-relay-neoforge-0.1.0-alpha',
    'sky-relay-standalone-edition': 'sky-relay-standalone-0.1.0-alpha'
  }[packId];
}

function artifactFor(packId) {
  return {
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
  }[packId];
}

function logFixture(evidence, relPath) {
  const kind = /launcher|pack/u.test(relPath) ? 'launcher install' : 'client playthrough';
  return [
    `Sky Relay ${kind} log`,
    `Pack ID: ${evidence.packId}`,
    `Release tag: ${evidence.run.releaseTag}`,
    `Artifact asset: ${evidence.run.artifactAsset}`,
    `Artifact SHA-256: ${evidence.run.artifactSha256}`,
    `Artifact size: ${evidence.run.artifactSize}`,
    'Status: completed without blocking crash'
  ].join('\n');
}

function sessionFixture(evidence) {
  const supportingFiles = Object.fromEntries(evidence.supportingFiles.map((relPath) => [relPath, relPath]));
  const screenshots = Object.fromEntries(evidence.screenshots.map((relPath) => [relPath, relPath]));
  const saveSnapshots = Object.fromEntries(evidence.saveSnapshots.map((relPath) => [relPath, relPath]));
  const logs = Object.fromEntries(evidence.logs.map((relPath) => [relPath, relPath]));
  const find = (source, pattern) => Object.keys(source).find((relPath) => pattern.test(relPath));
  const clientLog = find(logs, /client/i);
  const launcherLog = find(logs, /(launcher|pack)[-_]?install/i);
  return [
    {
      id: 'fresh_world_creation',
      claim: 'freshWorldCreated',
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T00:02:00Z',
      durationMinutes: 2,
      evidence: {
        notes: find(supportingFiles, /fresh[-_]?world/i),
        screenshot: find(screenshots, /fresh[-_]?world/i),
        clientLog,
        launcherLog
      }
    },
    {
      id: 'first_30_minutes',
      claim: 'realFirst30Playthrough',
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T00:31:00Z',
      durationMinutes: 31,
      evidence: {
        notes: find(supportingFiles, /first[-_]?30[-_]?minutes/i),
        screenshot: find(screenshots, /first[-_]?30[-_]?minutes/i),
        saveSnapshot: find(saveSnapshots, /first[-_]?30[-_]?minutes/i),
        clientLog
      }
    },
    {
      id: 'first_2_hours',
      claim: 'realFirst2HourPlaythrough',
      startedAt: '2026-06-11T00:00:00Z',
      endedAt: '2026-06-11T02:05:00Z',
      durationMinutes: 125,
      evidence: {
        notes: find(supportingFiles, /first[-_]?2[-_]?hours/i),
        screenshot: find(screenshots, /first[-_]?2[-_]?hours/i),
        saveSnapshot: find(saveSnapshots, /first[-_]?2[-_]?hours/i),
        clientLog
      }
    },
    {
      id: 'signal_crown_completion',
      claim: 'realSignalCrownPlaythrough',
      startedAt: '2026-06-11T02:05:00Z',
      endedAt: '2026-06-11T02:20:00Z',
      durationMinutes: 15,
      evidence: {
        notes: find(supportingFiles, /signal[-_]?crown/i),
        screenshot: find(screenshots, /signal[-_]?crown/i),
        saveSnapshot: find(saveSnapshots, /signal[-_]?crown/i),
        clientLog
      }
    },
    {
      id: 'save_reload_verification',
      claim: 'saveReloadVerified',
      startedAt: '2026-06-11T02:20:00Z',
      endedAt: '2026-06-11T02:22:00Z',
      durationMinutes: 2,
      evidence: {
        first30SaveSnapshot: find(saveSnapshots, /first[-_]?30[-_]?minutes/i),
        first2HourSaveSnapshot: find(saveSnapshots, /first[-_]?2[-_]?hours/i),
        signalCrownSaveSnapshot: find(saveSnapshots, /signal[-_]?crown/i),
        clientLog
      }
    },
    {
      id: 'no_crash_review',
      claim: 'noCrashEvidence',
      startedAt: '2026-06-11T02:22:00Z',
      endedAt: '2026-06-11T02:23:00Z',
      durationMinutes: 1,
      evidence: {
        notes: find(supportingFiles, /no[-_]?crash/i),
        clientLog,
        launcherLog
      }
    }
  ];
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
  evidence.run = {
    tester: 'test fixture',
    releaseTag: releaseTagFor(evidence.packId),
    ...artifactFor(evidence.packId),
    launcherChannel: 'alpha',
    worldOrProfile: 'fixture-world',
    installedFrom: 'ECHO Launcher',
    startedAt: '2026-06-11T00:00:00Z'
  };
  evidence.sessions = sessionFixture(evidence);
  evidence.generatedAt = '2026-06-11T02:24:00Z';

  for (const relPath of evidence.supportingFiles) await writeText(root, relPath, noteFixture(relPath));
  for (const relPath of evidence.screenshots) await writeBytes(root, relPath, pngFixture());
  for (const relPath of evidence.logs) await writeText(root, relPath, logFixture(evidence, relPath));
  for (const relPath of evidence.saveSnapshots) await writeBytes(root, relPath, zipFixture());

  await fs.writeFile(filePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sky-relay-edition-evidence-tools-'));
try {
  await copySeedFiles(tmp);

  const dryRun = run(initScript, tmp, ['--dry-run']);
  assert.equal(dryRun.status, 0, `${dryRun.stdout}\n${dryRun.stderr}`);
  const dryRunReport = JSON.parse(dryRun.stdout);
  assert.equal(dryRunReport.status, 'PASS');
  assert.equal(dryRunReport.noteFiles.length, 5);
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
  const missingSessionEvidence = JSON.parse(await fs.readFile(path.join(tmp, evidencePath), 'utf8'));
  missingSessionEvidence.sessions = missingSessionEvidence.sessions.filter((session) => session.id !== 'save_reload_verification');
  await fs.writeFile(path.join(tmp, evidencePath), `${JSON.stringify(missingSessionEvidence, null, 2)}\n`, 'utf8');
  const missingSession = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(missingSession.status, 1);
  assert.match(`${missingSession.stdout}\n${missingSession.stderr}`, /sessions must include save_reload_verification/u);

  await completeEvidence(tmp);
  const missingFreshSessionEvidence = JSON.parse(await fs.readFile(path.join(tmp, evidencePath), 'utf8'));
  missingFreshSessionEvidence.sessions = missingFreshSessionEvidence.sessions.filter((session) => session.id !== 'fresh_world_creation');
  await fs.writeFile(path.join(tmp, evidencePath), `${JSON.stringify(missingFreshSessionEvidence, null, 2)}\n`, 'utf8');
  const missingFreshSession = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(missingFreshSession.status, 1);
  assert.match(`${missingFreshSession.stdout}\n${missingFreshSession.stderr}`, /sessions must include fresh_world_creation/u);

  await completeEvidence(tmp);
  const shortSessionEvidence = JSON.parse(await fs.readFile(path.join(tmp, evidencePath), 'utf8'));
  const shortSession = shortSessionEvidence.sessions.find((session) => session.id === 'first_30_minutes');
  shortSession.endedAt = '2026-06-11T00:05:00Z';
  shortSession.durationMinutes = 5;
  await fs.writeFile(path.join(tmp, evidencePath), `${JSON.stringify(shortSessionEvidence, null, 2)}\n`, 'utf8');
  const shortSessionRun = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(shortSessionRun.status, 1);
  assert.match(`${shortSessionRun.stdout}\n${shortSessionRun.stderr}`, /first_30_minutes.*durationMinutes must be at least 30/u);

  await completeEvidence(tmp);
  const mismatchedArtifactEvidence = JSON.parse(await fs.readFile(path.join(tmp, evidencePath), 'utf8'));
  mismatchedArtifactEvidence.run.artifactSha256 = 'f'.repeat(64);
  await fs.writeFile(path.join(tmp, evidencePath), `${JSON.stringify(mismatchedArtifactEvidence, null, 2)}\n`, 'utf8');
  const mismatchedArtifact = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(mismatchedArtifact.status, 1);
  assert.match(`${mismatchedArtifact.stdout}\n${mismatchedArtifact.stderr}`, /run\.artifactSha256 must be/u);

  await completeEvidence(tmp);
  const chronologyEvidence = JSON.parse(await fs.readFile(path.join(tmp, evidencePath), 'utf8'));
  const saveReloadSession = chronologyEvidence.sessions.find((session) => session.id === 'save_reload_verification');
  saveReloadSession.startedAt = '2026-06-11T02:10:00Z';
  await fs.writeFile(path.join(tmp, evidencePath), `${JSON.stringify(chronologyEvidence, null, 2)}\n`, 'utf8');
  const chronologyRun = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(chronologyRun.status, 1);
  assert.match(
    `${chronologyRun.stdout}\n${chronologyRun.stderr}`,
    /save_reload_verification\.startedAt must be at or after signal_crown_completion\.endedAt/u
  );

  await completeEvidence(tmp);
  const durationMismatchEvidence = JSON.parse(await fs.readFile(path.join(tmp, evidencePath), 'utf8'));
  const first2HourSession = durationMismatchEvidence.sessions.find((session) => session.id === 'first_2_hours');
  first2HourSession.durationMinutes = 121;
  await fs.writeFile(path.join(tmp, evidencePath), `${JSON.stringify(durationMismatchEvidence, null, 2)}\n`, 'utf8');
  const durationMismatch = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(durationMismatch.status, 1);
  assert.match(`${durationMismatch.stdout}\n${durationMismatch.stderr}`, /first_2_hours\.durationMinutes must match startedAt\/endedAt/u);

  await completeEvidence(tmp);
  const earlyGeneratedEvidence = JSON.parse(await fs.readFile(path.join(tmp, evidencePath), 'utf8'));
  earlyGeneratedEvidence.generatedAt = '2026-06-11T02:10:00Z';
  await fs.writeFile(path.join(tmp, evidencePath), `${JSON.stringify(earlyGeneratedEvidence, null, 2)}\n`, 'utf8');
  const earlyGenerated = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(earlyGenerated.status, 1);
  assert.match(`${earlyGenerated.stdout}\n${earlyGenerated.stderr}`, /generatedAt must be at or after manualEvidence\.sessions\.signal_crown_completion\.endedAt/u);

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

  await writeText(tmp, firstNotePath, noteFixture(firstNotePath).replace('hydroponics_deck revealed and attached', 'garden deck revealed and attached'));
  const missingNoteTerm = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(missingNoteTerm.status, 1);
  assert.match(`${missingNoteTerm.stdout}\n${missingNoteTerm.stderr}`, /missing required note term.*hydroponics_deck/u);

  await completeEvidence(tmp);
  const clientLogPath = 'fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log';
  await writeText(tmp, clientLogPath, '[main/FATAL] Crash report generated after failed to load world\n');
  const blockingLogSignature = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(blockingLogSignature.status, 1);
  assert.match(`${blockingLogSignature.stdout}\n${blockingLogSignature.stderr}`, /blocking log signature.*crash report/u);

  await completeEvidence(tmp);
  const launcherLogPath = 'fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log';
  await writeText(tmp, launcherLogPath, 'Sky Relay launcher install log\nStatus: completed without blocking crash\n');
  const missingLogProvenance = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(missingLogProvenance.status, 1);
  assert.match(`${missingLogProvenance.stdout}\n${missingLogProvenance.stderr}`, /missing required provenance artifactSha256/u);

  await completeEvidence(tmp);
  await writeBytes(tmp, 'fixtures/sky-relay/gameplay-qa/evidence/screenshots/fresh-world-created.png', pngHeaderOnlyFixture());
  const incompletePng = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(incompletePng.status, 1);
  assert.match(`${incompletePng.stdout}\n${incompletePng.stderr}`, /complete PNG image with valid chunks/u);

  await completeEvidence(tmp);
  await writeText(tmp, firstNotePath, noteFixture(firstNotePath));
  const ready = run(verifyScript, tmp, ['--require-release-ready']);
  assert.equal(ready.status, 0, `${ready.stdout}\n${ready.stderr}`);
  const readyReport = JSON.parse(ready.stdout);
  assert.equal(readyReport.status, 'PASS');
  assert.match(readyReport.manualEvidence.checked.supportingFiles[0].sha256, /^[a-f0-9]{64}$/u);
  assert.ok(readyReport.manualEvidence.checked.supportingFiles[0].size > 100);
  assert.ok(readyReport.manualEvidence.checked.screenshots[0].size > 33);
  assert.match(readyReport.manualEvidence.checked.screenshots[0].sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(readyReport.manualEvidence.checked.screenshots[0].dimensions, { width: 1280, height: 720 });
  assert.equal(readyReport.manualEvidence.checked.screenshots[0].idatChunks, 1);
  assert.ok(readyReport.manualEvidence.checked.screenshots[0].chunks >= 3);
  assert.equal(readyReport.manualEvidence.checked.logs[0].blockingSignatures, 0);
  assert.ok(readyReport.manualEvidence.checked.logs[0].lineCount >= 1);
  assert.deepEqual(readyReport.manualEvidence.checked.logs[0].provenanceMatches, ['packId', 'releaseTag', 'artifactAsset', 'artifactSha256', 'artifactSize']);
  assert.equal(readyReport.manualEvidence.checked.saveSnapshots[0].entries, 1);
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}

console.log('Sky Relay edition gameplay evidence tools passed.');

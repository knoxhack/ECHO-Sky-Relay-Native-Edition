#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const TEMPLATE_TIMESTAMP = '1970-01-01T00:00:00.000Z'
const EVIDENCE_ROOT = 'fixtures/sky-relay/gameplay-qa'
const EVIDENCE_DIR = `${EVIDENCE_ROOT}/evidence`
const MANUAL_EVIDENCE = `${EVIDENCE_ROOT}/manual-evidence.json`

const SUPPORTING_FILES = [
  `${EVIDENCE_DIR}/fresh-world-notes.md`,
  `${EVIDENCE_DIR}/first-30-minutes-notes.md`,
  `${EVIDENCE_DIR}/first-2-hours-notes.md`,
  `${EVIDENCE_DIR}/signal-crown-verification.md`,
  `${EVIDENCE_DIR}/no-crash-review.md`,
]

const SCREENSHOTS = [
  `${EVIDENCE_DIR}/screenshots/fresh-world-created.png`,
  `${EVIDENCE_DIR}/screenshots/first-30-minutes.png`,
  `${EVIDENCE_DIR}/screenshots/first-2-hours.png`,
  `${EVIDENCE_DIR}/screenshots/signal-crown-complete.png`,
]

const LOGS = [
  `${EVIDENCE_DIR}/logs/client-playthrough.log`,
  `${EVIDENCE_DIR}/logs/launcher-install.log`,
]

const SAVE_SNAPSHOTS = [
  `${EVIDENCE_DIR}/saves/first-30-minutes-save.zip`,
  `${EVIDENCE_DIR}/saves/first-2-hours-save.zip`,
  `${EVIDENCE_DIR}/saves/signal-crown-save.zip`,
]

const NOTE_TEMPLATES = new Map([
  [`${EVIDENCE_DIR}/fresh-world-notes.md`, `${EVIDENCE_DIR}/templates/fresh-world-notes.template.md`],
  [`${EVIDENCE_DIR}/first-30-minutes-notes.md`, `${EVIDENCE_DIR}/templates/first-30-minutes-notes.template.md`],
  [`${EVIDENCE_DIR}/first-2-hours-notes.md`, `${EVIDENCE_DIR}/templates/first-2-hours-notes.template.md`],
  [`${EVIDENCE_DIR}/signal-crown-verification.md`, `${EVIDENCE_DIR}/templates/signal-crown-verification.template.md`],
  [`${EVIDENCE_DIR}/no-crash-review.md`, `${EVIDENCE_DIR}/templates/no-crash-review.template.md`],
])

function parseArgs(argv) {
  const args = { root: process.cwd(), force: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value.`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--force') args.force = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function copyTemplateIfMissing(root, targetRel, templateRel, force) {
  const target = path.join(root, targetRel)
  if (!force && await exists(target)) return false
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.copyFile(path.join(root, templateRel), target)
  return true
}

function session(id, claim, startedAt, endedAt, durationMinutes, evidence) {
  return { id, claim, startedAt, endedAt, durationMinutes, evidence }
}

function buildManualEvidence(manifest) {
  const packId = manifest.pack ?? manifest.id
  const releaseTag = manifest.releaseTag ?? 'TBD'
  const artifactAsset = manifest.artifactName ?? 'TBD'
  const artifactSha256 = manifest.artifactSha256 ?? 'TBD'
  const artifactSize = Number(manifest.artifactSize ?? 0)
  return {
    schemaVersion: 'echo.skyrelay.gameplay-qa.manual.v1',
    packId,
    generatedAt: TEMPLATE_TIMESTAMP,
    run: {
      tester: 'TBD',
      releaseTag,
      artifactAsset,
      artifactSha256,
      artifactSize,
      launcherChannel: manifest.channel ?? 'alpha',
      worldOrProfile: 'TBD',
      installedFrom: 'ECHO Launcher',
      startedAt: TEMPLATE_TIMESTAMP,
    },
    claims: {
      realFirst30Playthrough: false,
      realFirst2HourPlaythrough: false,
      realSignalCrownPlaythrough: false,
      freshWorldCreated: false,
      saveReloadVerified: false,
      noCrashEvidence: false,
    },
    sessions: [
      session('fresh_world_creation', 'freshWorldCreated', TEMPLATE_TIMESTAMP, TEMPLATE_TIMESTAMP, 0, {
        notes: SUPPORTING_FILES[0],
        screenshot: SCREENSHOTS[0],
        clientLog: LOGS[0],
        launcherLog: LOGS[1],
      }),
      session('first_30_minutes', 'realFirst30Playthrough', TEMPLATE_TIMESTAMP, TEMPLATE_TIMESTAMP, 0, {
        notes: SUPPORTING_FILES[1],
        screenshot: SCREENSHOTS[1],
        saveSnapshot: SAVE_SNAPSHOTS[0],
        clientLog: LOGS[0],
      }),
      session('first_2_hours', 'realFirst2HourPlaythrough', TEMPLATE_TIMESTAMP, TEMPLATE_TIMESTAMP, 0, {
        notes: SUPPORTING_FILES[2],
        screenshot: SCREENSHOTS[2],
        saveSnapshot: SAVE_SNAPSHOTS[1],
        clientLog: LOGS[0],
      }),
      session('signal_crown_completion', 'realSignalCrownPlaythrough', TEMPLATE_TIMESTAMP, TEMPLATE_TIMESTAMP, 0, {
        notes: SUPPORTING_FILES[3],
        screenshot: SCREENSHOTS[3],
        saveSnapshot: SAVE_SNAPSHOTS[2],
        clientLog: LOGS[0],
      }),
      session('save_reload_verification', 'saveReloadVerified', TEMPLATE_TIMESTAMP, TEMPLATE_TIMESTAMP, 0, {
        first30SaveSnapshot: SAVE_SNAPSHOTS[0],
        first2HourSaveSnapshot: SAVE_SNAPSHOTS[1],
        signalCrownSaveSnapshot: SAVE_SNAPSHOTS[2],
        clientLog: LOGS[0],
      }),
      session('no_crash_review', 'noCrashEvidence', TEMPLATE_TIMESTAMP, TEMPLATE_TIMESTAMP, 0, {
        notes: SUPPORTING_FILES[4],
        clientLog: LOGS[0],
        launcherLog: LOGS[1],
      }),
    ],
    supportingFiles: SUPPORTING_FILES,
    screenshots: SCREENSHOTS,
    logs: LOGS,
    saveSnapshots: SAVE_SNAPSHOTS,
    capture: {
      computerUseSession: null,
    },
    notes: [
      'Template evidence only. Keep claims false until a real playthrough replaces every required file.',
      'Optional Computer Use session metadata is provenance only and does not replace notes, screenshots, logs, or save snapshots.',
    ],
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Usage: node scripts/init-manual-gameplay-evidence.mjs [--root <dir>] [--force]')
    return
  }

  const manifest = await readJson(path.join(args.root, 'release-manifest.template.json'))
  const outputPath = path.join(args.root, MANUAL_EVIDENCE)
  if (!args.force && await exists(outputPath)) {
    throw new Error(`${MANUAL_EVIDENCE} already exists. Pass --force to replace template evidence.`)
  }

  for (const dir of [
    EVIDENCE_DIR,
    `${EVIDENCE_DIR}/logs`,
    `${EVIDENCE_DIR}/saves`,
    `${EVIDENCE_DIR}/screenshots`,
  ]) {
    await fs.mkdir(path.join(args.root, dir), { recursive: true })
  }
  for (const [target, template] of NOTE_TEMPLATES) {
    await copyTemplateIfMissing(args.root, target, template, args.force)
  }
  await writeJson(outputPath, buildManualEvidence(manifest))
  console.log(`Initialized fail-closed Sky Relay gameplay evidence at ${MANUAL_EVIDENCE}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

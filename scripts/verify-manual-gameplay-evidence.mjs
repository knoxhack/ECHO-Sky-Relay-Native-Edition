#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const EVIDENCE_ROOT = 'fixtures/sky-relay/gameplay-qa'
const EVIDENCE_DIR = `${EVIDENCE_ROOT}/evidence`
const MANUAL_EVIDENCE = `${EVIDENCE_ROOT}/manual-evidence.json`
const TEMPLATE_MARKER = 'ECHO_SKY_RELAY_TEMPLATE_ONLY'
const COMPUTER_USE_SESSION_SCHEMA = 'echo.release_index.family_gameplay_computer_use_session.v1'
const CHECK_STATUSES = new Set(['captured', 'blocked', 'not-attempted'])

const REQUIRED_CLAIMS = [
  'realFirst30Playthrough',
  'realFirst2HourPlaythrough',
  'realSignalCrownPlaythrough',
  'freshWorldCreated',
  'saveReloadVerified',
  'noCrashEvidence',
]

const REQUIRED_FILES = {
  supportingFiles: [
    `${EVIDENCE_DIR}/fresh-world-notes.md`,
    `${EVIDENCE_DIR}/first-30-minutes-notes.md`,
    `${EVIDENCE_DIR}/first-2-hours-notes.md`,
    `${EVIDENCE_DIR}/signal-crown-verification.md`,
    `${EVIDENCE_DIR}/no-crash-review.md`,
  ],
  screenshots: [
    `${EVIDENCE_DIR}/screenshots/fresh-world-created.png`,
    `${EVIDENCE_DIR}/screenshots/first-30-minutes.png`,
    `${EVIDENCE_DIR}/screenshots/first-2-hours.png`,
    `${EVIDENCE_DIR}/screenshots/signal-crown-complete.png`,
  ],
  logs: [
    `${EVIDENCE_DIR}/logs/client-playthrough.log`,
    `${EVIDENCE_DIR}/logs/launcher-install.log`,
  ],
  saveSnapshots: [
    `${EVIDENCE_DIR}/saves/first-30-minutes-save.zip`,
    `${EVIDENCE_DIR}/saves/first-2-hours-save.zip`,
    `${EVIDENCE_DIR}/saves/signal-crown-save.zip`,
  ],
}

const TEMPLATE_FILES = [
  `${EVIDENCE_ROOT}/manual-evidence.template.json`,
  `${EVIDENCE_DIR}/CAPTURE_CHECKLIST.md`,
  `${EVIDENCE_DIR}/templates/fresh-world-notes.template.md`,
  `${EVIDENCE_DIR}/templates/first-30-minutes-notes.template.md`,
  `${EVIDENCE_DIR}/templates/first-2-hours-notes.template.md`,
  `${EVIDENCE_DIR}/templates/signal-crown-verification.template.md`,
  `${EVIDENCE_DIR}/templates/no-crash-review.template.md`,
]

function parseArgs(argv) {
  const args = { root: process.cwd(), templateOnly: false, requireReleaseReady: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value.`)
      return value
    }
    if (arg === '--root') args.root = path.resolve(next())
    else if (arg === '--template-only') args.templateOnly = true
    else if (arg === '--require-release-ready') args.requireReleaseReady = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function statFile(filePath) {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile() ? stat : null
  } catch {
    return null
  }
}

async function readTextIfPossible(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return ''
  }
}

function normalizeRef(value) {
  return String(value ?? '').trim().replace(/\\/g, '/')
}

function templateTimestamp(value) {
  return typeof value === 'string' && value.startsWith('1970-01-01T')
}

function placeholder(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return !normalized || ['tbd', 'todo', 'pending', 'template'].includes(normalized) || templateTimestamp(value)
}

async function verifyTemplateKit(root) {
  const blockers = []
  for (const relPath of TEMPLATE_FILES) {
    const filePath = path.join(root, relPath)
    const stat = await statFile(filePath)
    if (!stat || stat.size < 1) blockers.push(`Missing template file: ${relPath}`)
  }
  for (const relPath of TEMPLATE_FILES.filter((entry) => entry.endsWith('.template.md'))) {
    const text = await readTextIfPossible(path.join(root, relPath))
    if (!text.includes(TEMPLATE_MARKER)) blockers.push(`Template note must include ${TEMPLATE_MARKER}: ${relPath}`)
  }
  return blockers
}

async function verifyListedFiles(root, evidence) {
  const blockers = []
  for (const [group, requiredPaths] of Object.entries(REQUIRED_FILES)) {
    const listed = Array.isArray(evidence[group]) ? evidence[group].map(normalizeRef) : []
    if (!Array.isArray(evidence[group])) blockers.push(`${group} must be an array.`)
    for (const relPath of requiredPaths) {
      if (!listed.includes(relPath)) blockers.push(`${group} missing ${relPath}.`)
    }
    for (const relPath of listed) {
      const filePath = path.join(root, relPath)
      const stat = await statFile(filePath)
      if (!stat || stat.size < 1) {
        blockers.push(`${group} file is missing or empty: ${relPath}`)
        continue
      }
      if (group === 'supportingFiles' || group === 'logs') {
        const text = await readTextIfPossible(filePath)
        if (!text.trim()) blockers.push(`${group} file contains no text: ${relPath}`)
        if (text.includes(TEMPLATE_MARKER)) blockers.push(`${group} file still contains ${TEMPLATE_MARKER}: ${relPath}`)
      }
    }
  }
  return blockers
}

function validateComputerUseSession(session, evidence, expectedPackId) {
  const blockers = []
  if (session.schemaVersion !== COMPUTER_USE_SESSION_SCHEMA) {
    blockers.push(`capture.computerUseSession schemaVersion must be ${COMPUTER_USE_SESSION_SCHEMA}.`)
  }
  if (session.familyKey !== 'sky-relay') blockers.push('capture.computerUseSession familyKey must be sky-relay.')
  if (session.packId !== expectedPackId) blockers.push(`capture.computerUseSession packId must be ${expectedPackId}.`)
  if (!Array.isArray(session.actions) || session.actions.length === 0) {
    blockers.push('capture.computerUseSession must list visible Computer Use actions.')
  }
  if (Object.hasOwn(session, 'verificationChecks') && !Array.isArray(session.verificationChecks)) {
    blockers.push('capture.computerUseSession verificationChecks must be an array when present.')
  }

  const acceptedRefs = new Set(REQUIRED_CLAIMS)
  for (const group of Object.values(REQUIRED_FILES)) for (const relPath of group) acceptedRefs.add(normalizeRef(relPath))
  for (const group of ['supportingFiles', 'screenshots', 'logs', 'saveSnapshots']) {
    for (const relPath of Array.isArray(evidence[group]) ? evidence[group] : []) acceptedRefs.add(normalizeRef(relPath))
  }

  const checks = Array.isArray(session.verificationChecks) ? session.verificationChecks : []
  for (const [index, check] of checks.entries()) {
    const prefix = `capture.computerUseSession verificationChecks[${index}]`
    if (!String(check?.id ?? '').trim()) blockers.push(`${prefix}.id is required.`)
    if (!String(check?.label ?? '').trim()) blockers.push(`${prefix}.label is required.`)
    const status = String(check?.status ?? '').trim().toLowerCase()
    if (!CHECK_STATUSES.has(status)) blockers.push(`${prefix}.status must be captured, blocked, or not-attempted.`)
    if (status === 'captured') {
      const evidenceRef = normalizeRef(check.evidenceRef)
      if (!evidenceRef) blockers.push(`${prefix}.evidenceRef is required when status is captured.`)
      else if (!acceptedRefs.has(evidenceRef)) blockers.push(`${prefix}.evidenceRef must reference a required claim or local proof path.`)
    }
  }
  if (session.verificationSummary) {
    const statuses = checks.map((check) => String(check?.status ?? '').trim().toLowerCase())
    const expected = {
      checkCount: checks.length,
      capturedCount: statuses.filter((status) => status === 'captured').length,
      blockedCount: statuses.filter((status) => status === 'blocked').length,
      notAttemptedCount: statuses.filter((status) => status === 'not-attempted').length,
    }
    for (const [key, value] of Object.entries(expected)) {
      if (session.verificationSummary[key] !== value) blockers.push(`capture.computerUseSession verificationSummary.${key} must be ${value}.`)
    }
  }
  return blockers
}

async function verifyManualEvidence(root) {
  const blockers = []
  const manifest = await readJson(path.join(root, 'release-manifest.template.json'))
  const expectedPackId = manifest.pack ?? manifest.id
  const evidence = await readJson(path.join(root, MANUAL_EVIDENCE)).catch((error) => {
    blockers.push(`Manual evidence is missing or invalid JSON: ${error.message}`)
    return null
  })
  if (!evidence) return { blockers, evidence: null }

  if (evidence.schemaVersion !== 'echo.skyrelay.gameplay-qa.manual.v1') blockers.push('manual evidence schemaVersion must be echo.skyrelay.gameplay-qa.manual.v1.')
  if (evidence.packId !== expectedPackId) blockers.push(`manual evidence packId must be ${expectedPackId}.`)
  for (const field of ['tester', 'worldOrProfile', 'startedAt']) {
    if (placeholder(evidence.run?.[field])) blockers.push(`run.${field} must contain real capture data.`)
  }
  if (!Number.isFinite(Date.parse(evidence.generatedAt)) || templateTimestamp(evidence.generatedAt)) {
    blockers.push('generatedAt must be a real ISO timestamp.')
  }
  for (const claim of REQUIRED_CLAIMS) {
    if (evidence.claims?.[claim] !== true) blockers.push(`Gameplay claim ${claim} must be true.`)
  }
  if (!Array.isArray(evidence.sessions) || evidence.sessions.length < 6) blockers.push('sessions must include every required Sky Relay gameplay session.')
  else {
    for (const session of evidence.sessions) {
      if (templateTimestamp(session.startedAt) || templateTimestamp(session.endedAt)) blockers.push(`sessions.${session.id ?? 'unknown'} must use real timestamps.`)
      if (!(Number(session.durationMinutes) > 0)) blockers.push(`sessions.${session.id ?? 'unknown'} must record a positive durationMinutes.`)
    }
  }
  blockers.push(...await verifyListedFiles(root, evidence))

  const computerUsePath = normalizeRef(evidence.capture?.computerUseSession)
  if (computerUsePath) {
    const session = await readJson(path.join(root, computerUsePath)).catch((error) => {
      blockers.push(`capture.computerUseSession is missing or invalid JSON: ${error.message}`)
      return null
    })
    if (session) blockers.push(...validateComputerUseSession(session, evidence, expectedPackId))
  }

  return { blockers, evidence }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Usage: node scripts/verify-manual-gameplay-evidence.mjs [--root <dir>] [--template-only] [--require-release-ready]')
    return
  }

  const blockers = args.templateOnly
    ? await verifyTemplateKit(args.root)
    : (await verifyManualEvidence(args.root)).blockers
  const report = {
    ok: blockers.length === 0,
    releaseReady: blockers.length === 0 && !args.templateOnly,
    templateOnly: args.templateOnly,
    blockers,
  }
  console.log(JSON.stringify(report, null, 2))
  if (args.requireReleaseReady && blockers.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exit(1)
})

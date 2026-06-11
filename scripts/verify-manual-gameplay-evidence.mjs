#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_EVIDENCE = 'fixtures/sky-relay/gameplay-qa/manual-evidence.json';
const DEFAULT_TEMPLATE = 'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json';
const TEMPLATE_MARKER = 'ECHO_SKY_RELAY_TEMPLATE_ONLY';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_CENTRAL_DIRECTORY_HEADER = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const ZIP_END_OF_CENTRAL_DIRECTORY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

const REQUIRED_CLAIMS = [
  'realFirst30Playthrough',
  'realFirst2HourPlaythrough',
  'realSignalCrownPlaythrough',
  'freshWorldCreated',
  'saveReloadVerified',
  'noCrashEvidence'
];

const RELEASE_TAG_BY_PACK_ID = {
  'sky-relay-native-edition': 'sky-relay-native-0.1.0-alpha',
  'sky-relay-neoforge-edition': 'sky-relay-neoforge-0.1.0-alpha',
  'sky-relay-standalone-edition': 'sky-relay-standalone-0.1.0-alpha'
};

const EXPECTED_PUBLIC_ALPHA_ARTIFACT_BY_PACK_ID = {
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

const REQUIRED_SUPPORTING_PATTERNS = [
  /(^|\/)fresh[-_]?world[^/]*\.md$/iu,
  /(^|\/)first[-_]?30[-_]?minutes[^/]*\.md$/iu,
  /(^|\/)first[-_]?2[-_]?hours[^/]*\.md$/iu,
  /(^|\/)signal[-_]?crown[^/]*\.md$/iu,
  /(^|\/)no[-_]?crash[^/]*\.md$/iu
];

const REQUIRED_SCREENSHOT_PATTERNS = [
  /(^|\/)fresh[-_]?world[^/]*\.png$/iu,
  /(^|\/)first[-_]?30[-_]?minutes[^/]*\.png$/iu,
  /(^|\/)first[-_]?2[-_]?hours[^/]*\.png$/iu,
  /(^|\/)signal[-_]?crown[^/]*\.png$/iu
];

const REQUIRED_LOG_PATTERNS = [
  /(^|\/)client[^/]*\.log$/iu,
  /(^|\/)(launcher|pack)[-_]?install[^/]*\.log$/iu
];

const REQUIRED_SAVE_PATTERNS = [
  /(^|\/)first[-_]?30[-_]?minutes[^/]*\.zip$/iu,
  /(^|\/)first[-_]?2[-_]?hours[^/]*\.zip$/iu,
  /(^|\/)signal[-_]?crown[^/]*\.zip$/iu
];

const BLOCKING_LOG_SIGNATURES = [
  { label: 'crash report', pattern: /\bcrash report\b/iu },
  { label: 'client crashed', pattern: /\bcrashed\b/iu },
  { label: 'fatal error', pattern: /\bfatal\b/iu },
  { label: 'uncaught exception', pattern: /\buncaught exception\b/iu },
  { label: 'unhandled exception', pattern: /\bunhandled exception\b/iu },
  { label: 'exception in thread', pattern: /\bexception in thread\b/iu },
  { label: 'world or save corruption', pattern: /\b(world|save)\s+corrupt(?:ed|ion)\b/iu },
  { label: 'failed to load world', pattern: /\bfailed to load world\b/iu }
];

const JAVA_STACK_TRACE_LINE = /^\s+at\s+[\w.$/]+\(.*:\d+\)$/mu;

const NOTE_SECTION_REQUIREMENTS = [
  {
    pattern: /(^|\/)fresh[-_]?world[^/]*\.md$/iu,
    sections: ['## Run Identity', '## Required Fresh World Checks', '## Evidence Links', '## Notes'],
    terms: ['public alpha', 'new sky relay', 'no existing save', 'initial spawn', 'damaged relay core']
  },
  {
    pattern: /(^|\/)first[-_]?30[-_]?minutes[^/]*\.md$/iu,
    sections: ['## Run Identity', '## Required Route Checks', '## Evidence Links', '## Notes'],
    terms: ['damaged relay core', 'terminal', 'lens', 'hand crank', 'small battery', 'relay_anchor_key', 'hydroponics_deck']
  },
  {
    pattern: /(^|\/)first[-_]?2[-_]?hours[^/]*\.md$/iu,
    sections: ['## Run Identity', '## Required Route Checks', '## Evidence Links', '## Notes'],
    terms: [
      'food',
      'water',
      'atmospheric_condenser',
      'aero_salvage_yard',
      'relay_alloy_plate',
      'storm_shield_pylon',
      'solar_wing',
      'logistics',
      'weather_mast',
      'severe storm',
      'stabilized_platform_core'
    ]
  },
  {
    pattern: /(^|\/)signal[-_]?crown[^/]*\.md$/iu,
    sections: ['## Run Identity', '## Required Completion Checks', '## Evidence Links', '## Notes'],
    terms: ['stabilized platform core', 'relay_signal_array', 'storm shield', 'logistics', 'orbital alloy', 'terminal restoration', 'sky_relay_badge']
  },
  {
    pattern: /(^|\/)no[-_]?crash[^/]*\.md$/iu,
    sections: ['## Reviewed Files', '## Required Checks', '## Reviewer Notes'],
    terms: ['client playthrough log', 'launcher install log', 'no blocking crash', 'no world corruption', 'save reload', 'fresh world', 'known non-blocking warnings']
  }
];

const BLANK_NOTE_FIELD = /^-\s+[^:\n]+:\s*$/gmu;

const REQUIRED_SESSIONS = [
  {
    id: 'fresh_world_creation',
    claim: 'freshWorldCreated',
    minDurationMinutes: 1,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[0] },
      screenshot: { list: 'screenshots', pattern: REQUIRED_SCREENSHOT_PATTERNS[0] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] },
      launcherLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[1] }
    }
  },
  {
    id: 'first_30_minutes',
    claim: 'realFirst30Playthrough',
    minDurationMinutes: 30,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[1] },
      screenshot: { list: 'screenshots', pattern: REQUIRED_SCREENSHOT_PATTERNS[1] },
      saveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[0] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] }
    }
  },
  {
    id: 'first_2_hours',
    claim: 'realFirst2HourPlaythrough',
    minDurationMinutes: 120,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[2] },
      screenshot: { list: 'screenshots', pattern: REQUIRED_SCREENSHOT_PATTERNS[2] },
      saveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[1] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] }
    }
  },
  {
    id: 'signal_crown_completion',
    claim: 'realSignalCrownPlaythrough',
    minDurationMinutes: 1,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[3] },
      screenshot: { list: 'screenshots', pattern: REQUIRED_SCREENSHOT_PATTERNS[3] },
      saveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[2] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] }
    }
  },
  {
    id: 'save_reload_verification',
    claim: 'saveReloadVerified',
    minDurationMinutes: 1,
    evidence: {
      first30SaveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[0] },
      first2HourSaveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[1] },
      signalCrownSaveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[2] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] }
    }
  },
  {
    id: 'no_crash_review',
    claim: 'noCrashEvidence',
    minDurationMinutes: 1,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[4] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] },
      launcherLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[1] }
    }
  }
];

const REQUIRED_SESSION_ORDER = [
  'fresh_world_creation',
  'first_30_minutes',
  'first_2_hours',
  'signal_crown_completion',
  'save_reload_verification',
  'no_crash_review'
];

const SESSION_CHRONOLOGY_RULES = [
  {
    earlierId: 'fresh_world_creation',
    earlierField: 'startedAt',
    laterId: 'first_30_minutes',
    laterField: 'startedAt'
  },
  {
    earlierId: 'first_30_minutes',
    earlierField: 'startedAt',
    laterId: 'first_2_hours',
    laterField: 'startedAt'
  },
  {
    earlierId: 'first_30_minutes',
    earlierField: 'endedAt',
    laterId: 'first_2_hours',
    laterField: 'endedAt'
  },
  {
    earlierId: 'first_2_hours',
    earlierField: 'endedAt',
    laterId: 'signal_crown_completion',
    laterField: 'startedAt'
  },
  {
    earlierId: 'signal_crown_completion',
    earlierField: 'endedAt',
    laterId: 'save_reload_verification',
    laterField: 'startedAt'
  },
  {
    earlierId: 'save_reload_verification',
    earlierField: 'endedAt',
    laterId: 'no_crash_review',
    laterField: 'startedAt'
  }
];

function usage() {
  return `Usage: node scripts/verify-manual-gameplay-evidence.mjs [options]

Verifies this Sky Relay edition's manual gameplay evidence. By default missing
manual evidence is reported as BLOCKED but exits zero. Use --require-release-ready
to fail while evidence is missing or incomplete.

Options:
  --root <dir>                Edition repository root. Default: current directory.
  --evidence <path>           Manual evidence JSON. Default: ${DEFAULT_EVIDENCE}
  --template <path>           Manual evidence template. Default: ${DEFAULT_TEMPLATE}
  --template-only             Validate only the template contract for CI.
  --require-release-ready     Exit non-zero unless real manual evidence passes.
  --help                      Print this help text.
`;
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    evidence: DEFAULT_EVIDENCE,
    template: DEFAULT_TEMPLATE,
    templateOnly: false,
    requireReleaseReady: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === '--root') args.root = path.resolve(next());
    else if (arg === '--evidence') args.evidence = next();
    else if (arg === '--template') args.template = next();
    else if (arg === '--template-only') args.templateOnly = true;
    else if (arg === '--require-release-ready') args.requireReleaseReady = true;
    else if (arg === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function normalizeRel(value) {
  return String(value).replace(/\\/g, '/');
}

function resolveInside(root, relPath) {
  if (typeof relPath !== 'string' || relPath.trim() === '' || path.isAbsolute(relPath)) {
    return { error: 'relative-path-required' };
  }
  const base = path.resolve(root);
  const target = path.resolve(base, relPath);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { error: 'outside-root', target };
  return { target };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function fileSize(filePath) {
  return (await fs.stat(filePath)).size;
}

async function sha256File(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
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

async function pngImageInfo(filePath) {
  const bytes = await fs.readFile(filePath);
  if (bytes.length < PNG_SIGNATURE.length + 12 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;

  let offset = PNG_SIGNATURE.length;
  let dimensions = null;
  let chunkCount = 0;
  let idatChunks = 0;

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (dataEnd > bytes.length || crcEnd > bytes.length) return null;

    const typeBytes = bytes.subarray(typeStart, dataStart);
    const type = typeBytes.toString('ascii');
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    const actualCrc = crc32(Buffer.concat([typeBytes, bytes.subarray(dataStart, dataEnd)]));
    if (expectedCrc !== actualCrc) return null;

    chunkCount += 1;
    if (!dimensions && type !== 'IHDR') return null;
    if (type === 'IHDR') {
      if (dimensions || length !== 13) return null;
      dimensions = {
        width: bytes.readUInt32BE(dataStart),
        height: bytes.readUInt32BE(dataStart + 4)
      };
      if (dimensions.width < 1 || dimensions.height < 1) return null;
    } else if (type === 'IDAT') {
      if (!dimensions) return null;
      idatChunks += 1;
    } else if (type === 'IEND') {
      if (length !== 0 || !dimensions || idatChunks < 1 || crcEnd !== bytes.length) return null;
      return { dimensions, chunks: chunkCount, idatChunks };
    }

    offset = crcEnd;
  }

  return null;
}

async function zipArchiveInfo(filePath) {
  const bytes = await fs.readFile(filePath);
  const eocdIndex = bytes.lastIndexOf(ZIP_END_OF_CENTRAL_DIRECTORY);
  if (eocdIndex < 0 || eocdIndex + 22 > bytes.length) return null;
  const commentLength = bytes.readUInt16LE(eocdIndex + 20);
  if (eocdIndex + 22 + commentLength > bytes.length) return null;
  const entryCount = bytes.readUInt16LE(eocdIndex + 10);
  const centralDirectorySize = bytes.readUInt32LE(eocdIndex + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdIndex + 16);
  if (entryCount < 1) return null;
  if (centralDirectoryOffset + centralDirectorySize > eocdIndex) return null;
  if (!bytes.subarray(0, ZIP_LOCAL_FILE_HEADER.length).equals(ZIP_LOCAL_FILE_HEADER)) return null;
  if (!bytes.subarray(centralDirectoryOffset, centralDirectoryOffset + ZIP_CENTRAL_DIRECTORY_HEADER.length).equals(ZIP_CENTRAL_DIRECTORY_HEADER)) return null;
  return { entries: entryCount, centralDirectorySize };
}

function uniqueStrings(values) {
  return new Set(values.map(normalizeRel)).size === values.length;
}

function matchesAny(values, pattern) {
  return values.some((value) => pattern.test(normalizeRel(value)));
}

function hasPath(values, relPath) {
  return Array.isArray(values) && values.some((value) => normalizeRel(value) === normalizeRel(relPath));
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isTemplateTimestamp(value) {
  return typeof value === 'string' && value.startsWith('1970-01-01T');
}

function isPlaceholderText(value) {
  if (typeof value !== 'string') return true;
  const normalized = value.trim().toLowerCase();
  return normalized === '' || ['tbd', 'todo', 'pending', 'template'].includes(normalized);
}

function timestampMs(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function elapsedMinutesBetween(startedAt, endedAt) {
  const start = timestampMs(startedAt);
  const end = timestampMs(endedAt);
  if (start === null || end === null) return null;
  return (end - start) / 60000;
}

function validatePathListShape({ root, label, values, minItems, requiredPatterns, blockers }) {
  if (!Array.isArray(values)) {
    blockers.push(`${label} must be an array.`);
    return;
  }
  if (values.length < minItems) blockers.push(`${label} must contain at least ${minItems} item(s).`);
  if (!uniqueStrings(values)) blockers.push(`${label} must not contain duplicate paths.`);
  for (const pattern of requiredPatterns) {
    if (!matchesAny(values, pattern)) blockers.push(`${label} must include a path matching ${pattern}.`);
  }
  for (const [index, relPath] of values.entries()) {
    const resolved = resolveInside(root, relPath);
    if (resolved.error === 'relative-path-required') blockers.push(`${label}[${index}] must be a relative file path.`);
    if (resolved.error === 'outside-root') blockers.push(`${label}[${index}] points outside the repo: ${relPath}`);
  }
}

function validateMarkdownNote({ text, relPath, label, index, blockers }) {
  if (text.includes(TEMPLATE_MARKER)) {
    blockers.push(`${label}[${index}] target still contains template marker ${TEMPLATE_MARKER}: ${relPath}`);
  }
  const requirement = NOTE_SECTION_REQUIREMENTS.find((item) => item.pattern.test(normalizeRel(relPath)));
  if (!requirement) return;
  for (const section of requirement.sections) {
    if (!text.includes(section)) {
      blockers.push(`${label}[${index}] target is missing section ${section}: ${relPath}`);
    }
  }
  const normalizedText = normalizeNoteText(text);
  for (const term of requirement.terms ?? []) {
    if (!normalizedText.includes(normalizeNoteText(term))) {
      blockers.push(`${label}[${index}] target is missing required note term "${term}": ${relPath}`);
    }
  }
  if (BLANK_NOTE_FIELD.test(text)) {
    blockers.push(`${label}[${index}] target still contains blank worksheet fields: ${relPath}`);
  }
  BLANK_NOTE_FIELD.lastIndex = 0;
}

function normalizeNoteText(value) {
  return String(value)
    .toLowerCase()
    .replace(/[`*_]/gu, ' ')
    .replace(/[-/]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function validateGameplayLog({ text, relPath, label, index, blockers, provenance }) {
  const signatures = [];
  for (const signature of BLOCKING_LOG_SIGNATURES) {
    if (signature.pattern.test(text)) signatures.push(signature.label);
  }
  if (JAVA_STACK_TRACE_LINE.test(text)) signatures.push('java stack trace');

  for (const signature of signatures) {
    blockers.push(`${label}[${index}] target contains blocking log signature "${signature}": ${relPath}`);
  }

  const provenanceMatches = [];
  for (const [field, value] of Object.entries(provenance ?? {})) {
    if (value === undefined || value === null || value === '') {
      blockers.push(`${label}[${index}] cannot validate missing provenance field ${field}: ${relPath}`);
      continue;
    }
    if (!text.includes(String(value))) {
      blockers.push(`${label}[${index}] target is missing required provenance ${field}=${value}: ${relPath}`);
    } else {
      provenanceMatches.push(field);
    }
  }

  return {
    lineCount: text.split(/\r?\n/u).filter((line) => line.trim()).length,
    blockingSignatures: signatures.length,
    provenanceMatches
  };
}

function validateRunIdentity({ manifest, evidence, label, blockers, requireReal }) {
  if (!evidence.run || typeof evidence.run !== 'object' || Array.isArray(evidence.run)) {
    blockers.push(`${label}.run must be an object.`);
    return;
  }
  const expectedTag = RELEASE_TAG_BY_PACK_ID[manifest.packId];
  if (expectedTag && evidence.run.releaseTag !== expectedTag) {
    blockers.push(`${label}.run.releaseTag must be ${expectedTag}.`);
  }
  const expectedArtifact = EXPECTED_PUBLIC_ALPHA_ARTIFACT_BY_PACK_ID[manifest.packId];
  if (!expectedArtifact) {
    blockers.push(`${label}.run expected public alpha artifact is not configured for ${manifest.packId}.`);
  } else {
    for (const [field, expected] of Object.entries(expectedArtifact)) {
      if (evidence.run[field] !== expected) {
        blockers.push(`${label}.run.${field} must be ${expected}.`);
      }
    }
  }
  if (evidence.run.launcherChannel !== 'alpha') {
    blockers.push(`${label}.run.launcherChannel must be alpha.`);
  }
  if (!isIsoTimestamp(evidence.run.startedAt)) {
    blockers.push(`${label}.run.startedAt must be an ISO timestamp.`);
  }
  if (!requireReal) return;
  for (const field of ['tester', 'worldOrProfile', 'installedFrom']) {
    if (isPlaceholderText(evidence.run[field])) {
      blockers.push(`${label}.run.${field} must be filled with real capture information.`);
    }
  }
  if (isTemplateTimestamp(evidence.run.startedAt)) {
    blockers.push(`${label}.run.startedAt must not use the template timestamp.`);
  }
}

function validateSessionEvidencePath({ root, evidence, label, sessionId, field, rule, relPath, blockers }) {
  const pathLabel = `${label}.sessions.${sessionId}.evidence.${field}`;
  const resolved = resolveInside(root, relPath);
  if (resolved.error === 'relative-path-required') {
    blockers.push(`${pathLabel} must be a relative file path.`);
    return;
  }
  if (resolved.error === 'outside-root') {
    blockers.push(`${pathLabel} points outside the repo: ${relPath}`);
    return;
  }
  if (!rule.pattern.test(normalizeRel(relPath))) {
    blockers.push(`${pathLabel} must match ${rule.pattern}.`);
  }
  if (!hasPath(evidence[rule.list], relPath)) {
    blockers.push(`${pathLabel} must also be listed in ${label}.${rule.list}.`);
  }
}

function validateSessionChronology({ evidence, label, blockers, requireReal }) {
  if (!requireReal || !Array.isArray(evidence.sessions)) return;

  const sessions = new Map(evidence.sessions.map((session) => [session?.id, session]));
  const runStartedAt = timestampMs(evidence.run?.startedAt);
  const hasRealRunStart = runStartedAt !== null && !isTemplateTimestamp(evidence.run?.startedAt);
  const generatedAt = timestampMs(evidence.generatedAt);
  const hasRealGeneratedAt = generatedAt !== null && !isTemplateTimestamp(evidence.generatedAt);

  if (generatedAt !== null && isTemplateTimestamp(evidence.generatedAt)) {
    blockers.push(`${label}.generatedAt must not use the template timestamp.`);
  }

  if (hasRealRunStart) {
    for (const sessionId of REQUIRED_SESSION_ORDER) {
      const session = sessions.get(sessionId);
      const startedAt = timestampMs(session?.startedAt);
      if (startedAt !== null && startedAt < runStartedAt) {
        blockers.push(`${label}.sessions.${sessionId}.startedAt must be at or after ${label}.run.startedAt.`);
      }
    }
  }

  for (const rule of SESSION_CHRONOLOGY_RULES) {
    const earlier = sessions.get(rule.earlierId);
    const later = sessions.get(rule.laterId);
    const earlierTimestamp = timestampMs(earlier?.[rule.earlierField]);
    const laterTimestamp = timestampMs(later?.[rule.laterField]);
    if (earlierTimestamp !== null && laterTimestamp !== null && laterTimestamp < earlierTimestamp) {
      blockers.push(
        `${label}.sessions.${rule.laterId}.${rule.laterField} must be at or after ${rule.earlierId}.${rule.earlierField}.`
      );
    }
  }

  if (hasRealGeneratedAt) {
    for (const sessionId of REQUIRED_SESSION_ORDER) {
      const session = sessions.get(sessionId);
      const endedAt = timestampMs(session?.endedAt);
      if (endedAt !== null && endedAt > generatedAt) {
        blockers.push(`${label}.generatedAt must be at or after ${label}.sessions.${sessionId}.endedAt.`);
      }
    }
  }
}

function validateSessions({ root, evidence, label, blockers, requireReal }) {
  if (!Array.isArray(evidence.sessions)) {
    blockers.push(`${label}.sessions must be an array.`);
    return;
  }
  const ids = evidence.sessions.map((session) => session?.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) blockers.push(`${label}.sessions must not contain duplicate ids.`);

  for (const requirement of REQUIRED_SESSIONS) {
    const session = evidence.sessions.find((entry) => entry?.id === requirement.id);
    if (!session) {
      blockers.push(`${label}.sessions must include ${requirement.id}.`);
      continue;
    }
    if (session.claim !== requirement.claim) {
      blockers.push(`${label}.sessions.${requirement.id}.claim must be ${requirement.claim}.`);
    }
    if (!isIsoTimestamp(session.startedAt)) {
      blockers.push(`${label}.sessions.${requirement.id}.startedAt must be an ISO timestamp.`);
    }
    if (!isIsoTimestamp(session.endedAt)) {
      blockers.push(`${label}.sessions.${requirement.id}.endedAt must be an ISO timestamp.`);
    }
    const start = Date.parse(session.startedAt);
    const end = Date.parse(session.endedAt);
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      if (end <= start) blockers.push(`${label}.sessions.${requirement.id}.endedAt must be after startedAt.`);
      const elapsedMinutes = (end - start) / 60000;
      if (requireReal && elapsedMinutes < requirement.minDurationMinutes) {
        blockers.push(`${label}.sessions.${requirement.id} elapsed minutes must be at least ${requirement.minDurationMinutes}.`);
      }
    }
    if (typeof session.durationMinutes !== 'number' || !Number.isFinite(session.durationMinutes)) {
      blockers.push(`${label}.sessions.${requirement.id}.durationMinutes must be a number.`);
    } else if (requireReal && session.durationMinutes < requirement.minDurationMinutes) {
      blockers.push(`${label}.sessions.${requirement.id}.durationMinutes must be at least ${requirement.minDurationMinutes}.`);
    } else if (requireReal) {
      const elapsedMinutes = elapsedMinutesBetween(session.startedAt, session.endedAt);
      if (elapsedMinutes !== null && Math.abs(session.durationMinutes - elapsedMinutes) > 1) {
        blockers.push(`${label}.sessions.${requirement.id}.durationMinutes must match startedAt/endedAt elapsed minutes within 1 minute.`);
      }
    }
    if (requireReal && (isTemplateTimestamp(session.startedAt) || isTemplateTimestamp(session.endedAt))) {
      blockers.push(`${label}.sessions.${requirement.id} must not use template timestamps.`);
    }
    if (!session.evidence || typeof session.evidence !== 'object' || Array.isArray(session.evidence)) {
      blockers.push(`${label}.sessions.${requirement.id}.evidence must be an object.`);
      continue;
    }
    for (const [field, rule] of Object.entries(requirement.evidence)) {
      const relPath = session.evidence[field];
      if (typeof relPath !== 'string' || relPath.trim() === '') {
        blockers.push(`${label}.sessions.${requirement.id}.evidence.${field} must be a relative file path.`);
        continue;
      }
      validateSessionEvidencePath({ root, evidence, label, sessionId: requirement.id, field, rule, relPath, blockers });
    }
  }

  validateSessionChronology({ evidence, label, blockers, requireReal });
}

async function validateFileList({ root, label, values, minItems, requiredPatterns, blockers, fileValidator }) {
  validatePathListShape({ root, label, values, minItems, requiredPatterns, blockers });
  if (!Array.isArray(values)) return [];

  const checked = [];
  for (const [index, relPath] of values.entries()) {
    const resolved = resolveInside(root, relPath);
    if (resolved.error) continue;
    if (!(await fileExists(resolved.target))) {
      blockers.push(`${label}[${index}] target does not exist: ${relPath}`);
      continue;
    }
    const size = await fileSize(resolved.target);
    if (size < 1) {
      blockers.push(`${label}[${index}] target must be at least 1 byte: ${relPath}`);
      continue;
    }
    const record = {
      path: normalizeRel(relPath),
      size,
      sha256: await sha256File(resolved.target)
    };
    if (fileValidator) {
      const metadata = await fileValidator({ filePath: resolved.target, relPath, blockers, label, index });
      if (metadata) Object.assign(record, metadata);
    }
    checked.push(record);
  }
  return checked;
}

function validateUniqueCheckedHashes({ label, records, blockers }) {
  const seen = new Map();
  for (const record of records) {
    const existingPath = seen.get(record.sha256);
    if (existingPath) {
      blockers.push(`${label} must contain unique file content; ${record.path} matches ${existingPath}.`);
    } else {
      seen.set(record.sha256, record.path);
    }
  }
}

function validateCommonEvidenceShape({ root, manifest, evidence, label, blockers }) {
  if (evidence.schemaVersion !== 'echo.skyrelay.gameplay-qa.manual.v1') {
    blockers.push(`${label} schemaVersion must be echo.skyrelay.gameplay-qa.manual.v1.`);
  }
  if (evidence.packId !== manifest.packId) {
    blockers.push(`${label} packId must match manifest packId ${manifest.packId}.`);
  }
  validatePathListShape({ root, label: `${label}.supportingFiles`, values: evidence.supportingFiles, minItems: 5, requiredPatterns: REQUIRED_SUPPORTING_PATTERNS, blockers });
  validatePathListShape({ root, label: `${label}.screenshots`, values: evidence.screenshots, minItems: 4, requiredPatterns: REQUIRED_SCREENSHOT_PATTERNS, blockers });
  validatePathListShape({ root, label: `${label}.logs`, values: evidence.logs, minItems: 2, requiredPatterns: REQUIRED_LOG_PATTERNS, blockers });
  validatePathListShape({ root, label: `${label}.saveSnapshots`, values: evidence.saveSnapshots, minItems: 3, requiredPatterns: REQUIRED_SAVE_PATTERNS, blockers });
  validateRunIdentity({ manifest, evidence, label, blockers, requireReal: false });
  validateSessions({ root, evidence, label, blockers, requireReal: false });
}

function validateTemplate({ root, manifest, template, blockers }) {
  validateCommonEvidenceShape({ root, manifest, evidence: template, label: 'template', blockers });
  for (const claim of REQUIRED_CLAIMS) {
    if (template.claims?.[claim] !== false) {
      blockers.push(`template claim ${claim} must remain false until real manual evidence is captured.`);
    }
  }
}

async function validateManualEvidence({ root, manifest, evidencePath, blockers }) {
  const resolved = resolveInside(root, evidencePath);
  const result = {
    found: false,
    claims: {},
    run: null,
    sessions: [],
    checked: {
      supportingFiles: [],
      screenshots: [],
      logs: [],
      saveSnapshots: []
    }
  };

  if (resolved.error) {
    blockers.push(`manual evidence path must stay inside the repo: ${evidencePath}`);
    return result;
  }
  if (!(await fileExists(resolved.target))) {
    blockers.push(`manual evidence is missing: ${evidencePath}`);
    return result;
  }

  let evidence;
  try {
    evidence = await readJson(resolved.target);
  } catch (error) {
    blockers.push(`manual evidence is not valid JSON: ${error.message}`);
    return result;
  }

  result.found = true;
  validateCommonEvidenceShape({ root, manifest, evidence, label: 'manualEvidence', blockers });
  validateRunIdentity({ manifest, evidence, label: 'manualEvidence', blockers, requireReal: true });
  validateSessions({ root, evidence, label: 'manualEvidence', blockers, requireReal: true });
  result.run = evidence.run ?? null;
  result.sessions = Array.isArray(evidence.sessions) ? evidence.sessions : [];
  if (typeof evidence.generatedAt !== 'string' || Number.isNaN(Date.parse(evidence.generatedAt))) {
    blockers.push('manualEvidence generatedAt must be an ISO timestamp.');
  }

  const claims = evidence.claims ?? {};
  result.claims = Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [claim, claims[claim] === true]));
  for (const claim of REQUIRED_CLAIMS) {
    if (claims[claim] !== true) blockers.push(`manualEvidence claim ${claim} must be true.`);
  }

  result.checked.supportingFiles = await validateFileList({
    root,
    label: 'manualEvidence.supportingFiles',
    values: evidence.supportingFiles,
    minItems: 5,
    requiredPatterns: REQUIRED_SUPPORTING_PATTERNS,
    blockers,
    fileValidator: async ({ filePath, relPath, blockers: fileBlockers, label, index }) => {
      const text = await fs.readFile(filePath, 'utf8');
      validateMarkdownNote({ text, relPath, label, index, blockers: fileBlockers });
    }
  });
  validateUniqueCheckedHashes({ label: 'manualEvidence.supportingFiles', records: result.checked.supportingFiles, blockers });
  result.checked.screenshots = await validateFileList({
    root,
    label: 'manualEvidence.screenshots',
    values: evidence.screenshots,
    minItems: 4,
    requiredPatterns: REQUIRED_SCREENSHOT_PATTERNS,
    blockers,
    fileValidator: async ({ filePath, relPath, blockers: fileBlockers, label, index }) => {
      const pngInfo = await pngImageInfo(filePath);
      if (!pngInfo) {
        fileBlockers.push(`${label}[${index}] target is not a complete PNG image with valid chunks: ${relPath}`);
        return null;
      }
      if (pngInfo.dimensions.width < 640 || pngInfo.dimensions.height < 360) {
        fileBlockers.push(`${label}[${index}] PNG dimensions must be at least 640x360: ${relPath}`);
        return null;
      }
      return pngInfo;
    }
  });
  validateUniqueCheckedHashes({ label: 'manualEvidence.screenshots', records: result.checked.screenshots, blockers });
  result.checked.logs = await validateFileList({
    root,
    label: 'manualEvidence.logs',
    values: evidence.logs,
    minItems: 2,
    requiredPatterns: REQUIRED_LOG_PATTERNS,
    blockers,
    fileValidator: async ({ filePath, relPath, blockers: fileBlockers, label, index }) => {
      const text = await fs.readFile(filePath, 'utf8');
      return validateGameplayLog({
        text,
        relPath,
        label,
        index,
        blockers: fileBlockers,
        provenance: {
          packId: evidence.packId,
          releaseTag: evidence.run?.releaseTag,
          artifactAsset: evidence.run?.artifactAsset,
          artifactSha256: evidence.run?.artifactSha256,
          artifactSize: evidence.run?.artifactSize
        }
      });
    }
  });
  validateUniqueCheckedHashes({ label: 'manualEvidence.logs', records: result.checked.logs, blockers });
  result.checked.saveSnapshots = await validateFileList({
    root,
    label: 'manualEvidence.saveSnapshots',
    values: evidence.saveSnapshots,
    minItems: 3,
    requiredPatterns: REQUIRED_SAVE_PATTERNS,
    blockers,
    fileValidator: async ({ filePath, relPath, blockers: fileBlockers, label, index }) => {
      const zipInfo = await zipArchiveInfo(filePath);
      if (!zipInfo) {
        fileBlockers.push(`${label}[${index}] target is not a ZIP archive with entries: ${relPath}`);
        return null;
      }
      return zipInfo;
    }
  });
  validateUniqueCheckedHashes({ label: 'manualEvidence.saveSnapshots', records: result.checked.saveSnapshots, blockers });

  return result;
}

async function buildReport(args) {
  const root = path.resolve(args.root);
  const blockers = [];
  const manifest = await readJson(path.join(root, 'release-manifest.template.json'));
  const template = await readJson(path.join(root, args.template));

  validateTemplate({ root, manifest, template, blockers });
  const manualEvidence = args.templateOnly
    ? null
    : await validateManualEvidence({ root, manifest, evidencePath: args.evidence, blockers });

  return {
    schemaVersion: 'echo.skyrelay.edition-gameplay-evidence.v1',
    status: blockers.length ? 'BLOCKED' : 'PASS',
    mode: args.templateOnly ? 'template-only' : 'manual-evidence',
    generatedAt: new Date().toISOString(),
    packId: manifest.packId,
    runtimeTarget: manifest.runtimeTarget,
    evidencePath: args.evidence,
    templatePath: args.template,
    requiredClaims: REQUIRED_CLAIMS,
    manualEvidence,
    blockers
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const report = await buildReport(args);
  console.log(JSON.stringify(report, null, 2));
  if ((args.requireReleaseReady || args.templateOnly) && report.status !== 'PASS') {
    process.exitCode = 1;
  }
}

await main();

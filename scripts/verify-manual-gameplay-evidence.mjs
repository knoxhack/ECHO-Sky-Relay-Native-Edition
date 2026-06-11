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

const REQUIRED_SUPPORTING_PATTERNS = [
  /(^|\/)first[-_]?30[-_]?minutes[^/]*\.md$/iu,
  /(^|\/)first[-_]?2[-_]?hours[^/]*\.md$/iu,
  /(^|\/)signal[-_]?crown[^/]*\.md$/iu,
  /(^|\/)no[-_]?crash[^/]*\.md$/iu
];

const REQUIRED_SCREENSHOT_PATTERNS = [
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

const NOTE_SECTION_REQUIREMENTS = [
  {
    pattern: /(^|\/)first[-_]?30[-_]?minutes[^/]*\.md$/iu,
    sections: ['## Run Identity', '## Required Route Checks', '## Evidence Links', '## Notes']
  },
  {
    pattern: /(^|\/)first[-_]?2[-_]?hours[^/]*\.md$/iu,
    sections: ['## Run Identity', '## Required Route Checks', '## Evidence Links', '## Notes']
  },
  {
    pattern: /(^|\/)signal[-_]?crown[^/]*\.md$/iu,
    sections: ['## Run Identity', '## Required Completion Checks', '## Evidence Links', '## Notes']
  },
  {
    pattern: /(^|\/)no[-_]?crash[^/]*\.md$/iu,
    sections: ['## Reviewed Files', '## Required Checks', '## Reviewer Notes']
  }
];

const BLANK_NOTE_FIELD = /^-\s+[^:\n]+:\s*$/gmu;

const REQUIRED_SESSIONS = [
  {
    id: 'first_30_minutes',
    claim: 'realFirst30Playthrough',
    minDurationMinutes: 30,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[0] },
      screenshot: { list: 'screenshots', pattern: REQUIRED_SCREENSHOT_PATTERNS[0] },
      saveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[0] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] }
    }
  },
  {
    id: 'first_2_hours',
    claim: 'realFirst2HourPlaythrough',
    minDurationMinutes: 120,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[1] },
      screenshot: { list: 'screenshots', pattern: REQUIRED_SCREENSHOT_PATTERNS[1] },
      saveSnapshot: { list: 'saveSnapshots', pattern: REQUIRED_SAVE_PATTERNS[1] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] }
    }
  },
  {
    id: 'signal_crown_completion',
    claim: 'realSignalCrownPlaythrough',
    minDurationMinutes: 1,
    evidence: {
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[2] },
      screenshot: { list: 'screenshots', pattern: REQUIRED_SCREENSHOT_PATTERNS[2] },
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
      notes: { list: 'supportingFiles', pattern: REQUIRED_SUPPORTING_PATTERNS[3] },
      clientLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[0] },
      launcherLog: { list: 'logs', pattern: REQUIRED_LOG_PATTERNS[1] }
    }
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

async function fileStartsWith(filePath, signatures) {
  const longest = Math.max(...signatures.map((signature) => signature.length));
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(longest);
    const result = await handle.read(buffer, 0, longest, 0);
    return signatures.some((signature) => result.bytesRead >= signature.length && buffer.subarray(0, signature.length).equals(signature));
  } finally {
    await handle.close();
  }
}

async function pngDimensions(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(24);
    const result = await handle.read(header, 0, header.length, 0);
    if (result.bytesRead < header.length || !header.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
    if (header.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20)
    };
  } finally {
    await handle.close();
  }
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
  if (BLANK_NOTE_FIELD.test(text)) {
    blockers.push(`${label}[${index}] target still contains blank worksheet fields: ${relPath}`);
  }
  BLANK_NOTE_FIELD.lastIndex = 0;
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

function validateCommonEvidenceShape({ root, manifest, evidence, label, blockers }) {
  if (evidence.schemaVersion !== 'echo.skyrelay.gameplay-qa.manual.v1') {
    blockers.push(`${label} schemaVersion must be echo.skyrelay.gameplay-qa.manual.v1.`);
  }
  if (evidence.packId !== manifest.packId) {
    blockers.push(`${label} packId must match manifest packId ${manifest.packId}.`);
  }
  validatePathListShape({ root, label: `${label}.supportingFiles`, values: evidence.supportingFiles, minItems: 4, requiredPatterns: REQUIRED_SUPPORTING_PATTERNS, blockers });
  validatePathListShape({ root, label: `${label}.screenshots`, values: evidence.screenshots, minItems: 3, requiredPatterns: REQUIRED_SCREENSHOT_PATTERNS, blockers });
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
    minItems: 4,
    requiredPatterns: REQUIRED_SUPPORTING_PATTERNS,
    blockers,
    fileValidator: async ({ filePath, relPath, blockers: fileBlockers, label, index }) => {
      const text = await fs.readFile(filePath, 'utf8');
      validateMarkdownNote({ text, relPath, label, index, blockers: fileBlockers });
    }
  });
  result.checked.screenshots = await validateFileList({
    root,
    label: 'manualEvidence.screenshots',
    values: evidence.screenshots,
    minItems: 3,
    requiredPatterns: REQUIRED_SCREENSHOT_PATTERNS,
    blockers,
    fileValidator: async ({ filePath, relPath, blockers: fileBlockers, label, index }) => {
      if (!(await fileStartsWith(filePath, [PNG_SIGNATURE]))) {
        fileBlockers.push(`${label}[${index}] target is not a PNG file: ${relPath}`);
        return;
      }
      const dimensions = await pngDimensions(filePath);
      if (!dimensions || dimensions.width < 640 || dimensions.height < 360) {
        fileBlockers.push(`${label}[${index}] PNG dimensions must be at least 640x360: ${relPath}`);
        return null;
      }
      return { dimensions };
    }
  });
  result.checked.logs = await validateFileList({
    root,
    label: 'manualEvidence.logs',
    values: evidence.logs,
    minItems: 2,
    requiredPatterns: REQUIRED_LOG_PATTERNS,
    blockers
  });
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

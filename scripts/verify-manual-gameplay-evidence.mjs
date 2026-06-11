#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_EVIDENCE = 'fixtures/sky-relay/gameplay-qa/manual-evidence.json';
const DEFAULT_TEMPLATE = 'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08])
];

const REQUIRED_CLAIMS = [
  'realFirst30Playthrough',
  'realFirst2HourPlaythrough',
  'realSignalCrownPlaythrough',
  'freshWorldCreated',
  'saveReloadVerified',
  'noCrashEvidence'
];

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

function uniqueStrings(values) {
  return new Set(values.map(normalizeRel)).size === values.length;
}

function matchesAny(values, pattern) {
  return values.some((value) => pattern.test(normalizeRel(value)));
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
    if ((await fileSize(resolved.target)) < 1) {
      blockers.push(`${label}[${index}] target must be at least 1 byte: ${relPath}`);
      continue;
    }
    if (fileValidator) await fileValidator({ filePath: resolved.target, relPath, blockers, label, index });
    checked.push(normalizeRel(relPath));
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
    blockers
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
      }
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
      if (!(await fileStartsWith(filePath, ZIP_SIGNATURES))) {
        fileBlockers.push(`${label}[${index}] target is not a ZIP file: ${relPath}`);
      }
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

#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_TEMPLATE = 'fixtures/sky-relay/gameplay-qa/manual-evidence.template.json';
const DEFAULT_EVIDENCE = 'fixtures/sky-relay/gameplay-qa/manual-evidence.json';
const PATH_GROUPS = ['supportingFiles', 'screenshots', 'logs', 'saveSnapshots'];

function usage() {
  return `Usage: node scripts/init-manual-gameplay-evidence.mjs [options]

Initializes the manual evidence JSON and evidence directories for a real Sky
Relay playthrough. This does not create fake screenshots, logs, saves, or notes.
All claims stay false until the captured evidence is real.

Options:
  --root <dir>       Edition repository root. Default: current directory.
  --template <path>  Evidence template. Default: ${DEFAULT_TEMPLATE}
  --evidence <path>  Manual evidence JSON to create. Default: ${DEFAULT_EVIDENCE}
  --dry-run          Print planned directories/files without writing.
  --force            Replace an existing manual evidence JSON.
  --help             Print this help text.
`;
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    template: DEFAULT_TEMPLATE,
    evidence: DEFAULT_EVIDENCE,
    dryRun: false,
    force: false,
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
    else if (arg === '--template') args.template = next();
    else if (arg === '--evidence') args.evidence = next();
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function resolveInside(root, relPath) {
  if (typeof relPath !== 'string' || relPath.trim() === '' || path.isAbsolute(relPath)) {
    return { error: 'relative-path-required' };
  }
  const base = path.resolve(root);
  const target = path.resolve(base, relPath);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { error: 'outside-root' };
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

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function evidenceFromTemplate(template) {
  const claims = {};
  for (const [claim] of Object.entries(template.claims ?? {})) claims[claim] = false;
  return {
    ...template,
    generatedAt: new Date().toISOString(),
    claims,
    notes: [
      ...(Array.isArray(template.notes) ? template.notes : []),
      'Initialized from template. Keep claims false until the referenced files are real playthrough evidence.'
    ]
  };
}

async function buildPlan(args) {
  const root = path.resolve(args.root);
  const blockers = [];
  const manifest = await readJson(path.join(root, 'release-manifest.template.json'));
  const template = await readJson(path.join(root, args.template));

  if (template.packId !== manifest.packId) {
    blockers.push(`Template packId ${template.packId} does not match manifest ${manifest.packId}.`);
  }

  const directories = [];
  for (const group of PATH_GROUPS) {
    if (!Array.isArray(template[group])) {
      blockers.push(`Template ${group} must be an array.`);
      continue;
    }
    for (const relPath of template[group]) {
      const resolved = resolveInside(root, relPath);
      if (resolved.error) {
        blockers.push(`${group} path must stay inside the repo: ${relPath}`);
        continue;
      }
      directories.push(path.relative(root, path.dirname(resolved.target)).replace(/\\/g, '/'));
    }
  }

  const evidencePath = resolveInside(root, args.evidence);
  if (evidencePath.error) blockers.push(`Evidence path must stay inside the repo: ${args.evidence}`);
  const evidenceExists = evidencePath.error ? false : await fileExists(evidencePath.target);
  const willWriteEvidence = !evidencePath.error && (!evidenceExists || args.force);

  return {
    root,
    manifest,
    template,
    blockers,
    directories: uniqueSorted(directories),
    evidenceTarget: evidencePath.target,
    evidenceExists,
    willWriteEvidence
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const plan = await buildPlan(args);
  const report = {
    schemaVersion: 'echo.skyrelay.manual-evidence-init.v1',
    status: plan.blockers.length ? 'BLOCKED' : 'PASS',
    mode: args.dryRun ? 'dry-run' : 'write',
    packId: plan.manifest.packId,
    evidencePath: args.evidence,
    evidenceExists: plan.evidenceExists,
    willWriteEvidence: plan.willWriteEvidence,
    directories: plan.directories,
    blockers: plan.blockers
  };

  if (!args.dryRun && report.status === 'PASS') {
    for (const directory of plan.directories) {
      await fs.mkdir(path.join(plan.root, directory), { recursive: true });
    }
    if (plan.willWriteEvidence) {
      await fs.mkdir(path.dirname(plan.evidenceTarget), { recursive: true });
      await fs.writeFile(plan.evidenceTarget, `${JSON.stringify(evidenceFromTemplate(plan.template), null, 2)}\n`, 'utf8');
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'PASS') process.exitCode = 1;
}

await main();

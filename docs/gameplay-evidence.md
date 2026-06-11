# Gameplay Evidence

Sky Relay Native Edition cannot be promoted from warning metadata until real
manual gameplay evidence exists for the public `0.1.0` alpha package.

## Required Claims

Fill `fixtures/sky-relay/gameplay-qa/manual-evidence.json` from the template in
this repo only after a real playthrough has produced the files it references.
Every claim must be true:

- `realFirst30Playthrough`: fresh install reaches the 30-minute route gate.
- `realFirst2HourPlaythrough`: the same route reaches the 2-hour systems gate.
- `realSignalCrownPlaythrough`: Signal Crown completion is reached and recorded.
- `freshWorldCreated`: the run starts from a fresh Sky Relay world/profile.
- `saveReloadVerified`: the world/profile is saved, closed, reopened, and still valid.
- `noCrashEvidence`: logs and support review show no blocking crash.

## Required Run Ledger

Fill the `run` object in `manual-evidence.json` with the real tester,
release tag, public ZIP artifact name, artifact SHA-256, artifact byte size,
launcher channel, world or profile name, install path, and run start time. The
release tag and artifact identity must match this edition's public alpha
release.

Fill the `sessions` array with these required records:

- `fresh_world_creation`: linked to fresh-world notes, screenshot, client log,
  and launcher install log.
- `first_30_minutes`: at least 30 elapsed minutes, linked to first-30 notes,
  screenshot, save snapshot, and client log.
- `first_2_hours`: at least 120 elapsed minutes, linked to first-2-hours notes,
  screenshot, save snapshot, and client log.
- `signal_crown_completion`: linked to Signal Crown notes, screenshot, save
  snapshot, and client log.
- `save_reload_verification`: linked to the first-30, first-2-hour, and Signal
  Crown save snapshots plus the client log.
- `no_crash_review`: linked to the no-crash review, client log, and launcher
  install log.

Release-ready sessions must be chronological: every session starts at or after
`run.startedAt`; Signal Crown starts after the two-hour route window; save/reload
starts after Signal Crown; no-crash review starts after save/reload.
Each session's `durationMinutes` must match its start/end timestamps within one
minute, and `generatedAt` must be after the recorded sessions have ended.
Notes, screenshots, logs, and save snapshots must not be copied placeholder
content reused under different filenames; each accepted evidence file must have
unique content within its group.
Each note must include this run's pack ID, release tag, artifact asset, artifact
SHA-256, artifact size, session ID, session start/end timestamps, and the exact
session evidence paths it is documenting.

Do not leave `TBD` values or `1970-01-01T...` template timestamps in release-ready
evidence.

## Required Files

The Release Index verifier requires these relative paths or equivalent names
that match the same patterns:

- `fixtures/sky-relay/gameplay-qa/evidence/fresh-world-notes.md`
- `fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md`
- `fixtures/sky-relay/gameplay-qa/evidence/first-2-hours-notes.md`
- `fixtures/sky-relay/gameplay-qa/evidence/signal-crown-verification.md`
- `fixtures/sky-relay/gameplay-qa/evidence/no-crash-review.md`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/fresh-world-created.png`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-2-hours.png`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/signal-crown-complete.png`
- `fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log`
- `fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log`
- `fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip`
- `fixtures/sky-relay/gameplay-qa/evidence/saves/first-2-hours-save.zip`
- `fixtures/sky-relay/gameplay-qa/evidence/saves/signal-crown-save.zip`

Screenshots must be complete PNG images with valid chunks, an `IEND` chunk,
dimensions at least 640x360, and visible pixel variation rather than blank
placeholder frames. Save snapshots must be ZIP archives with at least one entry,
a `level.dat` world save entry, and no absolute or parent-directory entry paths.
Text and log files must be non-empty. Logs must not contain blocking
crash or corruption signatures such as `crash report`, `fatal`,
`uncaught exception`, `unhandled exception`, `exception in thread`, Java stack
trace lines, `failed to load world`, or world/save corruption markers. Logs must
also include the same pack ID, release tag, artifact asset name, artifact
SHA-256, and artifact byte size recorded in the `run` object.

The local verifier records byte size and SHA-256 for every accepted evidence
file. Screenshot entries also include PNG dimensions, so the Release Index handoff
can identify the exact notes, logs, screenshots, and save snapshots reviewed.

## Verification

Initialize the evidence capture layout before the manual run:

```powershell
node scripts\init-manual-gameplay-evidence.mjs
```

The initializer also creates Markdown worksheets for the required notes. These
files start with `ECHO_SKY_RELAY_TEMPLATE_ONLY`; the verifier rejects that marker
until the worksheet is replaced with real playthrough observations.
Keep the worksheet section headings and fill every `- Field:` line; blank
worksheet fields are blocked. Each worksheet must also mention the gameplay
objects and actions named by its checklist, such as `relay_anchor_key`,
`hydroponics_deck`, `weather_mast`, and `sky_relay_badge` where applicable.

Before sending evidence to the Release Index, run the local edition verifier:

```powershell
node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready
```

CI also runs the same verifier in template mode:

```powershell
node scripts\verify-manual-gameplay-evidence.mjs --template-only
```

After replacing the template with real evidence, run from
`ECHO-Release-Index`:

```powershell
node scripts\verify-sky-relay-gameplay-evidence.mjs --require-release-ready
```

The verifier must pass before Release Index validation can move Sky Relay out of
warning status.

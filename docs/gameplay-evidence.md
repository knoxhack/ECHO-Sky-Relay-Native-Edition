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

## Required Files

The Release Index verifier requires these relative paths or equivalent names
that match the same patterns:

- `fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md`
- `fixtures/sky-relay/gameplay-qa/evidence/first-2-hours-notes.md`
- `fixtures/sky-relay/gameplay-qa/evidence/signal-crown-verification.md`
- `fixtures/sky-relay/gameplay-qa/evidence/no-crash-review.md`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-2-hours.png`
- `fixtures/sky-relay/gameplay-qa/evidence/screenshots/signal-crown-complete.png`
- `fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log`
- `fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log`
- `fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip`
- `fixtures/sky-relay/gameplay-qa/evidence/saves/first-2-hours-save.zip`
- `fixtures/sky-relay/gameplay-qa/evidence/saves/signal-crown-save.zip`

Screenshots must be PNG files at least 640x360. Save snapshots must be ZIP
files. Text and log files must be non-empty.

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
worksheet fields are blocked.

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

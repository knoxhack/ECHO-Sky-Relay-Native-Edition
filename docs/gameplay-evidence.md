# Gameplay Evidence

Sky Relay Native Edition cannot be promoted as gameplay-ready from Launcher install evidence, content graph evidence, or runtime load evidence alone.

The public-alpha gameplay gate is owned by `ECHO-Release-Index/release-readiness/gameplay-acceptance-matrix.json` with schema `echo.gameplay.acceptance.v1`. This lane must remain blocked until real Sky Relay Native gameplay evidence is captured and reflected through the Release Index Sky Relay gameplay reports.

Required evidence:

- Fresh install and fresh world/profile creation.
- Real first 30-minute playthrough route.
- Real first 2-hour playthrough route.
- Signal Crown completion evidence.
- Save, close, reload, and continue verification.
- No blocking crash or world/save corruption in logs.
- Notes, screenshots, client logs, launcher/install logs, and save snapshots from the real run.

Capture support:

- `node scripts/init-manual-gameplay-evidence.mjs` creates a fail-closed manual evidence skeleton and note templates.
- `node scripts/verify-manual-gameplay-evidence.mjs --require-release-ready` blocks until the real notes, screenshots, logs, save snapshots, claims, sessions, and optional Computer Use provenance validate.
- Optional `fixtures/sky-relay/gameplay-qa/computer-use-session.json` can record visible UI actions such as opening inventory to verify Index, HUD, Terminal, HoloMap, and Lens surfaces. It is provenance only and cannot replace required proof files.

Do not mark template evidence, generated fixtures, Launcher handoff, content graph load, or Hytale export-planning statuses as gameplay proof.

# Sky Relay Manual Evidence Capture Checklist

This file is a checklist, not release evidence. Do not list it in
`manual-evidence.json`.

## Before The Run

- Start from a fresh Sky Relay profile or world.
- Install the public `0.1.0` alpha package through the intended launcher path.
- Run `node scripts\init-manual-gameplay-evidence.mjs` to create local evidence
  directories and `manual-evidence.json` with every claim still false.
- Fill `manual-evidence.json` `run` fields with the tester, release tag, world
  or profile, install path, and real start timestamp.
- Record the launcher install log at
  `fixtures/sky-relay/gameplay-qa/evidence/logs/launcher-install.log`.

## First 30 Minutes

- Reach the Damaged Relay Core.
- Open Terminal relay status.
- Scan the relay core with Lens.
- Restore hand crank and small battery power.
- Claim `relay_anchor_key`.
- Reveal and attach `hydroponics_deck`.
- Capture notes at
  `fixtures/sky-relay/gameplay-qa/evidence/first-30-minutes-notes.md`.
- Capture a PNG screenshot at least 640x360 at
  `fixtures/sky-relay/gameplay-qa/evidence/screenshots/first-30-minutes.png`.
- Save a ZIP snapshot at
  `fixtures/sky-relay/gameplay-qa/evidence/saves/first-30-minutes-save.zip`.
- Update the `first_30_minutes` session with real start/end timestamps, duration,
  and matching evidence paths.

## First 2 Hours

- Stabilize food and water.
- Build `atmospheric_condenser`.
- Attach `aero_salvage_yard`.
- Process `relay_alloy_plate`.
- Build `storm_shield_pylon`.
- Attach `solar_wing`.
- Start the first logistics route.
- Unlock `weather_mast`.
- Survive a severe storm.
- Craft `stabilized_platform_core`.
- Capture notes, screenshot, and save ZIP at the matching first-2-hours paths.
- Update the `first_2_hours` session with real start/end timestamps, duration,
  and matching evidence paths.

## Signal Crown

- Restore the required stabilized platform cores.
- Bring `relay_signal_array` online.
- Confirm storm shield network and automated logistics route.
- Collect orbital alloy components.
- Complete the Terminal restoration sequence.
- Record Signal Crown completion notes, screenshot, and save ZIP at the matching
  Signal Crown paths.
- Update the `signal_crown_completion` session with real start/end timestamps,
  duration, and matching evidence paths.

## Save Reload Verification

- Close and reopen the world/profile after the first-30, first-2-hours, and
  Signal Crown save snapshots have been created.
- Confirm each save snapshot opens or imports successfully.
- Update the `save_reload_verification` session with real review timestamps and
  links to all three save snapshots plus the client log.

## Final Review

- Record the client playthrough log at
  `fixtures/sky-relay/gameplay-qa/evidence/logs/client-playthrough.log`.
- Record no-crash/support review at
  `fixtures/sky-relay/gameplay-qa/evidence/no-crash-review.md`.
- Update the `no_crash_review` session with real review timestamps and log links.
- Set each claim in `manual-evidence.json` to true only after the referenced
  evidence exists.
- Run `node scripts\verify-manual-gameplay-evidence.mjs --require-release-ready`.

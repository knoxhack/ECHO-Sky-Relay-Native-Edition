# Sky Relay Gameplay Capture Checklist

This checklist is fail-closed. Do not mark `manual-evidence.json` claims true until each referenced notes file, screenshot, log, and save ZIP exists from a real run.

Required run:

- Fresh install from ECHO Launcher.
- Fresh world or profile; no copied save.
- First 30 minutes: damaged relay core, Terminal, Lens, hand crank, small battery, relay anchor key, and hydroponics deck.
- First 2 hours: food, water, atmospheric condenser, salvage yard, relay alloy plate, storm shield pylon, solar wing, logistics, weather mast, severe storm, and stabilized platform core.
- Signal Crown completion: relay signal array, storm shield network, logistics route, orbital alloy, terminal restoration sequence, and sky relay badge.
- Save, close, reload, and continue from captured saves.
- No blocking crash or world/save corruption in client and launcher logs.

Optional Computer Use metadata:

- If the lane is driven through visible UI automation, write `fixtures/sky-relay/gameplay-qa/computer-use-session.json` and set `capture.computerUseSession` in `manual-evidence.json`.
- Computer Use metadata is provenance only. It cannot replace required notes, screenshots, logs, or save snapshots.
- Captured checks such as `hudVisible`, `inventoryIndexVisible`, `terminalVisible`, `holomapVisible`, and `lensVisible` must cite a required claim or one of the local proof files.

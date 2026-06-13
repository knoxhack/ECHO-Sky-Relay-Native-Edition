# ECHO Sky Relay Native Edition

Sky Relay Native Edition is the ECHO Native Platform packaging lane for
`ECHO: Sky Relay`, Official ECHO Pack #3.

## Role

- Consumes `.echo-addon` artifacts from `ECHO-Modules`.
- Uses `echoskyrelayprotocol` as the canonical Sky Relay content source.
- Publishes Native install, update, repair, and rollback manifests for the ECHO Launcher.
- Does not own gameplay registries, balancing, names, textures, sounds, recipes, or progression data.

## Source Repos

- Protocol module: `knoxhack/ECHO-Modules/addons/echoskyrelayprotocol`
- Runtime: `knoxhack/ECHO-Native-Platform`
- SDK templates: `knoxhack/ECHO-SDK`
- Release index: `knoxhack/ECHO-Release-Index`
- Planned repo: `knoxhack/ECHO-Sky-Relay-Native-Edition`

## Status

Implementation foundation only. Keep this edition preview-only until the Native
artifact, launcher install flow, update flow, repair flow, rollback flow, first
30-minute playthrough, first 2-hour playthrough, and Signal Crown completion
evidence all pass.

## Release Assets

- GitHub prerelease tag: sky-relay-native-0.1.0-alpha
- Checked-in payloads: release-assets/sky-relay-native-0.1.0-alpha/
- Uploaded assets: sky-relay-native-edition-0.1.0.zip, sky-relay-native-edition-alpha-0.1.0.pack.json, checksums.txt, echo-release.json, native-harness-driver-manifest.template.json, release-manifest.template.json, sky-relay-pack-build-report.json

These files mirror the live GitHub prerelease assets so the source repository has the same release payload shape as Ashfall.

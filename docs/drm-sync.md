# Widevine and Sync checks

Results of the checks the spec asks for early: Widevine for Netflix, Spotify and a test page in a build made and signed here, and Firefox Sync. Background research with sources: `docs/research/drm-sync-2026-10-12.md`.

## Widevine test page, 2026-10-12

`scripts/perf/drm-check` opens `http://drm.localhost:8765/` (source `scripts/perf/fixtures/synthetic/drm/index.html`) in each browser, from a copy of its warm harness profile that already holds the Widevine CDM 4.10.3050.0. The page asks for the `com.widevine.alpha` key system, then plays Google's "Angel One" Widevine test stream with Shaka Player and Shaka's public no-auth license proxy, and writes the outcome into its title.

| Browser | Signature | Result |
|---|---|---|
| zen-stock-signed: Zen 1.23.2b built here | Apple Development, Team 8Q677AYRU7, hardened runtime with Firefox's production entitlements (`scripts/sign-app`) | plays: 14.9 s, 372 frames, 768x576 |
| zen-official: Zen 1.23.2b DMG | Zen's Developer ID, notarized | plays: 14.8 s, 372 frames, 768x576 |
| firefox: Firefox 157.0.1 DMG | Mozilla's Developer ID, notarized, with Widevine VMP signatures | plays: 14.9 s, 371 frames, 768x576 |

The GMP log (`MOZ_LOG=GMP:5,EME:5`) shows `VerifyCdmHost_0 returned true` in all three. Gecko hands the CDM the same list of host files and signature paths in each: `libwidevinecdm.dylib`, the media plugin helper, the main binary and `XUL`, each with a `.sig` next to it. Only Firefox has those `.sig` files. Zen's official build and ours point at files that do not exist.

What this shows: the CDM downloads, loads and decrypts in a build signed here with an Apple Development certificate; no Developer ID is needed for that. What it does not show: whether a service accepts it. The test proxy grants a licence to any client. Services that check Google's Verified Media Path (VMP) signature, which Netflix does, can refuse a client without valid `.sig` files. Zen's FAQ already says Netflix and Spotify do not play in Zen, and our build has the same gap.

## Still to do

- Netflix and Spotify: they need the user's accounts. Expected result, matching official Zen: Netflix refuses to play (error code to record), Spotify likely the same.
- Firefox Sync: needs a Mozilla account. The research found no code that blocks a fork, so it should work as in Zen.
- If Netflix and Spotify fail, the fix is Google VMP signing. The research found two routes, both needing a business relationship and money: Google's Widevine programme (contact through widevine.com, terms and price unknown) or a castLabs audit and signing service (castLabs EVS is free only for its own Electron builds). Mozilla signs its `.sig` files in its release pipeline with a certificate Google issued to Mozilla, so Firefox's files cannot be reused.

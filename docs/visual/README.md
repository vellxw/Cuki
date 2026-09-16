# Native reference comparisons

The six reference files remain in the owner's private blueprint. This directory
never redistributes inspiration screenshots or system fonts.

`CUKI Visual` is a separate package (`com.cuki.app.visual`) with a separate URI
scheme, private SQLite file and per-scenario actors. Compilation requires both
`EXPO_PUBLIC_TEST_MODE=1` and `EXPO_PUBLIC_VISUAL_FIXTURES=1`, with no API/Auth URL.
No RevenueCat keys, remote API, authenticated identity or redeemable coins exist
in these fixtures. The regular `CUKI Test` APK never loads them.

The real `ScreenRouter`/Home/Recipes/ScanReview/ActiveWorkout/Garden components
render these fixture values through the same native materials and procedural
plant. Only the input data and application clock are controlled; no screenshot
is used as the screen, no fonts or buttons are baked into an image.

Inputs follow the corrected synthetic v2 arithmetic: Home 1620 kcal, P108/C189/G48;
recipe 520 kcal, P42/C52/G16; scan617, P48/C68/G17. They DO NOT establish a food's
actual composition, camera accuracy, users, community votes, or real activity.
The Garden fixture has no comparable local strength samples, so it correctly
shows unknown rather than copying an unsupported +14% mockup statistic.

`android-visual.py` captures two unedited native framebuffers per screen at a
specified 390x844 logical viewport (1170x2532 pixels, density480), retaining OS
bars, XML, timing and source provenance. A successful capture is NOT a passing
pixel-fidelity score. Compare against cropped reference content with a declared
uniform transform; preserve raw inputs and explicit residuals. Repeated samples
measure rendering noise before establishing regression thresholds.

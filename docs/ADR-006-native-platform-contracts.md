# ADR-006 — native requirements and accessibility selectors

Status: accepted for implementation, native verification pending.

The Android build for source 2397c7e failed at manifest merge: the app declared API 24 while androidx.health.connect:connect-client:1.1.0 declares API 26. The app now sets minSdkVersion=26 through its existing Expo build-properties plugin. Do not use tools:overrideLibrary. Nutrition and training remain usable without Health Connect; Health Connect is gated by the native availability check and user consent. Android 8 is the app minimum, not a promise of Health Connect availability there.

The iOS app reached Home (SC-07), but its XCTest requested the literal child label “Nutrición de hoy”. That text is inside an accessible Pressable whose native accessibility label is “Abrir diario de nutrición”. VoiceOver exposes the button, not a separate nested text element. The iOS native smoke suite now asserts the real accessible action before exercising navigation and durable logging. No test steps or persistence assertions were removed.

Sources consulted 2026-09-16:
- https://developer.android.com/health-and-fitness/health-connect/architecture
- https://docs.expo.dev/versions/latest/sdk/build-properties/
- https://reactnative.dev/docs/accessibility

Evidence: workflow 35046398102 Android build.log and iOS test-summary.json. No UI redesign and no provider permission bypass.

# Phase 8 Mobile and Desktop Execution

## Scope Completed

Phase 8 now includes executable mobile and desktop adapters while preserving the Phase 1 orchestration boundary. The workflow engine still dispatches through the plugin abstraction; Appium and WinAppDriver details remain isolated inside execution plugins.

## Implemented Components

- Added adapter runtime discovery in `nexus-api/app/platform_adapters/runtime.py`.
- Added backend adapter API routes:
  - `GET /api/adapters/runtimes`
  - `POST /api/adapters/validate`
- Added runtime contracts for:
  - Android via Appium UiAutomator2
  - iOS via Appium XCUITest
  - Desktop via WinAppDriver
- Added Appium-backed mobile execution plugin:
  - `mobile.launch`
  - `mobile.tap`
  - `mobile.type_text`
  - `mobile.assert_text`
  - `mobile.extract_text`
  - `mobile.screenshot`
  - `mobile.deep_link`
- Added WinAppDriver-backed desktop execution plugin:
  - `desktop.launch`
  - `desktop.click`
  - `desktop.type_text`
  - `desktop.assert_text`
  - `desktop.extract_text`
  - `desktop.screenshot`
- Added shared W3C WebDriver HTTP client for Appium and WinAppDriver.
- Added realtime action events:
  - `MobileAction`
  - `DesktopAction`
- Added startup registration flags:
  - `enable_mobile_plugin`
  - `enable_desktop_plugin`
- Added environment isolation requirements per adapter:
  - Android: device/emulator identity, app package/activity, system port.
  - iOS: simulator UDID, bundle identifier, WDA local port.
  - Desktop: app identity, user data directory, window handle.
- Added frontend Agent Config runtime readiness view in the settings workspace.
- Updated business intent mappings from partial to executable for mobile and desktop:
  - `nav.open`
  - `ui.click`
  - `form.fill`
  - `ui.assert_text`
  - `data.extract`
  - `evidence.screenshot`

## Current Runtime Behavior

The platform can now report whether each mobile or desktop runtime is:

- `available`
- `configured`
- `unavailable`

Runtime discovery marks an adapter available when either the local runtime executable and required local environment are present, or a configured remote endpoint responds to `/status`.

The validator also checks required adapter capabilities before a workflow targets a platform.

When Appium or WinAppDriver is reachable, mobile and desktop workflow nodes execute through W3C WebDriver commands and emit normalized orchestration events, terminal logs, screenshots, source snapshots on failure, and shared-context outputs.

## Runtime Prerequisites

Live execution requires the external automation runtimes to be installed and running:

- Android/iOS: Appium server plus platform drivers and device/emulator access.
- Android: `ANDROID_HOME`, `JAVA_HOME`, device identity, app package/activity or deep link.
- iOS: Xcode tooling on macOS, simulator UDID or real device configuration, bundle identifier or universal link.
- Desktop: WinAppDriver server on Windows plus app id or executable path.

## Guardrail

Phase 8 is complete at the backend architecture and adapter implementation level. Real device parity still depends on installing Appium, WinAppDriver, and target applications in the execution environment.

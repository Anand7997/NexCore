/**
 * Platform runtime contracts for mobile and desktop adapters.
 *
 * These types model the external runtime dependencies (Appium server, ADB,
 * Xcode, WinAppDriver) that must be present before a mobile or desktop
 * workflow can execute. The contracts are intentionally separate from
 * business intent contracts so adapters remain isolated.
 */

// ── Status enums ──────────────────────────────────────────────────────────────

export type RuntimeReadinessLevel =
  | 'ready'        // server reachable, device/simulator available
  | 'configured'   // server reachable, no device currently available
  | 'partial'      // binary found, server not reachable
  | 'unavailable'; // binary not found and server not reachable

// ── Device descriptors ────────────────────────────────────────────────────────

export interface AndroidDevice {
  serial: string;
  state: 'device' | 'emulator' | 'offline' | 'unauthorized';
  model?: string;
  apiLevel?: string;
}

export interface IosSimulator {
  udid: string;
  name: string;
  state: 'Booted' | 'Shutdown' | 'Creating' | string;
  runtime: string;
}

// ── Required capabilities ─────────────────────────────────────────────────────

export interface AppiumCapabilities {
  platformName: 'Android' | 'iOS';
  /** UiAutomator2 for Android; XCUITest for iOS */
  automationName: string;
  deviceName?: string;
  udid?: string;
  app?: string;
  appPackage?: string;
  appActivity?: string;
  bundleId?: string;
  noReset?: boolean;
  fullReset?: boolean;
  /** Additional capabilities passed through verbatim */
  [key: string]: unknown;
}

export interface WinAppDriverCapabilities {
  app: string;
  appArguments?: string;
  appWorkingDir?: string;
  ms_experimental_webdriver?: boolean;
  platformName?: 'Windows';
  [key: string]: unknown;
}

// ── Runtime validation results ────────────────────────────────────────────────

export interface AppiumRuntimeStatus {
  platform: 'android' | 'ios';
  readiness: RuntimeReadinessLevel;
  serverUrl: string;
  serverReachable: boolean;
  /** Appium binary path if found on PATH */
  appiumBinaryPath: string | null;
  /** Required env vars that are missing */
  missingEnv: string[];
  /** Connected/available devices or simulators */
  devices: AndroidDevice[] | IosSimulator[];
  diagnostics: string[];
  /** Recommended Appium capabilities for first available device */
  suggestedCapabilities: AppiumCapabilities | null;
}

export interface WinAppDriverRuntimeStatus {
  platform: 'desktop';
  readiness: RuntimeReadinessLevel;
  serverUrl: string;
  serverReachable: boolean;
  winAppDriverPath: string | null;
  diagnostics: string[];
  /** Recommended capabilities for a common test target (Notepad) */
  suggestedCapabilities: WinAppDriverCapabilities;
}

export type MobileDesktopRuntimeStatus =
  | AppiumRuntimeStatus
  | WinAppDriverRuntimeStatus;

export interface RuntimeValidationSummary {
  android: AppiumRuntimeStatus;
  ios: AppiumRuntimeStatus;
  desktop: WinAppDriverRuntimeStatus;
  /** True only when all three adapters are fully ready */
  allReady: boolean;
  /** ISO timestamp of validation */
  validatedAt: string;
}

// ── Execution readiness request ───────────────────────────────────────────────

export interface PlatformReadinessRequest {
  platform: 'android' | 'ios' | 'desktop';
  /** Required capabilities to check availability for */
  requiredCapabilities?: string[];
}

export interface PlatformReadinessResult {
  platform: string;
  ready: boolean;
  readiness: RuntimeReadinessLevel;
  missingCapabilities: string[];
  diagnostics: string[];
  runtime: MobileDesktopRuntimeStatus;
}

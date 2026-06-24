/**
 * Platform runtime validator service.
 *
 * Detects Appium (Android + iOS) and WinAppDriver availability by:
 *   1. Probing the WebDriver /status endpoint over HTTP
 *   2. Checking PATH/known installation locations for the binary
 *   3. Querying connected devices via `adb devices` (Android)
 *   4. Querying simulators via `xcrun simctl list` (iOS)
 *
 * All exec/HTTP operations are best-effort and never throw – failures produce
 * 'unavailable' status with diagnostic messages.
 */
import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import type {
  AppiumRuntimeStatus,
  WinAppDriverRuntimeStatus,
  RuntimeValidationSummary,
  PlatformReadinessResult,
  AndroidDevice,
  IosSimulator,
  AppiumCapabilities,
  WinAppDriverCapabilities,
  RuntimeReadinessLevel,
} from '../../contracts/platform-runtime-contracts';

const execFileAsync = promisify(execFile);

const WINAPPDRIVER_PATHS = [
  'C:\\Program Files (x86)\\Windows Application Driver\\WinAppDriver.exe',
  'C:\\Program Files\\Windows Application Driver\\WinAppDriver.exe',
];

/** Capabilities supported by each mobile/desktop adapter */
const ADAPTER_CAPABILITIES: Record<string, readonly string[]> = {
  android: ['tap', 'type_text', 'select_option', 'assert_text', 'assert_visible', 'extract_text', 'screenshot', 'deep_link'],
  ios: ['tap', 'type_text', 'select_option', 'assert_text', 'assert_visible', 'extract_text', 'screenshot', 'universal_link', 'deep_link'],
  desktop: ['click', 'type_text', 'assert_text', 'extract_text', 'screenshot', 'file_dialog'],
};

@Injectable()
export class PlatformRuntimeValidatorService {
  private readonly logger: Logger;

  constructor() {
    // Handle case where service is instantiated outside NestJS context (e.g., tests)
    try {
      this.logger = new Logger(PlatformRuntimeValidatorService.name);
    } catch {
      // Fallback to console-based logger for testing environments
      this.logger = {
        log: console.log.bind(console),
        error: console.error.bind(console),
        warn: console.warn.bind(console),
        debug: console.debug.bind(console),
        verbose: console.log.bind(console),
      } as Logger;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async validateAll(): Promise<RuntimeValidationSummary> {
    const [android, ios, desktop] = await Promise.all([
      this.validateAndroid(),
      this.validateIos(),
      this.validateDesktop(),
    ]);
    return {
      android,
      ios,
      desktop,
      allReady:
        android.readiness === 'ready' &&
        ios.readiness === 'ready' &&
        desktop.readiness === 'ready',
      validatedAt: new Date().toISOString(),
    };
  }

  async validatePlatformReadiness(
    platform: 'android' | 'ios' | 'desktop',
    requiredCapabilities: string[] = [],
  ): Promise<PlatformReadinessResult> {
    const runtime =
      platform === 'android'
        ? await this.validateAndroid()
        : platform === 'ios'
          ? await this.validateIos()
          : await this.validateDesktop();

    const supported = new Set(ADAPTER_CAPABILITIES[platform] ?? []);
    const missingCapabilities = requiredCapabilities.filter((c) => !supported.has(c));
    const ready = runtime.readiness === 'ready' && missingCapabilities.length === 0;

    return {
      platform,
      ready,
      readiness: runtime.readiness,
      missingCapabilities,
      diagnostics: runtime.diagnostics,
      runtime,
    };
  }

  // ── Android ─────────────────────────────────────────────────────────────────

  async validateAndroid(): Promise<AppiumRuntimeStatus> {
    const serverUrl = process.env['APPIUM_SERVER_URL'] ?? 'http://127.0.0.1:4723';
    const diagnostics: string[] = [];

    const [serverReachable, appiumBinaryPath, devices] = await Promise.all([
      this._probeWebDriverStatus(serverUrl),
      this._findOnPath('appium'),
      this._listAndroidDevices(diagnostics),
    ]);

    const missingEnv: string[] = [];
    for (const name of ['ANDROID_HOME', 'JAVA_HOME']) {
      if (!process.env[name]) missingEnv.push(name);
    }
    if (missingEnv.length > 0) {
      diagnostics.push(`Missing environment variables: ${missingEnv.join(', ')}`);
    }
    if (!appiumBinaryPath) {
      diagnostics.push('Appium binary not found on PATH. Install with: npm i -g appium');
    }
    if (!serverReachable) {
      diagnostics.push(`Appium server not reachable at ${serverUrl}. Start with: appium`);
    }

    const activeDevices = (devices as AndroidDevice[]).filter(
      (d) => d.state === 'device' || d.state === 'emulator',
    );
    if (serverReachable && activeDevices.length === 0) {
      diagnostics.push('No connected Android device or running emulator found. Start an AVD or connect a device.');
    }

    const readiness = this._calcReadiness(serverReachable, appiumBinaryPath, activeDevices.length > 0);
    const suggestedCapabilities: AppiumCapabilities | null =
      activeDevices.length > 0
        ? {
            platformName: 'Android',
            automationName: 'UiAutomator2',
            deviceName: activeDevices[0].model ?? activeDevices[0].serial,
            udid: activeDevices[0].serial,
            noReset: true,
          }
        : null;

    return {
      platform: 'android',
      readiness,
      serverUrl,
      serverReachable,
      appiumBinaryPath,
      missingEnv,
      devices,
      diagnostics,
      suggestedCapabilities,
    };
  }

  // ── iOS ─────────────────────────────────────────────────────────────────────

  async validateIos(): Promise<AppiumRuntimeStatus> {
    const serverUrl = process.env['APPIUM_SERVER_URL'] ?? 'http://127.0.0.1:4723';
    const diagnostics: string[] = [];

    const [serverReachable, appiumBinaryPath, simulators] = await Promise.all([
      this._probeWebDriverStatus(serverUrl),
      this._findOnPath('appium'),
      this._listIosSimulators(diagnostics),
    ]);

    const missingEnv: string[] = [];
    if (!process.env['XCODE_DEVELOPER_DIR'] && process.platform !== 'darwin') {
      missingEnv.push('XCODE_DEVELOPER_DIR');
    }
    if (process.platform !== 'darwin') {
      diagnostics.push('iOS automation requires macOS with Xcode installed.');
    }
    if (!appiumBinaryPath) {
      diagnostics.push('Appium binary not found on PATH. Install with: npm i -g appium');
    }
    if (!serverReachable) {
      diagnostics.push(`Appium server not reachable at ${serverUrl}. Start with: appium`);
    }

    const bootedSimulators = (simulators as IosSimulator[]).filter((s) => s.state === 'Booted');
    if (serverReachable && bootedSimulators.length === 0 && process.platform === 'darwin') {
      diagnostics.push('No booted iOS simulator found. Boot one with: xcrun simctl boot <UDID>');
    }

    const readiness = this._calcReadiness(serverReachable, appiumBinaryPath, bootedSimulators.length > 0);
    const suggestedCapabilities: AppiumCapabilities | null =
      bootedSimulators.length > 0
        ? {
            platformName: 'iOS',
            automationName: 'XCUITest',
            udid: bootedSimulators[0].udid,
            deviceName: bootedSimulators[0].name,
            noReset: true,
          }
        : null;

    return {
      platform: 'ios',
      readiness,
      serverUrl,
      serverReachable,
      appiumBinaryPath,
      missingEnv,
      devices: simulators,
      diagnostics,
      suggestedCapabilities,
    };
  }

  // ── Desktop ─────────────────────────────────────────────────────────────────

  async validateDesktop(): Promise<WinAppDriverRuntimeStatus> {
    const serverUrl = process.env['WINAPPDRIVER_URL'] ?? 'http://127.0.0.1:4723';
    const diagnostics: string[] = [];

    const [serverReachable, winAppDriverPath] = await Promise.all([
      this._probeWebDriverStatus(serverUrl),
      this._findWinAppDriver(),
    ]);

    if (!winAppDriverPath) {
      diagnostics.push(
        'WinAppDriver not found. Install from: https://github.com/microsoft/WinAppDriver/releases',
      );
    }
    if (!serverReachable) {
      diagnostics.push(
        `WinAppDriver server not reachable at ${serverUrl}. Start WinAppDriver.exe as Administrator.`,
      );
    }
    if (process.platform !== 'win32') {
      diagnostics.push('Desktop automation with WinAppDriver requires Windows 10/11.');
    }

    const readiness = this._calcReadiness(serverReachable, winAppDriverPath, true);
    const suggestedCapabilities: WinAppDriverCapabilities = {
      app: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App',
      platformName: 'Windows',
    };

    return {
      platform: 'desktop',
      readiness,
      serverUrl,
      serverReachable,
      winAppDriverPath,
      diagnostics,
      suggestedCapabilities,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _calcReadiness(
    serverReachable: boolean,
    binary: string | null,
    deviceAvailable: boolean,
  ): RuntimeReadinessLevel {
    if (serverReachable && deviceAvailable) return 'ready';
    if (serverReachable) return 'configured';
    if (binary) return 'partial';
    return 'unavailable';
  }

  private _probeWebDriverStatus(serverUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      const url = serverUrl.replace(/\/$/, '') + '/status';
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout: 1200 }, (res) => {
        resolve(res.statusCode !== undefined && res.statusCode < 500);
        res.resume();
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }

  private async _findOnPath(cmd: string): Promise<string | null> {
    try {
      const which = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execFileAsync(which, [cmd], { timeout: 2000 });
      const p = stdout.trim().split('\n')[0].trim();
      return p || null;
    } catch {
      return null;
    }
  }

  private async _findWinAppDriver(): Promise<string | null> {
    for (const p of WINAPPDRIVER_PATHS) {
      try {
        if (fs.existsSync(p)) return p;
      } catch { /* ignore */ }
    }
    return await this._findOnPath('WinAppDriver.exe');
  }

  private async _listAndroidDevices(diagnostics: string[]): Promise<AndroidDevice[]> {
    try {
      const { stdout } = await execFileAsync('adb', ['devices', '-l'], { timeout: 3000 });
      const lines = stdout.split('\n').slice(1).filter((l) => l.trim() && !l.startsWith('*'));
      return lines.map((line): AndroidDevice => {
        const parts = line.trim().split(/\s+/);
        const serial = parts[0] ?? '';
        const state = (parts[1] ?? 'offline') as AndroidDevice['state'];
        const modelEntry = line.match(/model:(\S+)/);
        const apiEntry = line.match(/API_level:(\S+)/);
        return {
          serial,
          state,
          model: modelEntry?.[1],
          apiLevel: apiEntry?.[1],
        };
      });
    } catch {
      diagnostics.push('adb not found or could not list devices. Install Android SDK platform-tools.');
      return [];
    }
  }

  private async _listIosSimulators(diagnostics: string[]): Promise<IosSimulator[]> {
    if (process.platform !== 'darwin') return [];
    try {
      const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', '--json'], {
        timeout: 5000,
      });
      const parsed = JSON.parse(stdout) as { devices: Record<string, Array<{ udid: string; name: string; state: string }>> };
      const simulators: IosSimulator[] = [];
      for (const [runtime, devices] of Object.entries(parsed.devices ?? {})) {
        for (const d of devices) {
          simulators.push({ udid: d.udid, name: d.name, state: d.state, runtime });
        }
      }
      return simulators;
    } catch {
      diagnostics.push('xcrun simctl not available. Ensure Xcode command-line tools are installed.');
      return [];
    }
  }
}

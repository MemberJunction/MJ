import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { InstanceConfigEngine } from '@memberjunction/core-entities';

/** Feature keys of the `Diagnostics.*` rows in `MJ: Instance Configurations`. */
export const DIAGNOSTICS_SETTING_KEYS = {
  CaptureEnabled: 'Diagnostics.Capture.Enabled',
  SelfServiceRecording: 'Diagnostics.SelfServiceRecording',
  RequireLiteralScrubbing: 'Diagnostics.RequireLiteralScrubbing',
  ExternalEnabled: 'Diagnostics.External.Enabled',
  ExternalDestinations: 'Diagnostics.External.Destinations',
  ExternalCollectorUrl: 'Diagnostics.External.CollectorUrl',
  MaxSessionMinutes: 'Diagnostics.MaxSessionMinutes',
  RetentionDays: 'Diagnostics.RetentionDays',
  IntakeEnabled: 'Diagnostics.Intake.Enabled',
  IntakeStorageProviderID: 'Diagnostics.Intake.StorageProviderID',
  IntakeQuarantineStorageProviderID: 'Diagnostics.Intake.QuarantineStorageProviderID',
  IntakeDecryptOnIngest: 'Diagnostics.Intake.DecryptOnIngest',
  IntakeRetentionDays: 'Diagnostics.Intake.RetentionDays',
  IntakeOnBundleReceivedActionID: 'Diagnostics.Intake.OnBundleReceivedActionID',
  IntakeKeyPairCredentialID: 'Diagnostics.Intake.KeyPairCredentialID'
} as const;

const keys = DIAGNOSTICS_SETTING_KEYS;

/** False after a settings load failed and before the next one succeeds. */
let settingsAvailable = true;

/**
 * Typed view of the `Diagnostics.*` instance settings.
 * Each getter reads the current cached value and falls back to the seeded default.
 */
export class DiagnosticsSettings {
  private readonly engine: InstanceConfigEngine;

  private constructor(engine: InstanceConfigEngine) {
    this.engine = engine;
  }

  /**
   * Makes sure the instance settings are loaded (a no-op when they are), then returns the settings.
   * A failed load throws, and capture and intake read as disabled until a later load succeeds.
   */
  public static async Load(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<DiagnosticsSettings> {
    try {
      await InstanceConfigEngine.Instance.Config(false, contextUser, provider);
    } catch (err) {
      settingsAvailable = false;
      throw err;
    }
    settingsAvailable = true;
    return DiagnosticsSettings.Current();
  }

  /** Returns the settings from the cache as it is now, without loading. */
  public static Current(): DiagnosticsSettings {
    return new DiagnosticsSettings(InstanceConfigEngine.Instance);
  }

  /** False when the settings could not be loaded. */
  public get CaptureEnabled(): boolean {
    return settingsAvailable && this.engine.GetBoolean(keys.CaptureEnabled, true);
  }

  public get SelfServiceRecording(): boolean {
    return this.engine.GetBoolean(keys.SelfServiceRecording, false);
  }

  public get RequireLiteralScrubbing(): boolean {
    return this.engine.GetBoolean(keys.RequireLiteralScrubbing, false);
  }

  public get ExternalEnabled(): boolean {
    return this.engine.GetBoolean(keys.ExternalEnabled, false);
  }

  /** Allowed external destinations. An empty list allows every destination. */
  public get ExternalDestinations(): string[] {
    const list = this.engine.GetJSON<string[]>(keys.ExternalDestinations, []);
    return Array.isArray(list) ? list.filter((d) => typeof d === 'string' && d.trim().length > 0) : [];
  }

  public get ExternalCollectorUrl(): string {
    return this.getString(keys.ExternalCollectorUrl);
  }

  public get MaxSessionMinutes(): number {
    return this.positiveNumber(keys.MaxSessionMinutes, 60);
  }

  public get RetentionDays(): number {
    return this.positiveNumber(keys.RetentionDays, 14);
  }

  /** False when the settings could not be loaded. */
  public get IntakeEnabled(): boolean {
    return settingsAvailable && this.engine.GetBoolean(keys.IntakeEnabled, false);
  }

  public get IntakeStorageProviderID(): string {
    return this.getString(keys.IntakeStorageProviderID);
  }

  public get IntakeQuarantineStorageProviderID(): string {
    return this.getString(keys.IntakeQuarantineStorageProviderID);
  }

  public get IntakeDecryptOnIngest(): boolean {
    return this.engine.GetBoolean(keys.IntakeDecryptOnIngest, true);
  }

  public get IntakeRetentionDays(): number {
    return this.positiveNumber(keys.IntakeRetentionDays, 30);
  }

  public get IntakeOnBundleReceivedActionID(): string {
    return this.getString(keys.IntakeOnBundleReceivedActionID);
  }

  public get IntakeKeyPairCredentialID(): string {
    return this.getString(keys.IntakeKeyPairCredentialID);
  }

  private getString(key: string): string {
    return this.engine.Get(key)?.trim() ?? '';
  }

  private positiveNumber(key: string, defaultValue: number): number {
    const value = this.engine.GetNumber(key, defaultValue);
    return value > 0 ? value : defaultValue;
  }
}

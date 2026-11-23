import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { InstanceConfigEngine, UserInfoEngine } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/** `UserInfoEngine` setting key for runtime `ShellNoAccessComponent` branding JSON. */
export const SHELL_NO_ACCESS_BRANDING_SETTING_KEY = 'mj.shell.noAccess.branding.v1';

/** `InstanceConfigEngine` key for deployment-wide `ShellNoAccessComponent` branding JSON. */
export const SHELL_NO_ACCESS_BRANDING_INSTANCE_CONFIG_KEY = 'Shell.NoAccess.Branding';

/**
 * Domain-neutral branding and copy configuration for `ShellNoAccessComponent`.
 * All properties are optional; unset values fall back to clean domain-neutral defaults.
 */
export interface ShellNoAccessBrandingConfig {
  LogoUrl?: string;
  LogoIconClass?: string;
  BrandTitle?: string;
  Heading?: string;
  Message?: string;
  HelpText?: string;
  SupportLabel?: string;
  SupportEmail?: string;
  SupportUrl?: string;
  RefreshLabel?: string;
  SignOutLabel?: string;
}

/**
 * Fully resolved, sanitized branding configuration rendered by `ShellNoAccessComponent`.
 */
export interface ResolvedShellNoAccessBranding {
  LogoUrl: string | null;
  LogoIconClass: string;
  BrandTitle: string;
  Heading: string;
  Message: string;
  HelpText: string;
  SupportLabel: string;
  SupportEmail: string | null;
  SupportUrl: string | null;
  RefreshLabel: string;
  SignOutLabel: string;
}

type JsonPrimitive = string | number | boolean | null;
type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

const ALLOWED_BRANDING_KEYS: ReadonlyArray<keyof ShellNoAccessBrandingConfig> = [
  'LogoUrl',
  'LogoIconClass',
  'BrandTitle',
  'Heading',
  'Message',
  'HelpText',
  'SupportLabel',
  'SupportEmail',
  'SupportUrl',
  'RefreshLabel',
  'SignOutLabel',
];

const DEFAULT_SHELL_NO_ACCESS_BRANDING: Readonly<ResolvedShellNoAccessBranding> = {
  LogoUrl: null,
  LogoIconClass: 'fa-solid fa-shield-halved',
  BrandTitle: 'Workspace Access',
  Heading: 'No Applications Assigned',
  Message: 'Your account is signed in, but no applications or workspace spaces are currently assigned to your profile.',
  HelpText: 'If you recently received access or believe this is unexpected, refresh your permissions or reach out to your workspace administrator.',
  SupportLabel: 'Contact Support',
  SupportEmail: null,
  SupportUrl: null,
  RefreshLabel: 'Refresh Access',
  SignOutLabel: 'Sign Out',
};

function isPlainJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeUrl(rawUrl: string | null | undefined): string | null {
  const value = normalizeNonEmptyString(rawUrl);
  if (!value) {
    return null;
  }
  const lower = value.toLowerCase();
  if (lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('/') || lower.startsWith('data:image/')) {
    return value;
  }
  return null;
}

function sanitizeEmail(rawEmail: string | null | undefined): string | null {
  const value = normalizeNonEmptyString(rawEmail);
  if (!value) {
    return null;
  }
  if (/[\r\n\s<>]/.test(value) || !value.includes('@')) {
    return null;
  }
  return value;
}

function sanitizeIconClass(rawClass: string | null | undefined): string | null {
  const value = normalizeNonEmptyString(rawClass);
  if (!value) {
    return null;
  }
  return /^[a-zA-Z0-9\s_-]+$/.test(value) ? value : null;
}

/**
 * Returns a fresh copy of the default domain-neutral `ShellNoAccessBrandingConfig`.
 */
export function CreateDefaultNoAccessBrandingConfig(): ResolvedShellNoAccessBranding {
  return { ...DEFAULT_SHELL_NO_ACCESS_BRANDING };
}

/**
 * Parses a JSON string (e.g. from `UserInfoEngine.GetSetting`) into a typed
 * `Partial<ShellNoAccessBrandingConfig>`, supporting both PascalCase and camelCase keys.
 */
export function ParseNoAccessBrandingJson(raw: string | null | undefined): Partial<ShellNoAccessBrandingConfig> | null {
  const trimmed = normalizeNonEmptyString(raw);
  if (!trimmed) {
    return null;
  }
  try {
    const parsed: JsonValue = JSON.parse(trimmed);
    if (!isPlainJsonObject(parsed)) {
      return null;
    }
    const result: Partial<ShellNoAccessBrandingConfig> = {};
    let matched = false;
    for (const key of ALLOWED_BRANDING_KEYS) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      const rawVal = hasOwn(parsed, key) ? parsed[key] : hasOwn(parsed, camelKey) ? parsed[camelKey] : undefined;
      if (typeof rawVal === 'string') {
        const cleaned = normalizeNonEmptyString(rawVal);
        if (cleaned) {
          result[key] = cleaned;
          matched = true;
        }
      }
    }
    return matched ? result : null;
  } catch {
    return null;
  }
}

/**
 * Composes deployment, `UserInfoEngine` setting, and component-input branding overrides
 * over domain-neutral defaults with URL/email/icon sanitization.
 */
export function ResolveShellNoAccessBranding(...layers: ReadonlyArray<Partial<ShellNoAccessBrandingConfig> | null | undefined>): ResolvedShellNoAccessBranding {
  const merged = CreateDefaultNoAccessBrandingConfig();

  for (const layer of layers) {
    if (!layer) {
      continue;
    }
    const logoUrl = sanitizeUrl(layer.LogoUrl);
    if (logoUrl !== null) {
      merged.LogoUrl = logoUrl;
    }
    const iconClass = sanitizeIconClass(layer.LogoIconClass);
    if (iconClass !== null) {
      merged.LogoIconClass = iconClass;
    }
    const brandTitle = normalizeNonEmptyString(layer.BrandTitle);
    if (brandTitle !== null) {
      merged.BrandTitle = brandTitle;
    }
    const heading = normalizeNonEmptyString(layer.Heading);
    if (heading !== null) {
      merged.Heading = heading;
    }
    const message = normalizeNonEmptyString(layer.Message);
    if (message !== null) {
      merged.Message = message;
    }
    const helpText = normalizeNonEmptyString(layer.HelpText);
    if (helpText !== null) {
      merged.HelpText = helpText;
    }
    const supportLabel = normalizeNonEmptyString(layer.SupportLabel);
    if (supportLabel !== null) {
      merged.SupportLabel = supportLabel;
    }
    const supportEmail = sanitizeEmail(layer.SupportEmail);
    if (supportEmail !== null) {
      merged.SupportEmail = supportEmail;
    }
    const supportUrl = sanitizeUrl(layer.SupportUrl);
    if (supportUrl !== null) {
      merged.SupportUrl = supportUrl;
    }
    const refreshLabel = normalizeNonEmptyString(layer.RefreshLabel);
    if (refreshLabel !== null) {
      merged.RefreshLabel = refreshLabel;
    }
    const signOutLabel = normalizeNonEmptyString(layer.SignOutLabel);
    if (signOutLabel !== null) {
      merged.SignOutLabel = signOutLabel;
    }
  }

  return merged;
}

/**
 * Themeable, domain-neutral no-access surface rendered inside the Explorer shell
 * when an authenticated participant has zero accessible application grants.
 * Styled exclusively with semantic `--mj-*` CSS custom properties and zero web storage.
 */
@Component({
  standalone: false,
  selector: 'mj-shell-no-access',
  templateUrl: './shell-no-access.component.html',
  styleUrls: ['./shell-no-access.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellNoAccessComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  private _brandingConfig: Partial<ShellNoAccessBrandingConfig> | null = null;
  private _userInfoEngineOverride: UserInfoEngine | null = null;
  private _userName = '';
  private _userEmail = '';
  private _isRefreshing = false;
  private _refreshErrorMessage = '';
  private logoLoadFailed = false;

  /** Resolved branding snapshot used by the template. */
  public ResolvedBranding: ResolvedShellNoAccessBranding = CreateDefaultNoAccessBrandingConfig();

  /** Optional explicit branding overrides (highest precedence over engine settings). */
  @Input()
  public get BrandingConfig(): Partial<ShellNoAccessBrandingConfig> | null {
    return this._brandingConfig;
  }
  public set BrandingConfig(value: Partial<ShellNoAccessBrandingConfig> | null) {
    if (value !== this._brandingConfig) {
      this._brandingConfig = value;
      this.logoLoadFailed = false;
      this.refreshResolvedBranding();
    }
  }

  /** Optional `UserInfoEngine` override for isolated unit/DOM testing. */
  @Input()
  public get UserInfoEngineOverride(): UserInfoEngine | null {
    return this._userInfoEngineOverride;
  }
  public set UserInfoEngineOverride(value: UserInfoEngine | null) {
    if (value !== this._userInfoEngineOverride) {
      this._userInfoEngineOverride = value;
      this.logoLoadFailed = false;
      this.refreshResolvedBranding();
    }
  }

  /** Authenticated user display name shown in the identity pill when available. */
  @Input()
  public get UserName(): string {
    return this._userName;
  }
  public set UserName(value: string) {
    const normalized = value ?? '';
    if (normalized !== this._userName) {
      this._userName = normalized;
      this.cdr.markForCheck();
    }
  }

  /** Authenticated user email shown in the identity pill when available. */
  @Input()
  public get UserEmail(): string {
    return this._userEmail;
  }
  public set UserEmail(value: string) {
    const normalized = value ?? '';
    if (normalized !== this._userEmail) {
      this._userEmail = normalized;
      this.cdr.markForCheck();
    }
  }

  /** Indicates an active grant-refresh request in progress. */
  @Input()
  public get IsRefreshing(): boolean {
    return this._isRefreshing;
  }
  public set IsRefreshing(value: boolean) {
    if (value !== this._isRefreshing) {
      this._isRefreshing = value;
      this.cdr.markForCheck();
    }
  }

  /** Optional inline feedback message after a refresh check still finds zero grants or fails. */
  @Input()
  public get RefreshErrorMessage(): string {
    return this._refreshErrorMessage;
  }
  public set RefreshErrorMessage(value: string) {
    const normalized = value ?? '';
    if (normalized !== this._refreshErrorMessage) {
      this._refreshErrorMessage = normalized;
      this.cdr.markForCheck();
    }
  }

  /** Emitted when the participant asks to re-check application grants. */
  @Output() public RefreshAccess = new EventEmitter<void>();

  /** Emitted when the participant clicks Sign Out. */
  @Output() public SignOut = new EventEmitter<void>();

  /** True when a valid custom logo image URL should be rendered without fallback error. */
  public get ShowLogoImage(): boolean {
    return Boolean(this.ResolvedBranding.LogoUrl) && !this.logoLoadFailed;
  }

  /** True when either a support URL or support email is configured. */
  public get HasSupportContact(): boolean {
    return Boolean(this.SupportHref);
  }

  /** Resolved safe `href` (`SupportUrl` takes precedence over `mailto:SupportEmail`). */
  public get SupportHref(): string | null {
    if (this.ResolvedBranding.SupportUrl) {
      return this.ResolvedBranding.SupportUrl;
    }
    if (this.ResolvedBranding.SupportEmail) {
      return `mailto:${this.ResolvedBranding.SupportEmail}`;
    }
    return null;
  }

  /** True when the support link opens an external http(s) URL in a new tab. */
  public get SupportOpensNewTab(): boolean {
    const href = this.SupportHref ?? '';
    return href.startsWith('http://') || href.startsWith('https://');
  }

  /** True when user identity metadata should be rendered in the account pill. */
  public get HasIdentitySummary(): boolean {
    return Boolean(this.UserName.trim() || this.UserEmail.trim());
  }

  public ngOnInit(): void {
    this.refreshResolvedBranding();
    const engine = this.resolveUserInfoEngine();
    engine.DataChange$?.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.refreshResolvedBranding();
    });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Re-evaluates branding from `InstanceConfigEngine`, `UserInfoEngine`, and `@Input() BrandingConfig`. */
  public RefreshBranding(): void {
    this.refreshResolvedBranding();
  }

  /** Emits `RefreshAccess` unless a refresh is already running. */
  public OnRefreshAccess(): void {
    if (this.IsRefreshing) {
      return;
    }
    this.RefreshAccess.emit();
  }

  /** Emits `SignOut` to invoke the Explorer shell logout flow. */
  public OnSignOut(): void {
    this.SignOut.emit();
  }

  /** Falls back cleanly to the icon emblem if a configured `LogoUrl` fails to load. */
  public OnLogoImageError(): void {
    this.logoLoadFailed = true;
    this.cdr.markForCheck();
  }

  private refreshResolvedBranding(): void {
    const engine = this.resolveUserInfoEngine();
    const instanceConfigRaw = this.safeGetInstanceConfig(SHELL_NO_ACCESS_BRANDING_INSTANCE_CONFIG_KEY);
    const userSettingRaw = this.safeGetUserSetting(engine, SHELL_NO_ACCESS_BRANDING_SETTING_KEY);

    this.ResolvedBranding = ResolveShellNoAccessBranding(
      ParseNoAccessBrandingJson(instanceConfigRaw),
      ParseNoAccessBrandingJson(userSettingRaw),
      this._brandingConfig,
    );
    this.cdr.markForCheck();
  }

  private resolveUserInfoEngine(): UserInfoEngine {
    if (this._userInfoEngineOverride) {
      return this._userInfoEngineOverride;
    }
    try {
      const provider = this.Provider;
      if (provider && provider.InstanceConnectionString) {
        return UserInfoEngine.GetProviderInstance<UserInfoEngine>(provider, UserInfoEngine) as UserInfoEngine;
      }
    } catch {
      // Fall back to default singleton when Provider is unconfigured in isolated test runs
    }
    return UserInfoEngine.Instance;
  }

  private safeGetUserSetting(engine: UserInfoEngine, key: string): string | undefined {
    try {
      return engine.GetSetting(key);
    } catch {
      return undefined;
    }
  }

  private safeGetInstanceConfig(key: string): string | undefined {
    try {
      return InstanceConfigEngine.Instance.Get(key);
    } catch {
      return undefined;
    }
  }
}

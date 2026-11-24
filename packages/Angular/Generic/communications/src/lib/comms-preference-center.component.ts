import { ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';

/** Sender branding returned with the preferences. */
export interface PreferenceCenterTemplateContext {
  BrandName?: string;
  LogoURL?: string;
  PrimaryColor?: string;
  FooterText?: string;
}

/** One preference and the recipient's current state for it. */
export interface PreferenceCenterItem {
  ID: string;
  Name: string;
  Description?: string | null;
  Category?: string | null;
  MessageClass: 'Marketing' | 'Operational' | 'Transactional';
  State: 'Opted In' | 'Opted Out' | 'Pending';
}

/** Body of `GET <api-root>/preferences/:token` (JSON). */
export interface PreferenceCenterResponse {
  Token: string;
  Sender: {
    ID: string;
    Name: string;
    TemplateContext: PreferenceCenterTemplateContext;
  };
  Preferences: PreferenceCenterItem[];
  CanUnsubscribeAll: boolean;
}

/**
 * Public preference center. Loads a recipient's preferences with the unsubscribe token from their
 * email and lets them opt in or out of each, or unsubscribe from everything. Uses only `fetch`; it
 * needs no MemberJunction provider and no signed-in user.
 */
@Component({
  selector: 'mj-comms-preference-center',
  standalone: true,
  templateUrl: './comms-preference-center.component.html',
  styleUrls: ['./comms-preference-center.component.css'],
})
export class CommsPreferenceCenterComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private _token = '';
  private _apiRoot = '/comms';
  private _cspNonce = '';
  private isInitialized = false;

  @Input('token')
  public set Token(value: string) {
    const next = (value ?? '').trim();
    if (next !== this._token) {
      this._token = next;
      if (this.isInitialized && this._token) {
        void this.LoadPreferences();
      }
    }
  }
  public get Token(): string {
    return this._token;
  }

  @Input('api-root')
  public set ApiRoot(value: string) {
    const next = (value ?? '/comms').trim().replace(/\/+$/, '') || '/comms';
    if (next !== this._apiRoot) {
      this._apiRoot = next;
      if (this.isInitialized && this._token) {
        void this.LoadPreferences();
      }
    }
  }
  public get ApiRoot(): string {
    return this._apiRoot;
  }

  @Input('csp-nonce')
  public set CspNonce(value: string) {
    this._cspNonce = (value ?? '').trim();
  }
  public get CspNonce(): string {
    return this._cspNonce;
  }

  public IsLoading = false;
  public IsSaving = false;
  public ErrorMessage = '';
  public StatusMessage = '';
  public BrandName = 'Communication Preferences';
  public LogoUrl = '';
  public PrimaryColor = '';
  public FooterText = '';
  public Preferences: PreferenceCenterItem[] = [];

  public ngOnInit(): void {
    this.isInitialized = true;
    if (this._token) {
      void this.LoadPreferences();
    } else {
      this.ErrorMessage = 'Invalid preference link.';
      this.cdr.markForCheck();
    }
  }

  /** Loads the preferences for the current token. */
  public async LoadPreferences(): Promise<void> {
    if (!this._token) {
      this.ErrorMessage = 'Invalid preference link.';
      this.cdr.markForCheck();
      return;
    }

    this.IsLoading = true;
    this.ErrorMessage = '';
    this.StatusMessage = '';
    this.cdr.markForCheck();

    try {
      const res = await fetch(`${this._apiRoot}/preferences/${encodeURIComponent(this._token)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = (await res.json()) as Partial<PreferenceCenterResponse> & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Unable to load preferences.');
      }
      this.applyLoadedData(data as PreferenceCenterResponse);
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Unable to load preferences.';
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Flips one preference between `Opted In` and `Opted Out` locally. Nothing is saved until {@link
   * SavePreferences}.
   */
  public TogglePreference(pref: PreferenceCenterItem): void {
    pref.State = pref.State === 'Opted In' ? 'Opted Out' : 'Opted In';
    this.StatusMessage = '';
    this.cdr.markForCheck();
  }

  /** Saves the current state of every preference. */
  public async SavePreferences(): Promise<void> {
    await this.submitChoices(false);
  }

  /**
   * Creates an unsubscribe-all suppression for the recipient with this sender and opts them out of
   * every listed preference.
   */
  public async UnsubscribeAll(): Promise<void> {
    await this.submitChoices(true);
  }

  private applyLoadedData(data: PreferenceCenterResponse): void {
    const tc = data.Sender?.TemplateContext ?? {};
    this.BrandName = tc.BrandName || data.Sender?.Name || 'Communication Preferences';
    this.LogoUrl = this.sanitizeUrl(tc.LogoURL);
    this.PrimaryColor = this.sanitizeColor(tc.PrimaryColor);
    this.FooterText = tc.FooterText ?? '';
    this.Preferences = Array.isArray(data.Preferences)
      ? data.Preferences.map((p) => ({ ...p }))
      : [];
  }

  private async submitChoices(unsubscribeAll: boolean): Promise<void> {
    if (!this._token || this.IsSaving) return;

    this.IsSaving = true;
    this.ErrorMessage = '';
    this.StatusMessage = '';
    this.cdr.markForCheck();

    try {
      const payload = unsubscribeAll
        ? { UnsubscribeAll: true }
        : {
            Preferences: this.Preferences.map((p) => ({
              PreferenceID: p.ID,
              State: p.State === 'Opted In' ? ('Opted In' as const) : ('Opted Out' as const),
            })),
          };

      const res = await fetch(`${this._apiRoot}/preferences/${encodeURIComponent(this._token)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const result = (await res.json()) as {
        Success?: boolean;
        Preferences?: PreferenceCenterItem[];
        error?: string;
        ErrorMessage?: string;
      };
      if (!res.ok || result.Success === false) {
        throw new Error(result.error || result.ErrorMessage || 'Failed to save preferences.');
      }

      if (Array.isArray(result.Preferences)) {
        this.Preferences = result.Preferences.map((p) => ({ ...p }));
      } else if (unsubscribeAll) {
        this.Preferences = this.Preferences.map((p) => ({ ...p, State: 'Opted Out' }));
      }
      this.StatusMessage = unsubscribeAll
        ? 'You have been unsubscribed from all communications.'
        : 'Preferences saved.';
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Unable to save preferences.';
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  private sanitizeUrl(raw: string | undefined): string {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
      return trimmed;
    }
    return '';
  }

  private sanitizeColor(raw: string | undefined): string {
    if (!raw) return '';
    const trimmed = raw.trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ? trimmed : '';
  }
}

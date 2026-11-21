/**
 * @fileoverview Caches the default theme for the public login-screen route.
 *
 * @module @memberjunction/server/auth
 */
import { BaseEngine, BaseEnginePropertyConfig, RegisterForStartup, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { MJThemeEntity } from '@memberjunction/core-entities';
import { PublicLoginScreenFromTheme, type PublicLoginScreen } from '@memberjunction/theme-engine';

/** What the route serves when there is no default theme, or it cannot be read. */
export const EMPTY_PUBLIC_LOGIN_SCREEN: Readonly<PublicLoginScreen> = { ThemeName: null, Design: null, Seeds: null, Logos: {} };

/**
 * Holds the default Active theme, so `GET /auth/login-screen` answers every anonymous page load from
 * memory. Saving a theme refreshes it, so a publish in Login Studio reaches the login screen without a
 * restart. Severity `warn`: a failed load must not stop the server; the route then serves the stock page.
 */
@RegisterForStartup({
  priority: 20,
  severity: 'warn',
  deferred: false,
  description: 'Caches the default theme that GET /auth/login-screen serves to the login screen'
})
export class LoginScreenEngine extends BaseEngine<LoginScreenEngine> {
  private _defaultThemes: MJThemeEntity[] = [];

  public static get Instance(): LoginScreenEngine {
    return super.getInstance<LoginScreenEngine>();
  }

  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    const configs: Partial<BaseEnginePropertyConfig>[] = [
      {
        PropertyName: '_defaultThemes',
        EntityName: 'MJ: Themes',
        // One default is enforced by the app, not the schema; the most recently changed one wins (as in Login Studio).
        Filter: `IsDefault = 1 AND Status = 'Active'`,
        OrderBy: '__mj_UpdatedAt DESC',
        CacheLocal: true
      }
    ];
    await this.Load(configs, provider, forceRefresh, contextUser);
  }

  /** The default theme's public projection: its PUBLISHED design (never the draft), seeds and logos made safe. */
  public GetPublicLoginScreen(): PublicLoginScreen {
    const theme = this.GetConfigData<MJThemeEntity>('_defaultThemes')[0];
    return theme ? PublicLoginScreenFromTheme(theme) : EMPTY_PUBLIC_LOGIN_SCREEN;
  }
}

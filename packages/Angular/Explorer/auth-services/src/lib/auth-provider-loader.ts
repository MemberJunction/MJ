import type { PublicAuthProviderInfo } from '@memberjunction/core';
import { AuthProviderCatalog } from './auth-provider-catalog';
import { HasMagicLinkSessionToken, MAGIC_LINK_PROVIDER_TYPE } from './magic-link-session';

/**
 * Dynamically imports only the single active auth provider module so unused
 * IdP SDKs (MSAL, Auth0, Okta, Cognito/Amplify, WorkOS) code-split into
 * separate lazy chunks instead of bloating the initial Explorer bundle.
 *
 * Rule 8 justification: Category #1/#3 lazy loading of heavy IdP SDKs on the
 * single active provider code path; all IdP peer/runtime deps remain declared
 * in `package.json`.
 */
export async function LoadAuthProvider(authType: string): Promise<unknown> {
  switch (authType.trim().toLowerCase()) {
    case 'msal': {
      const mod = await import('./providers/mjexplorer-msal-provider.service');
      return mod.MJMSALProvider;
    }
    case 'auth0': {
      const mod = await import('./providers/mjexplorer-auth0-provider.service');
      return mod.MJAuth0Provider;
    }
    case 'okta': {
      const mod = await import('./providers/mjexplorer-okta-provider.service');
      return mod.MJOktaProvider;
    }
    case 'cognito': {
      const mod = await import('./providers/mjexplorer-cognito-provider.service');
      return mod.MJCognitoProvider;
    }
    case 'workos': {
      const mod = await import('./providers/mjexplorer-workos-provider.service');
      return mod.MJWorkOSProvider;
    }
    case 'magic-link': {
      const mod = await import('./providers/mjexplorer-magic-link-provider.service');
      return mod.MJMagicLinkProvider;
    }
    case 'local': {
      const mod = await import('./providers/mjexplorer-local-dev-provider.service');
      return mod.MJLocalDevProvider;
    }
    default:
      return undefined;
  }
}

/**
 * Resolves which auth provider this page load will use (matching
 * `AuthServicesModule.ForRoot` precedence: active magic-link token, then
 * preloaded catalog primary/selected driver, then `environment.AUTH_TYPE`) and
 * dynamically imports its module so its `@RegisterClass(MJAuthBase, ...)`
 * decorator runs before `AppModule` is imported.
 */
export async function PreloadActiveAuthProvider(
  environment: object,
  catalog?: PublicAuthProviderInfo[]
): Promise<string | undefined> {
  const env = environment as Record<string, unknown>;
  const configuredType = typeof env['AUTH_TYPE'] === 'string' ? env['AUTH_TYPE'].toLowerCase() : undefined;
  const resolvedCatalog = catalog ?? AuthProviderCatalog.GetPreloaded();
  const magicLinkActive = HasMagicLinkSessionToken();
  const resolution = resolvedCatalog.length ? AuthProviderCatalog.Resolve(resolvedCatalog) : null;
  const catalogType = resolution?.active?.driverClass?.toLowerCase();
  const authType = magicLinkActive ? MAGIC_LINK_PROVIDER_TYPE : (catalogType ?? configuredType);

  if (!authType) {
    return undefined;
  }

  await LoadAuthProvider(authType);
  return authType;
}

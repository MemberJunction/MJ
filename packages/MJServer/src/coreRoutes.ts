/**
 * Core HTTP routes MJServer mounts itself, every one under the API root via {@link ApiRoute}.
 *
 * Extracted from `serve()` so `__tests__/apiRootBoot.test.ts` can mount them on a bare Express app with
 * `GRAPHQL_ROOT_PATH=/api/` and check every registered path. `serve()` still decides the ORDER (relative
 * to compression, the auth middleware, server extensions and Apollo); these functions only mount.
 *
 * ALL new custom routes, webhooks and integrations belong in Server Extensions
 * (guides/SERVER_EXTENSIONS_GUIDE.md), not here.
 */
import cors from 'cors';
import { default as BodyParser } from 'body-parser';
import type { Application, Router } from 'express';
import { REALTIME_SDP_EXCHANGE_PATH } from '@memberjunction/ai';
import type { ServerExtensionLoader } from '@memberjunction/server-extensions-core';
import { configInfo } from './config.js';
import { ApiRoute } from './apiRoot.js';
import { CreateOAuthCallbackHandler } from './rest/OAuthCallbackHandler.js';
import { CreateSignatureWebhookHandler } from './rest/SignatureWebhookHandler.js';
import { CreateMediaStreamRouter } from './rest/MediaStreamHandler.js';
import { CreateRealtimeSdpBrokerRouter } from './rest/RealtimeSdpBrokerHandler.js';
import { CreateMagicLinkHandler, CreateMagicLinkJwksRouter, RegisterMagicLinkAuthProvider, MAGIC_LINK_MOUNT_PATH } from './auth/magicLink/index.js';
import { CreateWidgetHandler, WIDGET_MOUNT_PATH } from './realtimeWidget/index.js';
import { CreateRealtimeVerifyRouter, REALTIME_VERIFY_MOUNT_PATH, RealtimeSessionVerificationService } from './realtimeSessions/index.js';
import { CreateAuthProviderCatalogRouter, AUTH_CATALOG_MOUNT_PATH } from './auth/AuthProviderCatalogRouter.js';
import type { StartupLogger } from './logging/StartupLogger.js';

type RouteLog = Pick<StartupLogger, 'LogIf'>;

/** Routers the public mounts create that must be mounted again after the auth middleware. */
export interface CoreAuthenticatedRouters {
    OAuth?: Router;
    MagicLink?: Router;
    Widget?: Router;
}

/** `/healthcheck` — mounted first so platform probes never meet the auth middleware. */
export function MountHealthcheckRoute(app: Application): void {
    app.get(ApiRoute('/healthcheck'), cors<cors.CorsRequest>(), (_req, res) => {
        res.status(200).json({ status: 'ok' });
    });
}

/**
 * The unauthenticated core routes (OAuth callback, eSignature webhook, media streaming, realtime SDP
 * broker, magic-link, widget, realtime verify). Each verifies its own capability (signature, token,
 * ticket), so they mount BEFORE the auth middleware. Returns the routers that belong after it.
 */
export function MountPublicCoreRoutes(app: Application, publicUrl: string, log: RouteLog): CoreAuthenticatedRouters {
    const routers: CoreAuthenticatedRouters = { OAuth: mountOAuthCallback(app, publicUrl, log) };

    app.use(ApiRoute('/esignature'), cors<cors.CorsRequest>(), CreateSignatureWebhookHandler());
    log.LogIf('verbose', `[eSignature] Webhook route registered at ${ApiRoute('/esignature')}/webhook/:driverKey`);

    // The `?token=` query param is the capability; an <audio>/<video> element can't send Authorization headers.
    app.use(ApiRoute('/media'), cors<cors.CorsRequest>(), CreateMediaStreamRouter());
    log.LogIf('verbose', `[Media] Streaming route registered at ${ApiRoute('/media')}/:fileId`);

    if (configInfo.realtime?.enabled) {
        app.use(ApiRoute(REALTIME_SDP_EXCHANGE_PATH), cors<cors.CorsRequest>(), CreateRealtimeSdpBrokerRouter());
        log.LogIf('verbose', `[Realtime] WebRTC SDP broker registered at ${ApiRoute(REALTIME_SDP_EXCHANGE_PATH)}`);
    }

    routers.MagicLink = mountMagicLinkPublic(app, publicUrl, log);
    routers.Widget = mountWidgetPublic(app, publicUrl, log);
    mountRealtimeVerify(app, log);
    return routers;
}

function mountOAuthCallback(app: Application, publicUrl: string, log: RouteLog): Router | undefined {
    if (!publicUrl) {
        return undefined;
    }
    const { callbackRouter, authenticatedRouter } = CreateOAuthCallbackHandler({
        publicUrl,
        successRedirectUrl: ApiRoute('/oauth/success', { absolute: true }),
        errorRedirectUrl: ApiRoute('/oauth/error', { absolute: true }),
        // Constrains where a caller-supplied frontendReturnUrl may point (open-redirect guard).
        allowedFrontendOrigins: configInfo.cors?.allowedOrigins ?? ['*'],
    });
    // The callback is unauthenticated (called by the external auth server).
    app.use(ApiRoute('/oauth'), cors<cors.CorsRequest>(), callbackRouter);
    log.LogIf('verbose', `[OAuth] Callback route registered at ${ApiRoute('/oauth')}/callback`);
    return authenticatedRouter;
}

/** Public magic-link router (JWKS + redeem). The invite-creation router is returned for after auth. */
function mountMagicLinkPublic(app: Application, publicUrl: string, log: RouteLog): Router | undefined {
    if (!configInfo.magicLink?.enabled) {
        return undefined;
    }
    const { publicRouter, authenticatedRouter } = CreateMagicLinkHandler(publicUrl, configInfo.magicLink);
    RegisterMagicLinkAuthProvider(publicUrl, configInfo.magicLink);
    app.use(ApiRoute(MAGIC_LINK_MOUNT_PATH), cors<cors.CorsRequest>(), publicRouter);
    log.LogIf('verbose', `[MagicLink] Public routes registered at ${ApiRoute(MAGIC_LINK_MOUNT_PATH)}/redeem and ${ApiRoute(MAGIC_LINK_MOUNT_PATH)}/jwks.json`);
    return authenticatedRouter;
}

/**
 * Public widget guest-session mint. It reuses the magic-link RS256 key, so when magic-link itself is
 * disabled the JWKS is published here — otherwise every guest token fails validation and the widget 401s.
 */
function mountWidgetPublic(app: Application, publicUrl: string, log: RouteLog): Router | undefined {
    if (!configInfo.widget?.enabled) {
        return undefined;
    }
    const { publicRouter, authenticatedRouter } = CreateWidgetHandler(publicUrl, configInfo.widget);
    app.use(ApiRoute(WIDGET_MOUNT_PATH), cors<cors.CorsRequest>(), publicRouter);
    if (!configInfo.magicLink?.enabled) {
        app.use(ApiRoute(MAGIC_LINK_MOUNT_PATH), cors<cors.CorsRequest>(), CreateMagicLinkJwksRouter());
        log.LogIf('verbose', `[Widget] Published reused signing key at ${ApiRoute(MAGIC_LINK_MOUNT_PATH)}/jwks.json (magic-link flow disabled)`);
    }
    log.LogIf('verbose', `[Widget] Public routes registered at ${ApiRoute(WIDGET_MOUNT_PATH)}/session and ${ApiRoute(WIDGET_MOUNT_PATH)}/session/refresh`);
    return authenticatedRouter;
}

/**
 * Realtime identity-verification links. The emailed single-use token is the capability. Mounted only when
 * verification can send mail AND protect its codes (realtime.identityVerification config).
 */
function mountRealtimeVerify(app: Application, log: RouteLog): void {
    const verification = RealtimeSessionVerificationService.Instance;
    if (configInfo.realtime?.identityVerification?.enabled && !verification.IsEnabled) {
        console.warn('[RealtimeVerify] realtime.identityVerification.enabled is true but verification is unavailable: it needs a communicationProvider and an hmacSecret of at least 16 characters.');
    }
    if (!verification.IsEnabled) {
        return;
    }
    app.use(ApiRoute(REALTIME_VERIFY_MOUNT_PATH), cors<cors.CorsRequest>(), CreateRealtimeVerifyRouter());
    log.LogIf('verbose', `[RealtimeVerify] Public routes registered at ${ApiRoute(REALTIME_VERIFY_MOUNT_PATH)}/:token (GET) and ${ApiRoute(REALTIME_VERIFY_MOUNT_PATH)} (POST)`);
}

/** `/health/extensions` — always mounted; an empty array when no extensions loaded. */
export function MountExtensionHealthRoute(app: Application, loader: ServerExtensionLoader): void {
    app.get(ApiRoute('/health/extensions'), async (_req, res) => {
        const results = await loader.HealthCheckAll();
        const allHealthy = results.length === 0 || results.every((r) => r.Healthy);
        res.status(allHealthy ? 200 : 503).json({ extensions: results });
    });
}

/**
 * Public authentication-provider catalog. The browser needs it BEFORE it holds a token; it publishes only
 * the non-secret allow-list (AuthProviderEngine.GetPublicCatalog).
 */
export function MountAuthCatalogRoute(app: Application, log: RouteLog): void {
    app.use(ApiRoute(AUTH_CATALOG_MOUNT_PATH), cors<cors.CorsRequest>(), CreateAuthProviderCatalogRouter());
    log.LogIf('verbose', `[Auth] Public provider catalog registered at ${ApiRoute(AUTH_CATALOG_MOUNT_PATH)}/providers`);
}

/** The routers {@link MountPublicCoreRoutes} returned, mounted AFTER the unified auth middleware. */
export function MountAuthenticatedCoreRoutes(app: Application, routers: CoreAuthenticatedRouters, log: RouteLog): void {
    if (routers.OAuth) {
        app.use(ApiRoute('/oauth'), cors<cors.CorsRequest>(), BodyParser.json(), routers.OAuth);
        log.LogIf('verbose', `[OAuth] Authenticated routes registered at ${ApiRoute('/oauth')}/status, /initiate and /exchange`);
    }
    if (routers.MagicLink) {
        app.use(ApiRoute(MAGIC_LINK_MOUNT_PATH), cors<cors.CorsRequest>(), routers.MagicLink);
        log.LogIf('verbose', `[MagicLink] Authenticated route registered at ${ApiRoute(MAGIC_LINK_MOUNT_PATH)}/create`);
    }
    // A verified visitor (post magic-link upgrade) promotes their anonymous trail here.
    if (routers.Widget) {
        app.use(ApiRoute(WIDGET_MOUNT_PATH), cors<cors.CorsRequest>(), routers.Widget);
        log.LogIf('verbose', `[Widget] Authenticated route registered at ${ApiRoute(WIDGET_MOUNT_PATH)}/resolve-identity`);
    }
}

/**
 * auth-validation.checks.ts — the 'auth-validation' bundle (AV1–AV7): the server auth stack's
 * token/identity-validation seams that are deterministic WITHOUT a live IdP
 * (packages/AuthProviders + the AuthProviderFactory MJServer's JWT path resolves through —
 * a subsystem that previously had only mocked unit coverage).
 *
 * SERVER TRANSPORT, no network: nothing here contacts a JWKS endpoint or an IdP. The two
 * proof techniques:
 *   1. The REAL registered provider classes + the REAL process ClassFactory — the same
 *      `CreateInstance(BaseAuthProvider, type)` dispatch `initializeAuthProviders()` runs at
 *      MJAPI boot, and the same issuer-matching the per-request JWT path runs BEFORE any
 *      JWKS fetch (an unknown issuer is rejected with zero network — the deterministic half
 *      of token validation).
 *   2. SELF-MINTED RS256 assertions (node:crypto keypair + hand-built JWS) driven through
 *      `HostIdentityProvider.VerifyHostAssertion` — the one shipped verification path that is
 *      DESIGNED to work against a static public key with no IdP, so real signature/audience/
 *      expiry/max-age enforcement runs end to end in-process.
 *
 *   - AV1  The provider-type roster: all 8 shipped types (auth0, msal, okta, cognito, google,
 *          workos, magic-link, host-identity) are registered on the ClassFactory, resolvable
 *          case-insensitively; an unknown type is not.
 *   - AV2  createProvider dispatch: each type constructs the right concrete class (spot-checked
 *          for auth0/msal/magic-link/host-identity, instanceof BaseAuthProvider for all), and a
 *          config missing its jwksUri fails with the factory's wrapped creation error.
 *   - AV3  Registration governance: register() accepts a complete config (getByName /
 *          getAllProviders / hasProviders agree) and REFUSES a provider whose validateConfig
 *          fails ('Invalid configuration' — the gate that keeps half-configured providers out
 *          of the JWT path).
 *   - AV4  Issuer resolution: getByIssuer normalizes trailing slash + case; an unknown issuer
 *          returns undefined (the pre-network rejection); getAllByIssuer aggregates BOTH
 *          same-issuer/different-audience providers (the multi-app contract
 *          getValidationOptions builds on); repeated lookups are stable through the LRU cache.
 *   - AV5  Host-assertion happy path: a freshly-minted RS256 assertion verifies against its
 *          public key — ok:true, all identity claims mapped, hostUserId = sub.
 *   - AV6  The rejection matrix (each leg ONE deviation from AV5's proven-good control):
 *          missing → 'missing'; no key → 'no_key'; wrong key / tampered payload / wrong
 *          audience → 'bad_signature'; expired exp → 'expired'; iat older than the 10-minute
 *          ceiling (host-chosen exp still valid!) → 'expired'; an exp-LESS assertion inside
 *          the max-age window → 'expired' (the post-verify explicit-exp guard); valid
 *          signature without email → 'no_email'. ok:false never leaks userInfo.
 *   - AV7  Claim-mapping parity: MagicLinkProvider's OIDC mapping incl. the full-name
 *          splitting fallback, and HostIdentityProvider's alternate firstName/lastName claim
 *          names — the exact fields MJServer's new-user flow gates on.
 *
 * Process hygiene: AuthProviderFactory is a process-global singleton. Setup snapshots
 * whatever providers are already registered (none, in the mj-test CLI process — MJServer's
 * initializeAuthProviders never runs here); Teardown clears the factory and re-registers the
 * snapshot, so the bundle leaves the factory exactly as it found it.
 *
 * NOTE on fixtures: module state, not a typed IntegrationCheckContext slot (see the
 * scheduling-concurrency header for the precedent). No DB rows are created.
 *
 * Header observation (documented, deliberately NOT asserted): createProvider with an entirely
 * UNKNOWN type does not throw today — the ClassFactory's unmarked-base fallback hands back a
 * hollow BaseAuthProvider instance with no extractUserInfo implementation. Pinning that would
 * freeze a latent bug; marking BaseAuthProvider @RequiresSubclass would fix it (see CR4).
 */
import { generateKeyPairSync, createSign } from 'node:crypto';
import type { AuthProviderConfig } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    AuthProviderFactory,
    BaseAuthProvider,
    Auth0Provider,
    MSALProvider,
    MagicLinkProvider,
    HostIdentityProvider
} from '@memberjunction/auth-providers';
import type { IAuthProvider, HostAssertionVerifyResult, HostAssertionError } from '@memberjunction/auth-providers';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Every provider type shipped in @memberjunction/auth-providers (its barrel registers all 8). */
const SHIPPED_PROVIDER_TYPES = ['auth0', 'msal', 'okta', 'cognito', 'google', 'workos', 'magic-link', 'host-identity'] as const;

/** The widget key our minted assertions carry as `aud`. */
const WIDGET_AUDIENCE = 'mj-it-widget-key';

interface AuthValidationFixture {
    /** Providers registered on the process-global factory BEFORE this bundle ran (restored in Teardown). */
    PriorProviders: IAuthProvider[];
    /** PEM keypair A — the trusted host key. */
    PublicPem: string;
    PrivatePem: string;
    /** PEM keypair B — an attacker/rotated key for the wrong-key leg. */
    OtherPublicPem: string;
    OtherPrivatePem: string;
    /** A host-identity provider instance for the VerifyHostAssertion checks. */
    HostProvider: HostIdentityProvider;
}
let fixture: AuthValidationFixture | undefined;

function fx(): AuthValidationFixture {
    Assert(fixture != null, 'auth-validation fixture missing (bundle Setup did not run)');
    return fixture!;
}

/** Generates an RSA-2048 keypair as SPKI/PKCS8 PEM strings. */
function generatePemKeyPair(): { publicPem: string; privatePem: string } {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { publicPem: publicKey, privatePem: privateKey };
}

/** Hand-builds a compact RS256 JWS (header.payload.signature) signed with the given PEM key. */
function mintAssertion(privatePem: string, claims: Record<string, unknown>): string {
    const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
    const signingInput = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    return `${signingInput}.${signer.sign(privatePem).toString('base64url')}`;
}

/** The proven-good claim set AV5 verifies and AV6 derives each single-deviation leg from. */
function goodClaims(nowSec: number): Record<string, unknown> {
    return {
        iss: 'https://host-portal.integration.test',
        aud: WIDGET_AUDIENCE,
        sub: 'host-user-42',
        email: 'it-host-visitor@integration.test',
        given_name: 'Grace',
        family_name: 'Hopper',
        name: 'Grace Hopper',
        iat: nowSec,
        exp: nowSec + 300
    };
}

/** A complete, valid provider config for factory checks (unique name per call). */
function makeConfig(type: string, name: string, issuer: string, audience: string): AuthProviderConfig {
    return {
        name,
        type,
        issuer,
        audience,
        // Never contacted: nothing in this bundle triggers a JWKS fetch.
        jwksUri: `https://${name}.integration.test/.well-known/jwks.json`
    };
}

/** Asserts a VerifyHostAssertion result is a rejection with the expected code and no identity leak. */
function assertRejected(result: HostAssertionVerifyResult, expected: HostAssertionError, label: string): void {
    AssertEqual(result.ok, false, `${label}: ok`);
    AssertEqual(result.errorCode, expected, `${label}: errorCode`);
    Assert(result.userInfo === undefined, `${label}: a rejected assertion must not leak userInfo`);
}

export const AuthValidationChecks: NamedCheck[] = [
    {
        Id: 'auth-validation.AV1',
        Name: 'AV1: all 8 shipped provider types are ClassFactory-registered and resolvable case-insensitively',
        Fn: async (_ctx: IntegrationCheckContext) => {
            const registered = AuthProviderFactory.getRegisteredProviderTypes();
            for (const type of SHIPPED_PROVIDER_TYPES) {
                Assert(registered.includes(type),
                    `provider type '${type}' is not registered on the ClassFactory (registered: ${registered.join(', ')})`);
                Assert(AuthProviderFactory.isProviderTypeRegistered(type), `isProviderTypeRegistered('${type}')`);
                // The factory lowercases before lookup — the config file's casing must not matter.
                Assert(AuthProviderFactory.isProviderTypeRegistered(type.toUpperCase()),
                    `isProviderTypeRegistered must be case-insensitive for '${type.toUpperCase()}'`);
            }
            AssertEqual(AuthProviderFactory.isProviderTypeRegistered(`mj-it-nope-${Date.now()}`), false,
                'an unknown provider type must not report as registered');
            console.log(`      → ${SHIPPED_PROVIDER_TYPES.length}/${registered.length} shipped types registered, case-insensitive lookups hold`);
        }
    },
    {
        Id: 'auth-validation.AV2',
        Name: 'AV2: createProvider dispatches each type to its concrete class; a jwksUri-less config fails creation',
        Fn: async (_ctx: IntegrationCheckContext) => {
            for (const type of SHIPPED_PROVIDER_TYPES) {
                const provider = AuthProviderFactory.createProvider(
                    makeConfig(type, `mj-it-av2-${type}`, `https://av2-${type}.integration.test`, `aud-${type}`));
                Assert(provider instanceof BaseAuthProvider, `'${type}' did not produce a BaseAuthProvider`);
                Assert(provider.validateConfig(), `'${type}' with a complete config must validate`);
            }
            // Spot-check the concrete dispatch (incl. mixed-case type → same class).
            const auth0 = AuthProviderFactory.createProvider(makeConfig('Auth0', 'mj-it-av2-Auth0', 'https://av2-cased.integration.test', 'aud'));
            Assert(auth0 instanceof Auth0Provider, `'Auth0' (mixed case) resolved to ${auth0.constructor.name}, not Auth0Provider`);
            const msal = AuthProviderFactory.createProvider(makeConfig('msal', 'mj-it-av2-msal2', 'https://av2-msal2.integration.test', 'aud'));
            Assert(msal instanceof MSALProvider, `'msal' resolved to ${msal.constructor.name}, not MSALProvider`);
            const magic = AuthProviderFactory.createProvider(makeConfig('magic-link', 'mj-it-av2-ml', 'https://av2-ml.integration.test', 'aud'));
            Assert(magic instanceof MagicLinkProvider, `'magic-link' resolved to ${magic.constructor.name}, not MagicLinkProvider`);
            const host = AuthProviderFactory.createProvider(makeConfig('host-identity', 'mj-it-av2-hi', 'https://av2-hi.integration.test', 'aud'));
            Assert(host instanceof HostIdentityProvider, `'host-identity' resolved to ${host.constructor.name}, not HostIdentityProvider`);

            // A config with NO jwksUri cannot even construct (the base wires the JWKS client
            // from it) — the factory surfaces that as its wrapped creation error.
            let threw = false;
            let message = '';
            try {
                AuthProviderFactory.createProvider({ name: 'mj-it-av2-broken', type: 'auth0', issuer: 'https://x.test', audience: 'aud' });
            } catch (error) {
                threw = true;
                message = error instanceof Error ? error.message : String(error);
            }
            Assert(threw, 'createProvider without a jwksUri must throw');
            Assert(message.includes(`Failed to create authentication provider for type 'auth0'`),
                `the creation failure must carry the wrapped factory message; got: ${message.slice(0, 300)}`);
            console.log(`      → all 8 types dispatch to concrete classes; jwksUri-less config refused with the wrapped error`);
        }
    },
    {
        Id: 'auth-validation.AV3',
        Name: 'AV3: register() admits a valid provider and refuses one whose validateConfig fails',
        Fn: async (_ctx: IntegrationCheckContext) => {
            const factory = AuthProviderFactory.Instance;
            const name = `mj-it-av3-${Date.now()}`;
            const provider = AuthProviderFactory.createProvider(makeConfig('okta', name, 'https://av3.integration.test', 'av3-aud'));
            factory.register(provider);
            Assert(factory.hasProviders(), 'hasProviders after a successful register');
            const byName = factory.getByName(name);
            Assert(byName != null && byName.name === name, 'getByName must return the registered provider');
            Assert(factory.getAllProviders().some(p => p.name === name), 'getAllProviders must include the registered provider');

            // The governance gate: blank out a required field so validateConfig fails, and
            // register() must refuse — this is what keeps a half-configured provider out of
            // the server's JWT verification path.
            const broken = AuthProviderFactory.createProvider(makeConfig('okta', `${name}-broken`, 'https://av3b.integration.test', 'aud'));
            broken.jwksUri = '';
            let threw = false;
            let message = '';
            try {
                factory.register(broken);
            } catch (error) {
                threw = true;
                message = error instanceof Error ? error.message : String(error);
            }
            Assert(threw, 'register() must refuse a provider whose validateConfig fails');
            Assert(message.includes('Invalid configuration'), `the refusal must name the invalid configuration; got: ${message.slice(0, 300)}`);
            AssertEqual(factory.getByName(`${name}-broken`), undefined, 'a refused provider must not be registered');
            console.log(`      → valid provider admitted (${name}); invalid one refused and absent from the registry`);
        }
    },
    {
        Id: 'auth-validation.AV4',
        Name: 'AV4: issuer resolution normalizes slash/case, rejects unknown issuers pre-network, and aggregates same-issuer providers',
        Fn: async (_ctx: IntegrationCheckContext) => {
            const factory = AuthProviderFactory.Instance;
            const issuer = `https://av4-shared.integration.test/tenant-${Date.now()}`;
            const appA = AuthProviderFactory.createProvider(makeConfig('auth0', 'mj-it-av4-app-a', issuer, 'av4-audience-a'));
            const appB = AuthProviderFactory.createProvider(makeConfig('auth0', 'mj-it-av4-app-b', issuer, 'av4-audience-b'));
            factory.register(appA);
            factory.register(appB);

            // Normalization: the token's `iss` may differ by trailing slash and case.
            const bySlash = factory.getByIssuer(`${issuer}/`);
            Assert(bySlash != null, 'getByIssuer must match despite a trailing slash');
            const byCase = factory.getByIssuer(issuer.toUpperCase());
            Assert(byCase != null, 'getByIssuer must match case-insensitively');

            // The pre-network rejection: an unknown issuer resolves to NOTHING — MJServer's
            // getSigningKeys path then refuses the token without ever fetching a JWKS.
            AssertEqual(factory.getByIssuer(`https://unknown-idp-${Date.now()}.integration.test`), undefined,
                'an unknown issuer must resolve to undefined (the deterministic rejection)');

            // Multi-app aggregation: BOTH same-issuer providers surface, with both audiences —
            // the contract getValidationOptions turns into jwt.verify's audience array.
            const all = factory.getAllByIssuer(issuer);
            Assert(all.length >= 2, `getAllByIssuer must return both same-issuer providers (got ${all.length})`);
            const audiences = new Set(all.map(p => p.audience));
            Assert(audiences.has('av4-audience-a') && audiences.has('av4-audience-b'),
                `both audiences must be represented (got: ${[...audiences].join(', ')})`);

            // LRU-cached lookups stay stable (same instance back on a repeat).
            const first = factory.getByIssuer(issuer);
            const second = factory.getByIssuer(issuer);
            Assert(first != null && first === second, 'repeated getByIssuer must return the same cached provider instance');
            console.log(`      → slash/case normalized; unknown issuer → undefined; ${all.length} providers / ${audiences.size} audiences aggregated`);
        }
    },
    {
        Id: 'auth-validation.AV5',
        Name: 'AV5: a self-minted RS256 host assertion verifies — identity claims mapped, hostUserId = sub',
        Fn: async (_ctx: IntegrationCheckContext) => {
            const f = fx();
            const nowSec = Math.floor(Date.now() / 1000);
            const assertion = mintAssertion(f.PrivatePem, goodClaims(nowSec));

            const result = f.HostProvider.VerifyHostAssertion(assertion, f.PublicPem, WIDGET_AUDIENCE);
            Assert(result.ok, `a freshly-minted valid assertion must verify (errorCode: ${result.errorCode ?? 'none'})`);
            Assert(result.userInfo != null, 'a verified assertion must carry userInfo');
            AssertEqual(result.userInfo!.email, 'it-host-visitor@integration.test', 'mapped email');
            AssertEqual(result.userInfo!.firstName, 'Grace', 'mapped firstName');
            AssertEqual(result.userInfo!.lastName, 'Hopper', 'mapped lastName');
            AssertEqual(result.userInfo!.fullName, 'Grace Hopper', 'mapped fullName');
            AssertEqual(result.userInfo!.preferredUsername, 'it-host-visitor@integration.test', 'preferredUsername = email');
            AssertEqual(result.hostUserId, 'host-user-42', `hostUserId must be the assertion's sub`);
            console.log(`      → minted RS256 assertion verified in-process; identity mapped, hostUserId=sub`);
        }
    },
    {
        Id: 'auth-validation.AV6',
        Name: 'AV6: the rejection matrix — signature, audience, expiry, max-age ceiling, explicit-exp and email guards all enforce',
        Fn: async (_ctx: IntegrationCheckContext) => {
            const f = fx();
            const nowSec = Math.floor(Date.now() / 1000);
            const verify = (assertion: string | undefined, pem: string | undefined = f.PublicPem): HostAssertionVerifyResult =>
                f.HostProvider.VerifyHostAssertion(assertion, pem, WIDGET_AUDIENCE);

            // Positive control FIRST (anti-vacuity): the base claims verify before we deviate.
            Assert(verify(mintAssertion(f.PrivatePem, goodClaims(nowSec))).ok,
                'the control assertion must verify — otherwise every rejection below is vacuous');

            assertRejected(verify(undefined), 'missing', 'absent assertion');
            assertRejected(f.HostProvider.VerifyHostAssertion(mintAssertion(f.PrivatePem, goodClaims(nowSec)), undefined, WIDGET_AUDIENCE),
                'no_key', 'absent host public key');

            // Signature provenance: signed by a DIFFERENT keypair → refused even though the
            // claims are pristine (the key/assertion-independence invariant).
            assertRejected(verify(mintAssertion(f.OtherPrivatePem, goodClaims(nowSec))), 'bad_signature', 'wrong signing key');

            // Payload integrity: flip the payload after signing → refused.
            const good = mintAssertion(f.PrivatePem, goodClaims(nowSec));
            const parts = good.split('.');
            const tamperedPayload = Buffer.from(JSON.stringify({ ...goodClaims(nowSec), email: 'attacker@evil.test' })).toString('base64url');
            assertRejected(verify(`${parts[0]}.${tamperedPayload}.${parts[2]}`), 'bad_signature', 'tampered payload');

            // Audience binding: right key, wrong widget.
            assertRejected(verify(mintAssertion(f.PrivatePem, { ...goodClaims(nowSec), aud: 'some-other-widget' })),
                'bad_signature', 'wrong audience');

            // Expiry: the host-declared exp has passed.
            assertRejected(verify(mintAssertion(f.PrivatePem, { ...goodClaims(nowSec - 600), exp: nowSec - 60 })),
                'expired', 'expired exp');

            // The 10-minute max-age CEILING: iat 700s ago while the host-chosen exp is still
            // in the future — MJ refuses to trust a host's long-lived assertion.
            assertRejected(verify(mintAssertion(f.PrivatePem, { ...goodClaims(nowSec - 700), exp: nowSec + 300 })),
                'expired', 'iat older than the max-age ceiling');

            // The explicit-exp guard: NO exp at all, inside the max-age window — jwt.verify
            // passes, the post-verify guard still refuses the unbounded assertion.
            const expless = { ...goodClaims(nowSec) } as Record<string, unknown>;
            delete expless['exp'];
            assertRejected(verify(mintAssertion(f.PrivatePem, expless)), 'expired', 'exp-less assertion');

            // Identity floor: a cryptographically-valid assertion without an email is useless.
            const emailless = { ...goodClaims(nowSec) } as Record<string, unknown>;
            delete emailless['email'];
            assertRejected(verify(mintAssertion(f.PrivatePem, emailless)), 'no_email', 'email-less assertion');

            console.log(`      → 9 rejection legs enforced (missing/no_key/bad_signature×3/expired×3/no_email), zero identity leaks`);
        }
    },
    {
        Id: 'auth-validation.AV7',
        Name: 'AV7: claim-mapping parity — OIDC claims, full-name splitting fallback, and alternate host claim names',
        Fn: async (_ctx: IntegrationCheckContext) => {
            const magic = AuthProviderFactory.createProvider(
                makeConfig('magic-link', 'mj-it-av7-ml', 'https://av7-ml.integration.test', 'aud')) as MagicLinkProvider;
            Assert(magic instanceof MagicLinkProvider, 'AV7 premise: magic-link dispatch');

            // Full OIDC claims map 1:1.
            const full = magic.extractUserInfo({
                email: 'ml@integration.test', given_name: 'Ada', family_name: 'Lovelace', name: 'Ada Lovelace'
            });
            AssertEqual(full.email, 'ml@integration.test', 'magic-link email');
            AssertEqual(full.firstName, 'Ada', 'magic-link firstName');
            AssertEqual(full.lastName, 'Lovelace', 'magic-link lastName');
            AssertEqual(full.preferredUsername, 'ml@integration.test', 'magic-link preferredUsername = email');

            // Name-only fallback: given/family absent → split from `name` (multi-part surname kept).
            const nameOnly = magic.extractUserInfo({ email: 'ml2@integration.test', name: 'Charles Antony Richard Hoare' });
            AssertEqual(nameOnly.firstName, 'Charles', 'name-splitting firstName');
            AssertEqual(nameOnly.lastName, 'Antony Richard Hoare', 'name-splitting keeps the full remainder as lastName');
            AssertEqual(nameOnly.fullName, 'Charles Antony Richard Hoare', 'fullName passthrough');

            // Host-identity accepts the alternate firstName/lastName claim names hosts send.
            const host = fx().HostProvider.extractUserInfo({
                email: 'hi@integration.test', firstName: 'Radia', lastName: 'Perlman'
            });
            AssertEqual(host.firstName, 'Radia', 'host-identity alternate firstName claim');
            AssertEqual(host.lastName, 'Perlman', 'host-identity alternate lastName claim');
            AssertEqual(host.fullName, 'Radia Perlman', 'host-identity fullName composed from the parts');

            // No email → undefined (never a fabricated identity).
            const anonymous = fx().HostProvider.extractUserInfo({ given_name: 'No', family_name: 'Email' });
            AssertEqual(anonymous.email, undefined, 'missing email must stay undefined');
            console.log(`      → OIDC mapping, name-splitting fallback, and alternate host claims all map as shipped`);
        }
    }
];

for (const check of AuthValidationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('auth-validation', {
    Setup: async (_ctx: IntegrationCheckContext) => {
        // Snapshot whatever the process already registered so Teardown can restore it — in
        // the mj-test CLI process this is empty (MJServer's initializeAuthProviders never
        // runs here), but the bundle must not assume that forever.
        const prior = AuthProviderFactory.Instance.getAllProviders();
        const { publicPem, privatePem } = generatePemKeyPair();
        const other = generatePemKeyPair();
        const hostProvider = AuthProviderFactory.createProvider(
            makeConfig('host-identity', 'mj-it-host-identity', 'https://av-host.integration.test', WIDGET_AUDIENCE));
        Assert(hostProvider instanceof HostIdentityProvider,
            `Setup premise: 'host-identity' must dispatch to HostIdentityProvider (got ${hostProvider.constructor.name})`);
        fixture = {
            PriorProviders: prior,
            PublicPem: publicPem,
            PrivatePem: privatePem,
            OtherPublicPem: other.publicPem,
            OtherPrivatePem: other.privatePem,
            HostProvider: hostProvider as HostIdentityProvider
        };
        // Sanity: the ClassFactory roster must exist before AV1 asserts on it (import chain).
        Assert(MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseAuthProvider).length > 0,
            'no BaseAuthProvider registrations found — the @memberjunction/auth-providers import chain is broken');
    },
    Teardown: async (_ctx: IntegrationCheckContext) => {
        // Restore the factory exactly as found: clear our fixtures, re-register the snapshot.
        const prior = fixture?.PriorProviders ?? [];
        const factory = AuthProviderFactory.Instance;
        try {
            factory.clear();
            for (const provider of prior) {
                try { factory.register(provider); } catch { /* best effort — never throw in teardown */ }
            }
        } catch { /* best effort */ }
        fixture = undefined;
    }
});

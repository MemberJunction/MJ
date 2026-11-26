import { InjectionToken } from '@angular/core';
import type { UserInfo } from '@memberjunction/core';

/** Canonical `MJ: Authorizations` name required for Read-Only (`ViewAs`) user impersonation. */
export const MJ_USER_IMPERSONATION_AUTHORIZATION_NAME = 'User Impersonation';

/** Canonical child `MJ: Authorizations` name required for optional write-enabled (`ActAs`) impersonation. */
export const MJ_USER_IMPERSONATION_WRITE_AUTHORIZATION_NAME =
    'User Impersonation: Act As (Allow Writes)';

/** Impersonation mode: `'ViewAs'` (server-enforced Read-Only default) or `'ActAs'` (dual-gated writes). */
export type MJImpersonationMode = 'ViewAs' | 'ActAs';

/** Semantic badge tones rendered on app-enriched candidates and quick presets. */
export type MJImpersonationBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

/** Optional visual badge attached to a candidate by an app adapter. */
export interface MJImpersonationBadge {
    readonly label: string;
    readonly tone?: MJImpersonationBadgeTone;
    readonly icon?: string;
}

/** Category filter pill contributed by an app adapter. */
export interface MJImpersonationCategory {
    readonly key: string;
    readonly label: string;
    readonly icon?: string;
}

/** A user selectable in the generic "View As User..." impersonation dialog. */
export interface MJImpersonationCandidate {
    readonly userId: string;
    readonly name: string;
    readonly firstName: string | null;
    readonly lastName: string | null;
    readonly email: string;
    readonly title: string | null;
    readonly type: string | null;
    readonly roleNames: readonly string[];
    /** Optional organization or tenant label supplied by an app adapter. */
    readonly organization?: string | null;
    /** Optional category key matching an adapter's {@link MJImpersonationCategory.key}. */
    readonly categoryKey?: string | null;
    /** Optional secondary description line supplied by an app adapter. */
    readonly subtitle?: string | null;
    /** Optional badges supplied by an app adapter. */
    readonly badges?: readonly MJImpersonationBadge[];
    /** When true, the candidate is omitted from the dialog list. */
    readonly hidden?: boolean;
    /** Optional opaque bag for app-specific adapter state. */
    readonly metadata?: Readonly<Record<string, unknown>>;
}

/** One-click preset card contributed by an app adapter. */
export interface MJImpersonationQuickPreset {
    readonly key: string;
    readonly label: string;
    readonly description?: string;
    readonly icon?: string;
    readonly badgeTone?: MJImpersonationBadgeTone;
    readonly resolveCandidate: (
        users: readonly MJImpersonationCandidate[]
    ) => MJImpersonationCandidate | undefined;
}

/**
 * First-class extension hook allowing any MemberJunction application to customize
 * the generic Explorer "View As User..." dialog and post-switch behavior.
 */
export interface MJImpersonationAppAdapter {
    /** Unique identifier for this adapter (used for replacement/unregistration). */
    readonly id: string;
    /**
     * Optional list of application paths or names (case-insensitive) where this adapter applies.
     * Omit or pass empty to apply globally across all applications.
     */
    readonly appPaths?: readonly string[];
    /** Priority when multiple adapters match (higher wins for title/subtitle; default 0). */
    readonly priority?: number;
    /** Optional custom dialog title when this adapter is active. */
    readonly title?: string;
    /** Optional custom dialog subtitle when this adapter is active. */
    readonly subtitle?: string;
    /** Optional quick-switch presets rendered above the searchable user list. */
    readonly quickPresets?: readonly MJImpersonationQuickPreset[];
    /** Optional category filter pills rendered below the search input. */
    readonly categories?: readonly MJImpersonationCategory[];
    /** Optional enrichment hook to attach organization, categoryKey, badges, or hidden flags. */
    readonly enrichCandidates?: (
        users: readonly MJImpersonationCandidate[]
    ) => Promise<readonly MJImpersonationCandidate[]> | readonly MJImpersonationCandidate[];
    /** Optional hook called after switching to a user (`activeTarget`) or exiting (`null`). */
    readonly afterSwitch?: (
        activeTarget: MJImpersonationCandidate | null
    ) => Promise<void> | void;
}

/** Identity of the real underlying authenticated user who initiated impersonation. */
export interface MJImpersonationActorIdentity {
    readonly id: string;
    readonly name: string;
    readonly email: string;
}

/** Observable state emitted by {@link MJUserImpersonationService}. */
export interface MJImpersonationState {
    readonly canImpersonate: boolean;
    readonly canImpersonateWithWrites: boolean;
    readonly activeTarget: MJImpersonationCandidate | null;
    readonly mode: MJImpersonationMode;
    readonly readOnly: boolean;
    readonly apiKeyId: string | null;
    readonly expiresAt: string | null;
    readonly defaultTtlMinutes: number;
    readonly maxTtlMinutes: number;
    readonly switching: boolean;
    readonly errorMessage: string | null;
    readonly actorIdentity: MJImpersonationActorIdentity | null;
}

/** Result returned by `StartImpersonation` and `ExitImpersonation`. */
export interface MJImpersonationActionResult {
    readonly success: boolean;
    readonly message: string;
}

/** Minimal provider contract used by {@link MJUserImpersonationService}. */
export interface MJImpersonationProviderLike {
    readonly CurrentUser?: UserInfo | null;
    readonly ConfigData?: {
        readonly Token?: string;
        readonly URL?: string;
        readonly WSURL?: string;
        readonly MJCoreSchemaName?: string;
        readonly IncludeSchemas?: string[];
        readonly ExcludeSchemas?: string[];
        readonly MJAPIURL?: string;
    };
    ExecuteGQL(query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>>;
    Dispose?: () => Promise<void> | void;
}

/** Transport adapter abstraction enabling clean unit testing without network calls. */
export interface MJImpersonationTransportAdapter {
    getActiveProvider(): MJImpersonationProviderLike | null;
    installProvider(provider: MJImpersonationProviderLike): void;
    createImpersonatedProvider(params: {
        readonly graphqlUrl: string;
        readonly wsUrl: string;
        readonly rawApiKey: string;
        readonly mjCoreSchemaName?: string;
        readonly includeSchemas?: string[];
        readonly excludeSchemas?: string[];
        readonly mjApiUrl?: string;
    }): Promise<MJImpersonationProviderLike>;
    syncProviderReferences(provider: MJImpersonationProviderLike): Promise<void>;
    resetWorkspaceAfterSwitch?(): Promise<void>;
}

/** Optional DI token to override the default GraphQL transport adapter in tests or custom hosts. */
export const MJ_USER_IMPERSONATION_TRANSPORT = new InjectionToken<MJImpersonationTransportAdapter>(
    'MJ_USER_IMPERSONATION_TRANSPORT'
);

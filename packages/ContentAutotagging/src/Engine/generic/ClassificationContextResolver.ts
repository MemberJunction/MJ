import { UserInfo, IMetadataProvider, LogError, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    ApplicationSettingEngine,
    MJContentSourceEntity_IContentSourceConfiguration,
    MJContentTypeEntity,
} from '@memberjunction/core-entities';

/**
 * Application name used to resolve the Knowledge Hub Application ID for
 * org-level classification-context settings.
 */
export const KNOWLEDGE_HUB_APPLICATION_NAME = 'Knowledge Hub';

/**
 * ApplicationSetting key under which the org-level classification context lives.
 * Resolved app-scoped (Knowledge Hub Application) first, then GLOBAL fallback —
 * a behavior provided by {@link ApplicationSettingEngine.GetSetting}.
 */
export const CLASSIFY_ORG_CONTEXT_SETTING_KEY = 'classify.org.context';

/**
 * How the effective classification context is composed from the three scopes.
 * - `additive`  (default) — concatenate every non-empty scope, org → type → source.
 * - `substitutive` — the most-specific non-empty scope wins (source → type → org).
 */
export type ClassificationContextMode = 'additive' | 'substitutive';

/**
 * Source-level classification-context extension to the CodeGen-generated
 * {@link MJContentSourceEntity_IContentSourceConfiguration} interface.
 *
 * These two keys are NOT yet part of the generated JSON-type interface (a
 * migration + CodeGen pass is required to add them there). We model them here as
 * a typed extension so callers stay strongly-typed without touching generated
 * code. The values are read defensively from the parsed Configuration JSON.
 */
export interface IContentSourceClassificationConfiguration
    extends MJContentSourceEntity_IContentSourceConfiguration {
    /** Free-text guidance injected into the autotagging prompt at the SOURCE scope. */
    ClassificationContext?: string;
    /** How this source's context combines with the org/type scopes. Defaults to 'additive'. */
    ClassificationContextMode?: ClassificationContextMode;
}

/**
 * Shape of the per-ContentType `Configuration` JSON we care about. The
 * ContentType config is parsed defensively (no generated-interface edit) for a
 * single `ClassificationContext` key.
 */
interface IContentTypeClassificationConfiguration {
    /** Free-text guidance injected into the autotagging prompt at the CONTENT-TYPE scope. */
    ClassificationContext?: string;
}

/**
 * Resolves the EFFECTIVE classification-context string injected into the
 * autotagging prompt. Context can be specified at three scopes:
 *
 *   1. ORG          — `ApplicationSetting('classify.org.context')` scoped to the
 *                      Knowledge Hub Application (GLOBAL fallback applies).
 *   2. CONTENT-TYPE — `ContentType.Configuration` JSON `ClassificationContext`.
 *   3. SOURCE       — `ContentSource.Configuration` JSON `ClassificationContext`.
 *
 * The combine mode comes from the SOURCE config's `ClassificationContextMode`
 * (default `additive`).
 */
export class ClassificationContextResolver {
    /** Cached Knowledge Hub Application ID, resolved once per process. */
    private static _khApplicationID: string | null | undefined = undefined;

    /**
     * Assemble the effective classification context for one content item.
     *
     * @param sourceConfig   The parsed ContentSource configuration (may be null).
     * @param contentTypeID  The content item's ContentTypeID, used to resolve the type-level context.
     * @param contentTypes   The cached ContentType entities (from AutotagBaseEngine).
     * @param contextUser    User context for server-side metadata/engine access.
     * @param provider       Optional metadata provider override.
     * @returns The effective context string, or `undefined` when no scope supplies one.
     */
    public static async ResolveEffectiveContext(
        sourceConfig: IContentSourceClassificationConfiguration | null,
        contentTypeID: string,
        contentTypes: MJContentTypeEntity[],
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<string | undefined> {
        const orgContext = await this.resolveOrgContext(contextUser, provider);
        const typeContext = this.resolveTypeContext(contentTypeID, contentTypes);
        const sourceContext = this.cleanContext(sourceConfig?.ClassificationContext);
        const mode: ClassificationContextMode =
            sourceConfig?.ClassificationContextMode === 'substitutive' ? 'substitutive' : 'additive';

        if (mode === 'substitutive') {
            return this.combineSubstitutive(orgContext, typeContext, sourceContext);
        }
        return this.combineAdditive(orgContext, typeContext, sourceContext);
    }

    /**
     * Read the org-level classification context from ApplicationSettingEngine,
     * scoped to the Knowledge Hub Application (with GLOBAL fallback handled by the engine).
     */
    private static async resolveOrgContext(
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<string | undefined> {
        try {
            await ApplicationSettingEngine.Instance.Config(false, contextUser, provider);
            const appID = await this.resolveKnowledgeHubApplicationID(contextUser);
            const raw = ApplicationSettingEngine.Instance.GetSetting(
                CLASSIFY_ORG_CONTEXT_SETTING_KEY,
                appID ?? undefined,
            );
            return this.cleanContext(raw);
        } catch (e) {
            LogError(`ClassificationContextResolver: failed to read org context: ${e instanceof Error ? e.message : String(e)}`);
            return undefined;
        }
    }

    /** Parse the ContentType's Configuration JSON defensively for a ClassificationContext key. */
    private static resolveTypeContext(
        contentTypeID: string,
        contentTypes: MJContentTypeEntity[],
    ): string | undefined {
        if (!contentTypeID) {
            return undefined;
        }
        const contentType = contentTypes.find(ct => UUIDsEqual(ct.ID, contentTypeID));
        if (!contentType?.Configuration) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(contentType.Configuration) as IContentTypeClassificationConfiguration;
            return this.cleanContext(parsed?.ClassificationContext);
        } catch {
            // Malformed JSON — treat as no type-level context rather than failing the run.
            return undefined;
        }
    }

    /**
     * Resolve (and cache) the Knowledge Hub Application ID by name. Returns null
     * when no such application exists — the org setting then falls back to GLOBAL.
     */
    private static async resolveKnowledgeHubApplicationID(
        contextUser?: UserInfo,
    ): Promise<string | null> {
        if (this._khApplicationID !== undefined) {
            return this._khApplicationID;
        }

        const rv = new RunView();
        const result = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Applications',
                ExtraFilter: `Name = '${KNOWLEDGE_HUB_APPLICATION_NAME.replace(/'/g, "''")}'`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            contextUser,
        );

        this._khApplicationID = result.Success && result.Results.length > 0 ? result.Results[0].ID : null;
        return this._khApplicationID;
    }

    /** Concatenate every non-empty scope in org → type → source order with labels. */
    private static combineAdditive(
        org: string | undefined,
        type: string | undefined,
        source: string | undefined,
    ): string | undefined {
        const parts: string[] = [];
        if (org) parts.push(`Organization context:\n${org}`);
        if (type) parts.push(`Content-type context:\n${type}`);
        if (source) parts.push(`Source context:\n${source}`);
        return parts.length > 0 ? parts.join('\n\n') : undefined;
    }

    /** Most-specific non-empty scope wins: source → type → org. */
    private static combineSubstitutive(
        org: string | undefined,
        type: string | undefined,
        source: string | undefined,
    ): string | undefined {
        return source ?? type ?? org ?? undefined;
    }

    /** Normalize a raw context value: trim and treat empty strings as undefined. */
    private static cleanContext(value: string | null | undefined): string | undefined {
        if (value == null) {
            return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
}

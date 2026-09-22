// packages/Angular/Generic/base-forms/src/lib/panel-slot/collect-form-contribution-registrations.ts
import { LogError, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import { InteractiveFormsEngine, type MJEntityFormContributionEntity } from '@memberjunction/core-entities';
import { MJGlobal, SafeJSONParse } from '@memberjunction/global';
import { BaseFormPanel, type FormPanelRegistrationMetadata, type FormPanelSlot } from './base-form-panel';
import type { FormContributionRegistration } from './form-contribution';

/**
 * One list of form contributions from two sources:
 *   - compiled `BaseFormPanel` registrations in the ClassFactory (`Source: 'class'`)
 *   - Active, scope-matching `MJ: Entity Form Contributions` rows (`Source: 'metadata'`)
 *
 * Memoized per (provider, entity, user). The memo key also folds in the ClassFactory
 * registration count (lazy-loaded OpenApp modules register late) and an engine
 * version that bumps on every `Contributions$` emission. The whole-form host
 * awaits the resolver — which Configs the engine — before the form mounts, so
 * slots normally see rows on first render; when the engine is cold this kicks a
 * `Config` and returns class registrations, and the emission re-fills the memo.
 */

const MAX_CACHE_ENTRIES = 16;
const cache = new Map<string, FormContributionRegistration[]>();
let engineVersion = 0;
let engineSubscribed = false;

function ensureEngineSubscription(): void {
    if (engineSubscribed) return;
    engineSubscribed = true;
    try {
        InteractiveFormsEngine.Instance.Contributions$.subscribe(() => {
            engineVersion++;
            cache.clear();
        });
    } catch (err) {
        engineSubscribed = false;
        LogError(`CollectFormContributionRegistrations: could not subscribe to Contributions$: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/**
 * Registration count, probed at most once per interval.
 *
 * The count is the memo's invalidation signal for lazily-registered panels, but
 * `GetAllRegistrations` filters every registration in the process (~2,000 in Explorer) and
 * allocates an array. This function sits on the hottest path in the form runtime —
 * `BaseFormComponent.formContext` is a getter bound in dozens of places per form and
 * re-evaluated on every change-detection pass — so probing per call is not affordable.
 * A lazily-loaded module's panels therefore appear within one interval rather than instantly,
 * which is the right trade: module loads are rare, change detection is not.
 */
const CLASS_COUNT_PROBE_INTERVAL_MS = 1000;
let lastClassCount = -1;
let lastClassCountAt = 0;

function currentClassCount(): number {
    const now = Date.now();
    if (lastClassCount < 0 || now - lastClassCountAt >= CLASS_COUNT_PROBE_INTERVAL_MS) {
        lastClassCount = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel).length;
        lastClassCountAt = now;
    }
    return lastClassCount;
}

/** Test seam and escape hatch — drops every memoized list. */
export function InvalidateFormContributionRegistrationCache(): void {
    cache.clear();
    lastClassCount = -1;
    lastClassCountAt = 0;
    providerKeys = new WeakMap<IMetadataProvider, string>();
    nextProviderKey = 0;
}

/**
 * Stable per-instance identity for a provider, without assuming it exposes a name
 * or an ID. A WeakMap keeps this from pinning providers in memory.
 */
let providerKeys = new WeakMap<IMetadataProvider, string>();
let nextProviderKey = 0;
function ProviderCacheKey(provider: IMetadataProvider): string {
    let k = providerKeys.get(provider);
    if (!k) {
        k = `p${++nextProviderKey}`;
        providerKeys.set(provider, k);
    }
    return k;
}

/** Compiled `BaseFormPanel` registrations that declare an `entity`. */
export function CollectClassFormPanelRegistrations(): FormContributionRegistration[] {
    return MJGlobal.Instance.ClassFactory.GetAllRegistrationsByMetadata(
        BaseFormPanel,
        (metadata) => {
            if (!metadata) return false;
            const entity = (metadata as Partial<FormPanelRegistrationMetadata>).entity;
            return typeof entity === 'string' && entity.length > 0;
        },
    ).map((reg) => ({
        Priority: reg.Priority,
        Metadata: reg.Metadata as FormPanelRegistrationMetadata,
        Source: 'class' as const,
        Registration: reg,
    }));
}

/** Project one `MJ: Entity Form Contributions` row onto the compiled metadata shape. */
export function MetadataContributionToRegistration(row: MJEntityFormContributionEntity): FormContributionRegistration {
    const metadata: FormPanelRegistrationMetadata = {
        entity: row.Entity,
        slot: row.Slot as FormPanelSlot,
        sortKey: row.SortKey ?? 0,
        presentation: row.Presentation,
    };
    if (row.ContributionKey) metadata.contributionKey = row.ContributionKey;
    if (row.RelatedEntity) metadata.relatedEntity = row.RelatedEntity;
    if (row.RelatedJoinField) metadata.relatedJoinField = row.RelatedJoinField;
    if (row.ReplacesSectionKey) metadata.replacesSectionKey = row.ReplacesSectionKey;
    if (row.ReplacesFieldName) metadata.replacesFieldName = row.ReplacesFieldName;
    if (row.Inclusion) metadata.inclusion = row.Inclusion;
    if (row.ChromeGroup) metadata.chromeGroup = row.ChromeGroup;
    return {
        Priority: row.Precedence ?? 0,
        Metadata: metadata,
        Source: 'metadata',
        ComponentID: row.ComponentID,
        RowID: row.ID,
        Title: row.Title ?? row.Name,
        Icon: row.Icon ?? undefined,
        Presentation: row.Presentation,
        Configuration: SafeJSONParse<Record<string, unknown>>(row.Configuration ?? '', false) ?? {},
    };
}

/**
 * Class registrations plus the rows that apply to (entity, current user).
 * Falls back to class-only when there is no entity or provider (standalone
 * panel composition outside a form).
 */
export function CollectFormContributionRegistrations(
    entity: EntityInfo | null | undefined,
    provider: IMetadataProvider | null | undefined,
): FormContributionRegistration[] {
    if (!entity || !provider) return CollectClassFormPanelRegistrations();

    ensureEngineSubscription();
    const user = provider.CurrentUser;
    const userID = user?.ID ?? '';
    const roleIDs = (user?.UserRoles ?? []).map((r) => r.RoleID).filter((id): id is string => !!id);
    const classCount = currentClassCount();
    // The provider is part of the identity: MJ supports per-provider Metadata scoping
    // (.claude/rules/data-access.md), so the same entity name and user can resolve to
    // different rows under two providers. Without it, the second provider reads the
    // first one's memoized list.
    const key = `${ProviderCacheKey(provider)}::${entity.Name}::${userID}::${classCount}::${engineVersion}`;
    const hit = cache.get(key);
    if (hit) return hit;

    // Only past the cache: `GetAllRegistrationsByMetadata` filters every registration in the
    // process and runs a predicate on each. `BaseFormComponent.formContext` calls this getter
    // on every change-detection pass, so paying that scan per pass is precisely the cost this
    // memo exists to remove — it has to sit behind the cache, not in front of it.
    const classRegs = CollectClassFormPanelRegistrations();

    let rows: MJEntityFormContributionEntity[] = [];
    try {
        const engine = InteractiveFormsEngine.Instance;
        if (engine.IsPermissionConstrained) {
            // Expected on deployments where this role has no read on the new entity.
            // Not an error — the idiom used by FormResolverService and ApplicationManager.
            rows = [];
        } else if (engine.Loaded) {
            rows = engine.GetApplicableContributions(entity.ID, userID, roleIDs);
        } else {
            // Kick the load; the Contributions$ subscription above refills the memo when it
            // lands. `.catch` is load-bearing: a rejected Config here would otherwise surface
            // as an unhandled rejection on every entity whose form is opened.
            void engine.Config(false, user ?? undefined, provider).catch((err: unknown) => {
                LogError(`CollectFormContributionRegistrations: engine Config failed: ${err instanceof Error ? err.message : String(err)}`);
            });
        }
    } catch (err) {
        LogError(`CollectFormContributionRegistrations: engine read failed for ${entity.Name}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const merged = [...classRegs, ...rows.map(MetadataContributionToRegistration)];
    if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, merged);
    return merged;
}

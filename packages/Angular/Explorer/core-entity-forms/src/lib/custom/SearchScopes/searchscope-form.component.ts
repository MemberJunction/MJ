/**
 * Custom SearchScope form (P2D.7 Angular half).
 *
 * Adds a "Reranker" custom section that:
 *   - Renders a dropdown of registered rerankers — currently a hardcoded list
 *     mirroring `BaseReRanker.GetAvailableRerankers()` server-side, with each
 *     option's HasCost flag surfaced inline so authors can see at a glance
 *     which options will incur API spend.
 *   - Reads / writes the current selection from `record.ScopeConfig` JSON's
 *     `reRanker.driverClass` key — same path the SearchEngine reads at runtime.
 *
 * **Discovery follow-up:** the canonical source of available rerankers is
 * `BaseReRanker.GetAvailableRerankers()` in `@memberjunction/search-engine`,
 * but that's a Node-only package and can't be imported in the browser.
 * A small GraphQL query (e.g. `AvailableRerankers`) on MJServer that calls
 * the helper server-side would let this dropdown auto-discover any
 * third-party reranker registered with ClassFactory. Tracked as a follow-up
 * — for now the hardcoded list covers the 5 rerankers shipped in Phase 2D.
 *
 * The CodeGen-generated `RerankerBudgetCents` numeric input is already on
 * the form (in the "Details" section); we don't need to recreate it.
 * The dropdown above + budget input below give scope authors the full
 * Phase 2D configuration surface.
 */
import { Component } from '@angular/core';
import { MJSearchScopeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJSearchScopeFormComponent } from '../../generated/Entities/MJSearchScope/mjsearchscope.form.component';

interface RerankerOption {
    DriverClass: string;
    Name: string;
    HasCost: boolean;
}

/**
 * Hardcoded list mirroring the rerankers `@memberjunction/search-engine`
 * registers with ClassFactory. Update when adding a new built-in reranker
 * or when the GraphQL discovery query lands.
 */
const BUILT_IN_RERANKERS: RerankerOption[] = [
    { DriverClass: 'NoopReRanker', Name: 'NoopReRanker (pass-through)', HasCost: false },
    { DriverClass: 'CohereReRanker', Name: 'Cohere (rerank-v3.5)', HasCost: true },
    { DriverClass: 'VoyageReRanker', Name: 'Voyage (rerank-2)', HasCost: true },
    { DriverClass: 'OpenAIReRanker', Name: 'OpenAI (gpt-4o-mini judge)', HasCost: true },
    { DriverClass: 'BGEReRanker', Name: 'BGE (local, free)', HasCost: false },
];

@RegisterClass(BaseFormComponent, 'MJ: Search Scopes')
@Component({
    standalone: false,
    selector: 'mj-searchscope-form-extended',
    templateUrl: './searchscope-form.component.html',
    styleUrls: ['./searchscope-form.component.css'],
})
export class MJSearchScopeFormComponentExtended extends MJSearchScopeFormComponent {
    public override record!: MJSearchScopeEntity;

    public readonly AvailableRerankers: RerankerOption[] = BUILT_IN_RERANKERS;

    /**
     * Override the section list to include the new "Reranker" section before
     * "Details". The generated `initSections()` doesn't know about our custom
     * section so we replace the list. Order matches the template's render order.
     */
    public override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scopeDefinition', sectionName: 'Scope Definition', isExpanded: true },
            { sectionKey: 'scopeConfiguration', sectionName: 'Scope Configuration', isExpanded: true },
            { sectionKey: 'accessControl', sectionName: 'Access Control', isExpanded: false },
            { sectionKey: 'lifecycleManagement', sectionName: 'Lifecycle Management', isExpanded: false },
            { sectionKey: 'technicalConfiguration', sectionName: 'Technical Configuration', isExpanded: false },
            { sectionKey: 'reranker', sectionName: 'Reranker', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJSearchScopeStorageAccounts', sectionName: 'Search Scope Storage Accounts', isExpanded: false },
            { sectionKey: 'mJSearchScopeEntities', sectionName: 'Search Scope Entities', isExpanded: false },
            { sectionKey: 'mJSearchScopeExternalIndexes', sectionName: 'Search Scope External Indexes', isExpanded: false },
            { sectionKey: 'mJSearchScopeProviders', sectionName: 'Search Scope Providers', isExpanded: false },
            { sectionKey: 'mJAIAgentSearchScopes', sectionName: 'AI Agent Search Scopes', isExpanded: false },
            { sectionKey: 'mJSearchScopePermissions', sectionName: 'Search Scope Permissions', isExpanded: false },
        ]);
    }

    /**
     * Currently-selected reranker driver class, parsed from `record.ScopeConfig`.
     * Empty string means "no reranker explicitly chosen" — runtime defaults
     * to NoopReRanker. Stored as `ScopeConfig.reRanker.driverClass`.
     */
    public get SelectedRerankerDriverClass(): string {
        const cfg = this.parseScopeConfig();
        return (cfg?.['reRanker'] as { driverClass?: string } | undefined)?.driverClass ?? '';
    }

    public set SelectedRerankerDriverClass(value: string) {
        const cfg = this.parseScopeConfig() ?? {};
        const reRanker = (cfg['reRanker'] as Record<string, unknown> | undefined) ?? {};
        if (value && value.trim().length > 0) {
            reRanker['driverClass'] = value;
        } else {
            delete reRanker['driverClass'];
        }
        cfg['reRanker'] = reRanker;
        this.record.ScopeConfig = JSON.stringify(cfg, null, 2);
    }

    /**
     * Whether the currently-selected reranker incurs API cost — used to render
     * an inline cost-warning indicator next to the dropdown.
     */
    public get SelectedRerankerHasCost(): boolean {
        const driver = this.SelectedRerankerDriverClass;
        return BUILT_IN_RERANKERS.find(r => r.DriverClass === driver)?.HasCost ?? false;
    }

    private parseScopeConfig(): Record<string, unknown> | null {
        if (!this.record?.ScopeConfig) return null;
        try {
            const parsed = JSON.parse(this.record.ScopeConfig);
            return (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : null;
        } catch {
            return null;
        }
    }
}

export function LoadMJSearchScopeFormComponentExtended(): void {
    // Tree-shake prevention; called from custom-forms.module's LoadCoreCustomForms()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = MJSearchScopeFormComponentExtended;
}

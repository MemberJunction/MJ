/**
 * Custom MJSearchScopeProvider form (P5.5).
 *
 * Plan acceptance criterion: provide a dropdown for `SearchProviderID` so
 * scope authors don't have to look up GUIDs by hand. The dropdown is sourced
 * from the `MJ: Search Providers` table (those rows are the canonical FK
 * targets), and each option is annotated with whether the provider's
 * `DriverClass` is currently registered with the runtime ClassFactory on
 * this MJServer build — so authors can see at a glance whether their pick
 * will actually be available at search time.
 *
 * The runtime registration list comes from the `AvailableSearchProviders`
 * GraphQL query backed by `BaseSearchProvider.GetAvailableProviders()`.
 * That query is the canonical "which providers does this server know
 * about" source — same helper Phase 5.5 of the RAG plan calls out.
 */
import { Component, OnInit } from '@angular/core';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { MJSearchScopeProviderEntity, MJSearchProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJSearchScopeProviderFormComponent } from '../../generated/Entities/MJSearchScopeProvider/mjsearchscopeprovider.form.component';

interface SearchProviderOption {
    ID: string;
    Name: string;
    DriverClass: string;
    Status: 'Active' | 'Pending' | 'Terminated';
    /**
     * `true` if `DriverClass` matches a class currently registered with the
     * runtime ClassFactory on this MJServer. `false` means the row exists in
     * `MJ: Search Providers` but no installed package registers that class —
     * picking it would result in `IsAvailable()=false` at search time.
     */
    IsRegisteredOnServer: boolean;
}

@RegisterClass(BaseFormComponent, 'MJ: Search Scope Providers')
@Component({
    standalone: false,
    selector: 'mj-searchscopeprovider-form-extended',
    templateUrl: './searchscopeprovider-form.component.html',
    styleUrls: ['./searchscopeprovider-form.component.css'],
})
export class MJSearchScopeProviderFormComponentExtended extends MJSearchScopeProviderFormComponent implements OnInit {
    public override record!: MJSearchScopeProviderEntity;

    public AvailableProviders: SearchProviderOption[] = [];
    public ProvidersLoaded = false;
    public LoadError: string | null = null;

    /**
     * Drives the dropdown's `[ngModel]`. Kept in sync with `record.SearchProviderID`
     * via the setter so dirty tracking and the form's save flow continue to work.
     */
    public get SelectedSearchProviderID(): string {
        return this.record?.SearchProviderID ?? '';
    }
    public set SelectedSearchProviderID(value: string) {
        if (!this.record) return;
        if (this.record.SearchProviderID === value) return;
        this.record.SearchProviderID = value;
    }

    public get SelectedProvider(): SearchProviderOption | null {
        const id = this.SelectedSearchProviderID;
        if (!id) return null;
        return this.AvailableProviders.find(p => p.ID.toLowerCase() === id.toLowerCase()) ?? null;
    }

    public get SelectedProviderUnregisteredOnServer(): boolean {
        const sel = this.SelectedProvider;
        return sel != null && !sel.IsRegisteredOnServer;
    }

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        await this.loadProviderCatalog();
    }

    /**
     * Pulls the `MJ: Search Providers` rows and the server-registered class list
     * in parallel, then merges into one dropdown source. Failures don't block the
     * form — the dropdown just disables itself, leaving the underlying generated
     * textbox accessible via `EditMode`.
     */
    private async loadProviderCatalog(): Promise<void> {
        try {
            const rv = new RunView();
            const [rowsResult, registeredKeys] = await Promise.all([
                rv.RunView<MJSearchProviderEntity>({
                    EntityName: 'MJ: Search Providers',
                    OrderBy: 'Name',
                    ResultType: 'simple',
                }),
                this.fetchRegisteredDriverClasses(),
            ]);

            if (!rowsResult.Success) {
                this.LoadError = rowsResult.ErrorMessage ?? 'Unknown error loading providers';
                LogError(`MJSearchScopeProviderFormExtended: RunView failed: ${this.LoadError}`);
                return;
            }

            const registeredSet = new Set(registeredKeys.map(k => k.toLowerCase()));
            const rows = rowsResult.Results ?? [];
            this.AvailableProviders = rows.map(row => ({
                ID: row.ID,
                Name: row.Name,
                DriverClass: row.DriverClass,
                Status: row.Status,
                IsRegisteredOnServer: registeredSet.has(row.DriverClass.toLowerCase()),
            }));
            this.ProvidersLoaded = true;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.LoadError = msg;
            LogError(`MJSearchScopeProviderFormExtended: catalog load threw: ${msg}`);
        }
    }

    /**
     * Calls the `AvailableSearchProviders` GraphQL query to learn which
     * `DriverClass` keys are actually registered with `MJGlobal.ClassFactory`
     * on the server. Returns `[]` on any failure — the dropdown still renders
     * from the DB rows; we just lose the "(not registered)" badge.
     */
    private async fetchRegisteredDriverClasses(): Promise<string[]> {
        try {
            const dataProvider = this.ProviderToUse as GraphQLDataProvider;
            const response = await dataProvider.ExecuteGQL(
                `query AvailableSearchProviders { AvailableSearchProviders { DriverClass SourceType } }`,
                {}
            ) as { AvailableSearchProviders?: Array<{ DriverClass: string }> };
            return (response?.AvailableSearchProviders ?? []).map(r => r.DriverClass);
        } catch (err) {
            // Older server build won't have the resolver. The dropdown still
            // works from DB rows; the registration badge just won't appear.
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`MJSearchScopeProviderFormExtended: AvailableSearchProviders query failed (badge disabled): ${msg}`);
            return [];
        }
    }
}

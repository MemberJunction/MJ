import { BaseEntity, EntitySaveOptions, LogError, Metadata, RunView, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJMLComponentEntity, MJMLCompositeMembershipEntity, MLComponentEngine } from '@memberjunction/core-entities';
import {
    validateCompositeSpec,
    type ComponentShape,
    type CompositeSpec,
    type PortAdapterDef,
    type PortTypeName,
} from '@memberjunction/predictive-studio-core';

/**
 * Server-side ML Component entity that:
 *   1. Validates `GraphSpec` via {@link validateCompositeSpec} in ValidateAsync —
 *      a Composite/Template row with an illegal graph (cycle, port mismatch with
 *      no declared adapter, unbound required input, slot under/overfill,
 *      non-terminal exposed output) can never be saved. The registry the
 *      validator consults is the LIVE seeded metadata via MLComponentEngine —
 *      legality is metadata-driven, never hardcoded (proven in Track B4a).
 *   2. Maintains the `MJ: ML Composite Memberships` projection rows on Save —
 *      the queryable composite→child lineage derived from GraphSpec (the
 *      GraphSpec JSON is authoritative; membership rows are its projection).
 */
@RegisterClass(BaseEntity, 'MJ: ML Components')
export class MJMLComponentEntityServer extends MJMLComponentEntity {

    /** Enable async validation so the GraphSpec legality check runs. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        // GraphSpec legality applies only to graph-carrying kinds with a spec set
        if ((this.Kind === 'Composite' || this.Kind === 'Template') && this.GraphSpec) {
            // fast-path: only re-validate when the spec (or kind) changed
            const graphDirty = this.GetFieldByName('GraphSpec')?.Dirty || this.GetFieldByName('Kind')?.Dirty || !this.IsSaved;
            if (graphDirty) {
                try {
                    const { components, adapters } = await this.loadRegistryShapes();
                    const parsed: unknown = JSON.parse(this.GraphSpec);
                    const verdict = validateCompositeSpec(parsed, components, adapters);
                    if (verdict.ok === false) {
                        result.Success = false;
                        result.Errors.push(new ValidationErrorInfo(
                            'GraphSpec',
                            `Illegal composite graph: ${verdict.error}`,
                            this.GraphSpec,
                            ValidationErrorType.Failure,
                        ));
                    }
                } catch (e) {
                    result.Success = false;
                    result.Errors.push(new ValidationErrorInfo(
                        'GraphSpec',
                        `GraphSpec is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
                        this.GraphSpec,
                        ValidationErrorType.Failure,
                    ));
                }
            }
        }
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const saved = await super.Save(options);
        if (!saved) {
            return false;
        }
        // sync the membership projection AFTER a successful persist only
        if (this.Kind === 'Composite' && this.GraphSpec) {
            try {
                await this.syncCompositeMemberships();
            } catch (e) {
                // projection maintenance must never roll back a successful save;
                // log loudly — the projection self-heals on the next save
                LogError(`MJMLComponentEntityServer: membership projection sync failed for '${this.Name}': ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        return true;
    }

    /** Map the LIVE registry (via the engine cache) into the validator's plain shapes. */
    private async loadRegistryShapes(): Promise<{ components: ComponentShape[]; adapters: PortAdapterDef[] }> {
        const engine = MLComponentEngine.Instance;
        await engine.Config(false, this.ContextCurrentUser);
        const typeName = new Map(engine.PortTypes.map((t) => [t.ID, t.Name as PortTypeName]));
        const components: ComponentShape[] = engine.Components.map((c) => ({
            Name: c.Name,
            Ports: engine.PortsForComponent(c.ID).map((p) => ({
                Name: p.Name,
                Direction: p.Direction as 'Input' | 'Output',
                PortType: typeName.get(p.PortTypeID) as PortTypeName,
                IsRequired: p.IsRequired,
            })),
            Slots: engine.SlotsForComponent(c.ID).map((s) => ({
                Name: s.Name,
                RequiredPortType: typeName.get(s.RequiredPortTypeID) as PortTypeName,
                MinCount: s.MinCount,
                MaxCount: s.MaxCount,
            })),
        }));
        const adapters: PortAdapterDef[] = engine.Adapters.map((a) => ({
            Name: a.Name,
            FromPortType: typeName.get(a.FromPortTypeID) as PortTypeName,
            ToPortType: typeName.get(a.ToPortTypeID) as PortTypeName,
            Strategy: a.Strategy,
            IsLossy: a.IsLossy,
        }));
        return { components, adapters };
    }

    /** Reconcile `MJ: ML Composite Memberships` rows to the current GraphSpec nodes. */
    private async syncCompositeMemberships(): Promise<void> {
        const spec = JSON.parse(this.GraphSpec as string) as CompositeSpec;
        const engine = MLComponentEngine.Instance;
        await engine.Config(false, this.ContextCurrentUser);
        const wantedChildIDs = new Set<string>();
        for (const node of spec.Nodes ?? []) {
            const child = engine.ComponentByName(node.Component);
            if (child && child.ID !== this.ID) {
                wantedChildIDs.add(child.ID);
            }
        }
        const rv = new RunView();
        const existing = await rv.RunView<MJMLCompositeMembershipEntity>({
            EntityName: 'MJ: ML Composite Memberships',
            ExtraFilter: `CompositeComponentID='${this.ID}'`,
            ResultType: 'entity_object',
        }, this.ContextCurrentUser);
        const rows = existing.Success ? existing.Results : [];
        // delete stale
        for (const row of rows) {
            if (!wantedChildIDs.has(row.ChildComponentID)) {
                const deleted = await row.Delete();
                if (!deleted) {
                    LogError(`membership delete failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
                }
            } else {
                wantedChildIDs.delete(row.ChildComponentID); // already present
            }
        }
        // insert missing
        const md = new Metadata();
        for (const childID of wantedChildIDs) {
            const row = await md.GetEntityObject<MJMLCompositeMembershipEntity>(
                'MJ: ML Composite Memberships', this.ContextCurrentUser);
            row.CompositeComponentID = this.ID;
            row.ChildComponentID = childID;
            const ok = await row.Save();
            if (!ok) {
                LogError(`membership insert failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }
        }
    }
}

/** Tree-shaking guard — ensures the @RegisterClass side effect survives bundling. */
export function LoadMJMLComponentEntityServer(): void {
    // intentional no-op
}

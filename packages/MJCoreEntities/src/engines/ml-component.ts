import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { Observable } from "rxjs";
import {
    MJMLComponentEntity,
    MJMLComponentPortEntity,
    MJMLComponentSlotEntity,
    MJMLPortAdapterEntity,
    MJMLPortTypeEntity,
} from "../generated/entity_subclasses";

/**
 * Reactive cache for the Model Component Framework registry — the typed component
 * catalog (`MJ: ML Components`), its ports/slots, the port vocabulary, and the
 * declared port adapters.
 *
 * These five tables are small, config-like reference data (a few hundred rows
 * total, no large blob columns), so — UNLIKE `MJ: Components` (see
 * {@link ComponentMetadataEngine}'s cautionary note) — they are safe to bulk-cache
 * with `CacheLocal`. Composition legality + affordances are COMPUTED from these
 * rows (never stored); the pure computation lives in
 * `@memberjunction/predictive-studio-core` (`validateCompositeSpec` /
 * `findCompatibleSlots`), fed by the plain-data shapes a consumer maps from the
 * getters here — keeping this package free of a PS-Core dependency.
 *
 * Follows the standard BaseEngine pattern: lazy `Config()`, permission-safe
 * `GetConfigData` getters, and paired `Foo$` observables that re-emit on any
 * save/delete/remote-invalidate of a cached entity.
 */
export class MLComponentEngine extends BaseEngine<MLComponentEngine> {
    /** The process-wide singleton. Never `new` this — always use `Instance`. */
    public static get Instance(): MLComponentEngine {
        return super.getInstance<MLComponentEngine>();
    }

    private _components: MJMLComponentEntity[];
    private _ports: MJMLComponentPortEntity[];
    private _slots: MJMLComponentSlotEntity[];
    private _adapters: MJMLPortAdapterEntity[];
    private _portTypes: MJMLPortTypeEntity[];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            { Type: 'entity', EntityName: 'MJ: ML Port Types', PropertyName: '_portTypes', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: ML Components', PropertyName: '_components', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: ML Component Ports', PropertyName: '_ports', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: ML Component Slots', PropertyName: '_slots', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: ML Port Adapters', PropertyName: '_adapters', CacheLocal: true },
        ];
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    // --- synchronous getters (permission-safe via GetConfigData) ---

    public get Components(): MJMLComponentEntity[] {
        return this.GetConfigData<MJMLComponentEntity>('_components');
    }
    public get Ports(): MJMLComponentPortEntity[] {
        return this.GetConfigData<MJMLComponentPortEntity>('_ports');
    }
    public get Slots(): MJMLComponentSlotEntity[] {
        return this.GetConfigData<MJMLComponentSlotEntity>('_slots');
    }
    public get Adapters(): MJMLPortAdapterEntity[] {
        return this.GetConfigData<MJMLPortAdapterEntity>('_adapters');
    }
    public get PortTypes(): MJMLPortTypeEntity[] {
        return this.GetConfigData<MJMLPortTypeEntity>('_portTypes');
    }

    // --- paired reactive observables (async pipe friendly) ---

    public get Components$(): Observable<MJMLComponentEntity[]> {
        return this.ObserveProperty<MJMLComponentEntity>('_components');
    }
    public get Ports$(): Observable<MJMLComponentPortEntity[]> {
        return this.ObserveProperty<MJMLComponentPortEntity>('_ports');
    }
    public get Adapters$(): Observable<MJMLPortAdapterEntity[]> {
        return this.ObserveProperty<MJMLPortAdapterEntity>('_adapters');
    }
    public get PortTypes$(): Observable<MJMLPortTypeEntity[]> {
        return this.ObserveProperty<MJMLPortTypeEntity>('_portTypes');
    }

    // --- convenience lookups over the cached arrays ---

    /** Case-insensitive component lookup by Name. */
    public ComponentByName(name: string): MJMLComponentEntity | undefined {
        const key = name.trim().toLowerCase();
        return this.Components.find((c) => c.Name.trim().toLowerCase() === key);
    }

    /** All declared ports for a component (Input + Output), by component ID. */
    public PortsForComponent(componentID: string): MJMLComponentPortEntity[] {
        return this.Ports.filter((p) => p.ComponentID === componentID);
    }

    /** Template slots for a component, by component ID. */
    public SlotsForComponent(componentID: string): MJMLComponentSlotEntity[] {
        return this.Slots.filter((s) => s.ComponentID === componentID);
    }

    /**
     * Active components filtered by Kind (e.g. only 'Model' or 'Template').
     * `'Active'`-status only by default — pass `includePlanned` to include
     * cataloged-but-not-yet-runnable rows.
     */
    public ComponentsByKind(kind: MJMLComponentEntity['Kind'], includePlanned = false): MJMLComponentEntity[] {
        return this.Components.filter(
            (c) => c.Kind === kind && (includePlanned || c.Status === 'Active'),
        );
    }

    /** Template components (those declaring at least one slot). */
    public Templates(): MJMLComponentEntity[] {
        const withSlots = new Set(this.Slots.map((s) => s.ComponentID));
        return this.Components.filter((c) => withSlots.has(c.ID));
    }
}

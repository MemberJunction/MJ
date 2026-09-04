import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RecordOpenedEvent, ViewRelatedRecordNavigation } from '@memberjunction/ng-entity-viewer';
import { CompositeKey } from '@memberjunction/core';

/**
 * MJ Academy — the nav pages that show an entity's grid.
 *
 * Everything else about this application is metadata: the app itself, the nav rail, which entities
 * belong to it, and the Occupancy query. A grid page is the one thing metadata alone cannot do --
 * ResourceType 'Queries' runs a Query, 'Records' renders a single record, 'User Views' needs a
 * saved view record with an owner and permissions, and a plain Route is not honoured. So MJ's
 * answer, and what all 81 nav items across all 26 shipped applications do, is ResourceType
 * 'Custom' plus a DriverClass naming a BaseResourceComponent.
 *
 * TWO THINGS THAT ARE EASY TO GET WRONG, both learned the hard way:
 *
 *  1. mj-entity-viewer is presentational. It EMITS CreateRecordRequested and RecordOpened; it does
 *     not act on them. A host that ignores those outputs gets a grid whose New button and row
 *     clicks silently do nothing. The handlers below are what make them work, via NavigationService.
 *
 *  2. Each nav item needs its OWN DriverClass. Sharing one class across several nav items makes
 *     the shell highlight all of them at once, because the active-item match keys on the class.
 *     Hence one thin subclass per page rather than a single parameterised component.
 *
 * NO [Config] IS PASSED, deliberately. The useful defaults are already on -- text filter, sorting,
 * record count, view-mode toggle. PER-COLUMN filters cannot be switched on from here: the grid
 * hard-codes `filter: false` in its defaultColDef (entity-data-grid.component.ts) and does not
 * expose it, so the only route is enumerating gridColumns per entity -- which would cost this
 * component its genericity and go stale as later modules add columns. Left off on purpose.
 */
@Component({ template: '' })
export abstract class ShelterEntityGridBase extends BaseResourceComponent {
    // No constructor needed: BaseResourceComponent already exposes
    // `protected navigationService = inject(NavigationService)`.
    // Re-declaring it as a constructor parameter shadows the base member and fails with TS4115.

    /** The entity this page shows. Supplied by each subclass. */
    public abstract get EntityName(): string;

    /** New button: open a blank form for this entity. */
    public onCreateNewRecord(): void {
        this.navigationService.OpenNewEntityRecord(this.EntityName);
    }

    /** Row click: open that record. */
    public onRecordOpened(event: RecordOpenedEvent): void {
        if (event?.entity && event.compositeKey) {
            this.navigationService.OpenEntityRecord(event.entity.Name, event.compositeKey);
        }
    }

    /**
     * A LINK INSIDE A CELL -- e.g. the Breed or Housing name on an animal row. This is a separate
     * output from RecordOpened, and wiring only RecordOpened leaves those links dead while row
     * clicks work, which is a confusing half-broken state.
     */
    public onOpenRelatedRecord(nav: ViewRelatedRecordNavigation): void {
        if (nav?.entityName && nav.recordKey != null) {
            this.navigationService.OpenEntityRecord(nav.entityName, CompositeKey.FromID(String(nav.recordKey)));
        }
    }

    override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return this.EntityName;
    }

    override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-table';
    }
}

/** Shared template — the grid plus the wiring that makes New and row-open work. */
const SHELTER_GRID_TEMPLATE = `
    <mj-entity-viewer
        [EntityName]="EntityName"
        (CreateRecordRequested)="onCreateNewRecord()"
        (RecordOpened)="onRecordOpened($any($event))"
        (OpenRelatedRecordRequested)="onOpenRelatedRecord($event)"
        (DataLoaded)="NotifyLoadComplete()"
        style="display:block; width:100%; height:100%;"></mj-entity-viewer>`;

@RegisterClass(BaseResourceComponent, 'ShelterAnimalsGrid')
@Component({ standalone: false, selector: 'shelter-animals-grid', template: SHELTER_GRID_TEMPLATE })
export class ShelterAnimalsGridComponent extends ShelterEntityGridBase {
    public get EntityName(): string { return 'MJ: Animals'; }
}

@RegisterClass(BaseResourceComponent, 'ShelterHousingGrid')
@Component({ standalone: false, selector: 'shelter-housing-grid', template: SHELTER_GRID_TEMPLATE })
export class ShelterHousingGridComponent extends ShelterEntityGridBase {
    public get EntityName(): string { return 'MJ: Housings'; }
}

@RegisterClass(BaseResourceComponent, 'ShelterBreedsGrid')
@Component({ standalone: false, selector: 'shelter-breeds-grid', template: SHELTER_GRID_TEMPLATE })
export class ShelterBreedsGridComponent extends ShelterEntityGridBase {
    public get EntityName(): string { return 'MJ: Breeds'; }
}

@RegisterClass(BaseResourceComponent, 'ShelterCareLogsGrid')
@Component({ standalone: false, selector: 'shelter-care-logs-grid', template: SHELTER_GRID_TEMPLATE })
export class ShelterCareLogsGridComponent extends ShelterEntityGridBase {
    public get EntityName(): string { return 'MJ: Care Logs'; }
}

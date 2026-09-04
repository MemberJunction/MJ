import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ShelterCategoryBase, ShelterCategoryPage } from './shelter-category.base';

/**
 * MJ Academy — the three rail-bearing categories of the Harbor Street top bar.
 *
 * Each is a handful of lines: a title, an icon, and its pages. All the shell -- header, rail,
 * content pane, page switching, grid wiring, query-id resolution -- lives once in
 * ShelterCategoryBase. That is the same economy bizapps-orders gets from ONE shared hero fed by
 * ~45 thin panels: build the machinery once, then declare.
 *
 * Each one needs its OWN @RegisterClass key. Sharing a DriverClass across nav items makes the
 * shell highlight every item that uses it, because the active-item match keys on the class.
 *
 * The Dashboard stays a plain top-bar item with no rail (see shelter-dashboard.resource.ts): it has
 * exactly one page, and a rail holding a single item is chrome with nothing to navigate.
 */

const CATEGORY_TEMPLATE = './shelter-category.resource.html';

@RegisterClass(BaseResourceComponent, 'ShelterAnimalsCategory')
@Component({
    standalone: false,
    selector: 'shelter-animals-category',
    templateUrl: CATEGORY_TEMPLATE,
    styleUrls: ['./shelter-category.resource.css'],
})
export class ShelterAnimalsCategoryComponent extends ShelterCategoryBase {
    public get CategoryTitle(): string { return 'Animals'; }
    public get CategoryIcon(): string { return 'fa-solid fa-paw'; }
    public get Pages(): ShelterCategoryPage[] {
        return [
            { id: 'animals', label: 'Animals',  icon: 'fa-solid fa-paw',            kind: 'entity', entityName: 'MJ: Animals' },
            { id: 'breeds',  label: 'Breeds',   icon: 'fa-solid fa-dog',            kind: 'entity', entityName: 'MJ: Breeds' },
            { id: 'care',    label: 'Care Log', icon: 'fa-solid fa-notes-medical',  kind: 'entity', entityName: 'MJ: Care Logs' },
        ];
    }
}

@RegisterClass(BaseResourceComponent, 'ShelterHousingCategory')
@Component({
    standalone: false,
    selector: 'shelter-housing-category',
    templateUrl: CATEGORY_TEMPLATE,
    styleUrls: ['./shelter-category.resource.css'],
})
export class ShelterHousingCategoryComponent extends ShelterCategoryBase {
    public get CategoryTitle(): string { return 'Housing'; }
    public get CategoryIcon(): string { return 'fa-solid fa-house-chimney'; }
    public get Pages(): ShelterCategoryPage[] {
        return [
            { id: 'units',     label: 'Housing',   icon: 'fa-solid fa-house-chimney', kind: 'entity', entityName: 'MJ: Housings' },
            // A Query, not an entity: these rows are computed and cannot be opened or edited.
            { id: 'occupancy', label: 'Occupancy', icon: 'fa-solid fa-chart-simple',  kind: 'query',  queryName: 'Housing Occupancy' },
        ];
    }
}

@RegisterClass(BaseResourceComponent, 'ShelterAdoptionCategory')
@Component({
    standalone: false,
    selector: 'shelter-adoption-category',
    templateUrl: CATEGORY_TEMPLATE,
    styleUrls: ['./shelter-category.resource.css'],
})
export class ShelterAdoptionCategoryComponent extends ShelterCategoryBase {
    public get CategoryTitle(): string { return 'Adoption'; }
    public get CategoryIcon(): string { return 'fa-solid fa-heart'; }
    public get Pages(): ShelterCategoryPage[] {
        return [
            {
                id: 'adopters',
                label: 'Adopters',
                icon: 'fa-solid fa-user',
                kind: 'pending',
                pendingNote:
                    'Adopters and adoption records arrive in module 7, where the shelter gains its ' +
                    'relationship entities. The category is here now so the top bar is the shape it ' +
                    'will keep.',
            },
        ];
    }
}

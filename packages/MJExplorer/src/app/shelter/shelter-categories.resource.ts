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
 * Module 7 filled in the Adoption category, which module 5 shipped as a single 'pending' placeholder
 * so the top bar would already be the shape it was going to keep. Nothing about the shell changed to
 * accommodate it -- two entity pages replaced one placeholder, which is what a category costs.
 *
 * NOTE what module 7 did NOT add: separate Dogs and Cats pages. Animals stays the ONE list. A dog is
 * an animal, so it belongs in the animal list; the subtype shows up on the FORM, where MJ's own
 * mj-isa-related-panel surfaces it beside the record. One list, two forms -- adding subtype list
 * pages would split the roster in half and teach exactly the wrong thing about IS-A.
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
            // Adoptions first: the funnel is what staff work FROM. A volunteer opens this category to
            // answer "who is interested in this dog, and what is holding it up?", which is a question
            // about inquiries, not about people. Adopters is the supporting list you reach when a
            // particular family needs screening or their details corrected.
            { id: 'adoptions', label: 'Adoptions', icon: 'fa-solid fa-heart',      kind: 'entity', entityName: 'MJ: Adoptions' },
            { id: 'adopters',  label: 'Adopters',  icon: 'fa-solid fa-user-group', kind: 'entity', entityName: 'MJ: Adopters' },
        ];
    }
}

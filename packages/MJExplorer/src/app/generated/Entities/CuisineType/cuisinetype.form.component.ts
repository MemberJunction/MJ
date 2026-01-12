import { Component } from '@angular/core';
import { CuisineTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Cuisine Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cuisinetype-form',
    templateUrl: './cuisinetype.form.component.html'
})
export class CuisineTypeFormComponent extends BaseFormComponent {
    public record!: CuisineTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'cuisineDetails', sectionName: 'Cuisine Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'restaurants', sectionName: 'Restaurants', isExpanded: false }
        ]);
    }
}

export function LoadCuisineTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

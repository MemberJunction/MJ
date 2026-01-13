import { Component } from '@angular/core';
import { BikeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Bikes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-bike-form',
    templateUrl: './bike.form.component.html'
})
export class BikeFormComponent extends BaseFormComponent {
    public record!: BikeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'riderStats', sectionName: 'Rider _ Stats', isExpanded: false }
        ]);
    }
}

export function LoadBikeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

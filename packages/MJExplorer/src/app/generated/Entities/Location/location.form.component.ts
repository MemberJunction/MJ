import { Component } from '@angular/core';
import { LocationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Locations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-location-form',
    templateUrl: './location.form.component.html'
})
export class LocationFormComponent extends BaseFormComponent {
    public record!: LocationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'weathers', sectionName: 'Weathers', isExpanded: false },
            { sectionKey: 'riderStats', sectionName: 'Rider _ Stats', isExpanded: false }
        ]);
    }
}

export function LoadLocationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

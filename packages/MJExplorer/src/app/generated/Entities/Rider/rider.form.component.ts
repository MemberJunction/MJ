import { Component } from '@angular/core';
import { RiderEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Riders') // Tell MemberJunction about this class
@Component({
    selector: 'gen-rider-form',
    templateUrl: './rider.form.component.html'
})
export class RiderFormComponent extends BaseFormComponent {
    public record!: RiderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'bikes', sectionName: 'Bikes', isExpanded: false },
            { sectionKey: 'locations', sectionName: 'Locations', isExpanded: false },
            { sectionKey: 'riderStats', sectionName: 'Rider _ Stats', isExpanded: false }
        ]);
    }
}

export function LoadRiderFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

import { Component } from '@angular/core';
import { PlanEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Plans') // Tell MemberJunction about this class
@Component({
    selector: 'gen-plan-form',
    templateUrl: './plan.form.component.html'
})
export class PlanFormComponent extends BaseFormComponent {
    public record!: PlanEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'planDetails', sectionName: 'Plan Details', isExpanded: true },
            { sectionKey: 'pricingAvailability', sectionName: 'Pricing & Availability', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'organizations', sectionName: 'Organizations', isExpanded: false }
        ]);
    }
}

export function LoadPlanFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

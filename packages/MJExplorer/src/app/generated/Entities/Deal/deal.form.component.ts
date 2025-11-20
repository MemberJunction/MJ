import { Component } from '@angular/core';
import { DealEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Deals') // Tell MemberJunction about this class
@Component({
    selector: 'gen-deal-form',
    templateUrl: './deal.form.component.html'
})
export class DealFormComponent extends BaseFormComponent {
    public record!: DealEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'dealProducts', sectionName: 'Deal Products', isExpanded: false },
            { sectionKey: 'invoices', sectionName: 'Invoices', isExpanded: false }
        ]);
    }
}

export function LoadDealFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

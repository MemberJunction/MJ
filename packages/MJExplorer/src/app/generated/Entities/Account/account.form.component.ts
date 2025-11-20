import { Component } from '@angular/core';
import { AccountEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-account-form',
    templateUrl: './account.form.component.html'
})
export class AccountFormComponent extends BaseFormComponent {
    public record!: AccountEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'events', sectionName: 'Events', isExpanded: false },
            { sectionKey: 'accountInsights', sectionName: 'Account Insights', isExpanded: false },
            { sectionKey: 'activities', sectionName: 'Activities', isExpanded: false },
            { sectionKey: 'contacts', sectionName: 'Contacts', isExpanded: false },
            { sectionKey: 'invoices', sectionName: 'Invoices', isExpanded: false },
            { sectionKey: 'deals', sectionName: 'Deals', isExpanded: false }
        ]);
    }
}

export function LoadAccountFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

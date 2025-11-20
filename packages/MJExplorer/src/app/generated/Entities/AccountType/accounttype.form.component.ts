import { Component } from '@angular/core';
import { AccountTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Account Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-accounttype-form',
    templateUrl: './accounttype.form.component.html'
})
export class AccountTypeFormComponent extends BaseFormComponent {
    public record!: AccountTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadAccountTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

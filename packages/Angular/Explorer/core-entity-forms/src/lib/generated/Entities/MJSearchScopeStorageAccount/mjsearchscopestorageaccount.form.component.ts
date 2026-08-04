import { Component } from '@angular/core';
import { MJSearchScopeStorageAccountEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Search Scope Storage Accounts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsearchscopestorageaccount-form',
    templateUrl: './mjsearchscopestorageaccount.form.component.html'
})
export class MJSearchScopeStorageAccountFormComponent extends BaseFormComponent {
    public record!: MJSearchScopeStorageAccountEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scopeConfiguration', sectionName: 'Scope Configuration', isExpanded: true },
            { sectionKey: 'storageConfiguration', sectionName: 'Storage Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


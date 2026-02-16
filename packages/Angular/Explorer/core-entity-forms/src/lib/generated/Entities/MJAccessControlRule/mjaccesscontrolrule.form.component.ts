import { Component } from '@angular/core';
import { MJAccessControlRuleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Access Control Rules') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaccesscontrolrule-form',
    templateUrl: './mjaccesscontrolrule.form.component.html'
})
export class MJAccessControlRuleFormComponent extends BaseFormComponent {
    public record!: MJAccessControlRuleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'accessTarget', sectionName: 'Access Target', isExpanded: true },
            { sectionKey: 'granteePermissions', sectionName: 'Grantee & Permissions', isExpanded: true },
            { sectionKey: 'validityAdministration', sectionName: 'Validity & Administration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


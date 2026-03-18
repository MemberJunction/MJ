import { Component } from '@angular/core';
import { YourMembershipDuesRuleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Dues Rules') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipduesrule-form',
    templateUrl: './yourmembershipduesrule.form.component.html'
})
export class YourMembershipDuesRuleFormComponent extends BaseFormComponent {
    public record!: YourMembershipDuesRuleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'duesRuleSettings', sectionName: 'Dues Rule Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


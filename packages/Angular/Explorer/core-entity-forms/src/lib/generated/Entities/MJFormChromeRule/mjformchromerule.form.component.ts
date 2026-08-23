import { Component } from '@angular/core';
import { MJFormChromeRuleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Form Chrome Rules') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjformchromerule-form',
    templateUrl: './mjformchromerule.form.component.html'
})
export class MJFormChromeRuleFormComponent extends BaseFormComponent {
    public record!: MJFormChromeRuleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ruleDefinition', sectionName: 'Rule Definition', isExpanded: true },
            { sectionKey: 'displayRules', sectionName: 'Display Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { MJAPIApplicationScopeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: API Application Scopes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapiapplicationscope-form',
    templateUrl: './mjapiapplicationscope.form.component.html'
})
export class MJAPIApplicationScopeFormComponent extends BaseFormComponent {
    public record!: MJAPIApplicationScopeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scopeRuleDetails', sectionName: 'Scope Rule Details', isExpanded: true },
            { sectionKey: 'applicationAssignment', sectionName: 'Application Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { APIApplicationScopeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: API Application Scopes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-apiapplicationscope-form',
    templateUrl: './apiapplicationscope.form.component.html'
})
export class APIApplicationScopeFormComponent extends BaseFormComponent {
    public record!: APIApplicationScopeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scopeRuleDetails', sectionName: 'Scope Rule Details', isExpanded: true },
            { sectionKey: 'applicationAssignment', sectionName: 'Application Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


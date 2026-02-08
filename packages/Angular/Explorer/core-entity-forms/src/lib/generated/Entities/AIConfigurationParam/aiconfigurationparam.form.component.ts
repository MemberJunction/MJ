import { Component } from '@angular/core';
import { AIConfigurationParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Configuration Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiconfigurationparam-form',
    templateUrl: './aiconfigurationparam.form.component.html'
})
export class AIConfigurationParamFormComponent extends BaseFormComponent {
    public record!: AIConfigurationParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'parameterAssignment', sectionName: 'Parameter Assignment', isExpanded: true },
            { sectionKey: 'parameterDetails', sectionName: 'Parameter Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { MJAIConfigurationParamsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Configuration Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiconfigurationparams-form',
    templateUrl: './mjaiconfigurationparams.form.component.html'
})
export class MJAIConfigurationParamsFormComponent extends BaseFormComponent {
    public record!: MJAIConfigurationParamsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'parameterAssignment', sectionName: 'Parameter Assignment', isExpanded: true },
            { sectionKey: 'parameterDetails', sectionName: 'Parameter Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


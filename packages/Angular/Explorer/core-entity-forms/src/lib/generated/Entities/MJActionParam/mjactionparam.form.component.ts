import { Component } from '@angular/core';
import { MJActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Action Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjactionparam-form',
    templateUrl: './mjactionparam.form.component.html'
})
export class MJActionParamFormComponent extends BaseFormComponent {
    public record!: MJActionParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionAssociation', sectionName: 'Action Association', isExpanded: true },
            { sectionKey: 'parameterDefinition', sectionName: 'Parameter Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJEntityActionParams', sectionName: 'Entity Action Params', isExpanded: false },
            { sectionKey: 'mJScheduledActionParams', sectionName: 'Scheduled Action Params', isExpanded: false }
        ]);
    }
}


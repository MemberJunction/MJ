import { Component } from '@angular/core';
import { ActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Action Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-actionparam-form',
    templateUrl: './actionparam.form.component.html'
})
export class ActionParamFormComponent extends BaseFormComponent {
    public record!: ActionParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionAssociation', sectionName: 'Action Association', isExpanded: true },
            { sectionKey: 'parameterDefinition', sectionName: 'Parameter Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityActionParams', sectionName: 'Entity Action Params', isExpanded: false },
            { sectionKey: 'scheduledActionParams', sectionName: 'Scheduled Action Params', isExpanded: false }
        ]);
    }
}


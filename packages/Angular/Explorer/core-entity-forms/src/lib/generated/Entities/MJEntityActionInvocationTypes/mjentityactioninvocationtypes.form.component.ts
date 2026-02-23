import { Component } from '@angular/core';
import { MJEntityActionInvocationTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Action Invocation Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityactioninvocationtypes-form',
    templateUrl: './mjentityactioninvocationtypes.form.component.html'
})
export class MJEntityActionInvocationTypesFormComponent extends BaseFormComponent {
    public record!: MJEntityActionInvocationTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'invocationTypeDefinition', sectionName: 'Invocation Type Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityActionInvocations', sectionName: 'Entity Action Invocations', isExpanded: false }
        ]);
    }
}


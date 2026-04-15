import { Component } from '@angular/core';
import { MJEntityActionInvocationTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Action Invocation Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityactioninvocationtype-form',
    templateUrl: './mjentityactioninvocationtype.form.component.html'
})
export class MJEntityActionInvocationTypeFormComponent extends BaseFormComponent {
    public record!: MJEntityActionInvocationTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'invocationTypeDefinition', sectionName: 'Invocation Type Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJEntityActionInvocations', sectionName: 'Entity Action Invocations', isExpanded: false }
        ]);
    }
}


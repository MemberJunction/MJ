import { Component } from '@angular/core';
import { MJEntityActionInvocationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Action Invocations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityactioninvocations-form',
    templateUrl: './mjentityactioninvocations.form.component.html'
})
export class MJEntityActionInvocationsFormComponent extends BaseFormComponent {
    public record!: MJEntityActionInvocationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'invocationConfiguration', sectionName: 'Invocation Configuration', isExpanded: true },
            { sectionKey: 'invocationStatus', sectionName: 'Invocation Status', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


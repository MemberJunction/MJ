import { Component } from '@angular/core';
import { MJEntityActionInvocationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Action Invocations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityactioninvocation-form',
    templateUrl: './mjentityactioninvocation.form.component.html'
})
export class MJEntityActionInvocationFormComponent extends BaseFormComponent {
    public record!: MJEntityActionInvocationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'invocationConfiguration', sectionName: 'Invocation Configuration', isExpanded: true },
            { sectionKey: 'invocationStatus', sectionName: 'Invocation Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


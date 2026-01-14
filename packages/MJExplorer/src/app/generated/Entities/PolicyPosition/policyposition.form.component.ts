import { Component } from '@angular/core';
import { PolicyPositionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Policy Positions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-policyposition-form',
    templateUrl: './policyposition.form.component.html'
})
export class PolicyPositionFormComponent extends BaseFormComponent {
    public record!: PolicyPositionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadPolicyPositionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

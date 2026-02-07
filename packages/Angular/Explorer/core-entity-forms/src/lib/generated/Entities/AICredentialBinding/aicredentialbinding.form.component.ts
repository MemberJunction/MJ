import { Component } from '@angular/core';
import { AICredentialBindingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Credential Bindings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aicredentialbinding-form',
    templateUrl: './aicredentialbinding.form.component.html'
})
export class AICredentialBindingFormComponent extends BaseFormComponent {
    public record!: AICredentialBindingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadAICredentialBindingFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

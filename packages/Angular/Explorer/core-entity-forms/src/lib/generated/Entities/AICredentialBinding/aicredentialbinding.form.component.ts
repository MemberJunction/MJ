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


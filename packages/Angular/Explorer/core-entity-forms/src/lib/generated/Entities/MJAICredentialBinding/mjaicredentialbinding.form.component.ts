import { Component } from '@angular/core';
import { MJAICredentialBindingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Credential Bindings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaicredentialbinding-form',
    templateUrl: './mjaicredentialbinding.form.component.html'
})
export class MJAICredentialBindingFormComponent extends BaseFormComponent {
    public record!: MJAICredentialBindingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}


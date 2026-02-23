import { Component } from '@angular/core';
import { MJAICredentialBindingsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Credential Bindings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaicredentialbindings-form',
    templateUrl: './mjaicredentialbindings.form.component.html'
})
export class MJAICredentialBindingsFormComponent extends BaseFormComponent {
    public record!: MJAICredentialBindingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}


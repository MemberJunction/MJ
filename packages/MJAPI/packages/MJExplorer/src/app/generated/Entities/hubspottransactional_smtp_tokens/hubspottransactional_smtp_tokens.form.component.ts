import { Component } from '@angular/core';
import { hubspottransactional_smtp_tokensEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Transactional Smtp Tokens') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspottransactional_smtp_tokens-form',
    templateUrl: './hubspottransactional_smtp_tokens.form.component.html'
})
export class hubspottransactional_smtp_tokensFormComponent extends BaseFormComponent {
    public record!: hubspottransactional_smtp_tokensEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tokenDetails', sectionName: 'Token Details', isExpanded: true },
            { sectionKey: 'auditAndTracking', sectionName: 'Audit and Tracking', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


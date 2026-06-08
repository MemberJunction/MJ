import { Component } from '@angular/core';
import { MJSignatureRequestRecipientEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Signature Request Recipients') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsignaturerequestrecipient-form',
    templateUrl: './mjsignaturerequestrecipient.form.component.html'
})
export class MJSignatureRequestRecipientFormComponent extends BaseFormComponent {
    public record!: MJSignatureRequestRecipientEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'signatureRequestLinking', sectionName: 'Signature Request Linking', isExpanded: true },
            { sectionKey: 'recipientContact', sectionName: 'Recipient Contact', isExpanded: true },
            { sectionKey: 'signingWorkflow', sectionName: 'Signing Workflow', isExpanded: true },
            { sectionKey: 'signingStatus', sectionName: 'Signing Status', isExpanded: true },
            { sectionKey: 'signingTimeline', sectionName: 'Signing Timeline', isExpanded: true },
            { sectionKey: 'externalIntegration', sectionName: 'External Integration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


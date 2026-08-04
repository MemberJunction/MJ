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
            { sectionKey: 'requestAssociation', sectionName: 'Request Association', isExpanded: true },
            { sectionKey: 'recipientInformation', sectionName: 'Recipient Information', isExpanded: true },
            { sectionKey: 'workflowSettings', sectionName: 'Workflow Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


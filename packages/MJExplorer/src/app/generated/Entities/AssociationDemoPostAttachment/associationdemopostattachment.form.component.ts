import { Component } from '@angular/core';
import { AssociationDemoPostAttachmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Post Attachments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemopostattachment-form',
    templateUrl: './associationdemopostattachment.form.component.html'
})
export class AssociationDemoPostAttachmentFormComponent extends BaseFormComponent {
    public record!: AssociationDemoPostAttachmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'attachmentDetails', sectionName: 'Attachment Details', isExpanded: true },
            { sectionKey: 'attachmentMetrics', sectionName: 'Attachment Metrics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { AssociationDemoRegulatoryCommentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Regulatory Comments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoregulatorycomment-form',
    templateUrl: './associationdemoregulatorycomment.form.component.html'
})
export class AssociationDemoRegulatoryCommentFormComponent extends BaseFormComponent {
    public record!: AssociationDemoRegulatoryCommentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'regulatoryContext', sectionName: 'Regulatory Context', isExpanded: true },
            { sectionKey: 'submissionDetails', sectionName: 'Submission Details', isExpanded: true },
            { sectionKey: 'commentContent', sectionName: 'Comment Content', isExpanded: false },
            { sectionKey: 'processingStatus', sectionName: 'Processing Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


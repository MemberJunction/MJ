import { Component } from '@angular/core';
import { MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Model Publish Records') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlmodelpublishrecord-form',
    templateUrl: './mjmlmodelpublishrecord.form.component.html'
})
export class MJMLModelPublishRecordFormComponent extends BaseFormComponent {
    public record!: MJMLModelPublishRecordEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'publishReferences', sectionName: 'Publish References', isExpanded: true },
            { sectionKey: 'publishDetails', sectionName: 'Publish Details', isExpanded: true },
            { sectionKey: 'auditAndDecisions', sectionName: 'Audit and Decisions', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLModelPublishRecords', sectionName: 'ML Model Publish Records', isExpanded: false }
        ]);
    }
}


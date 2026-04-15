import { Component } from '@angular/core';
import { MJDataContextEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Data Contexts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdatacontext-form',
    templateUrl: './mjdatacontext.form.component.html'
})
export class MJDataContextFormComponent extends BaseFormComponent {
    public record!: MJDataContextEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'contextDetails', sectionName: 'Context Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJDataContextItems', sectionName: 'Data Context Items', isExpanded: false },
            { sectionKey: 'mJReports', sectionName: 'Reports', isExpanded: false },
            { sectionKey: 'mJConversations', sectionName: 'Conversations', isExpanded: false }
        ]);
    }
}


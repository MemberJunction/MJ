import { Component } from '@angular/core';
import { MJConversationTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationtype-form',
    templateUrl: './mjconversationtype.form.component.html'
})
export class MJConversationTypeFormComponent extends BaseFormComponent {
    public record!: MJConversationTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'classificationDetails', sectionName: 'Classification Details', isExpanded: true },
            { sectionKey: 'behaviorAndExtensions', sectionName: 'Behavior and Extensions', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJConversations', sectionName: 'Conversations', isExpanded: false }
        ]);
    }
}


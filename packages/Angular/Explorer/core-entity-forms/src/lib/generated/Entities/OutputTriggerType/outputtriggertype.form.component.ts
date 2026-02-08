import { Component } from '@angular/core';
import { OutputTriggerTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Output Trigger Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-outputtriggertype-form',
    templateUrl: './outputtriggertype.form.component.html'
})
export class OutputTriggerTypeFormComponent extends BaseFormComponent {
    public record!: OutputTriggerTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'triggerDetails', sectionName: 'Trigger Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false }
        ]);
    }
}


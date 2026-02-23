import { Component } from '@angular/core';
import { MJOutputTriggerTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Output Trigger Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoutputtriggertypes-form',
    templateUrl: './mjoutputtriggertypes.form.component.html'
})
export class MJOutputTriggerTypesFormComponent extends BaseFormComponent {
    public record!: MJOutputTriggerTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'triggerDetails', sectionName: 'Trigger Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false }
        ]);
    }
}


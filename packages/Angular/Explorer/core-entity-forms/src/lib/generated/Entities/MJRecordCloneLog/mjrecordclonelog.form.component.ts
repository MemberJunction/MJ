import { Component } from '@angular/core';
import { MJRecordCloneLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Record Clone Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordclonelog-form',
    templateUrl: './mjrecordclonelog.form.component.html'
})
export class MJRecordCloneLogFormComponent extends BaseFormComponent {
    public record!: MJRecordCloneLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJRecordCloneLogItems', sectionName: 'Record Clone Log Items', isExpanded: false }
        ]);
    }
}


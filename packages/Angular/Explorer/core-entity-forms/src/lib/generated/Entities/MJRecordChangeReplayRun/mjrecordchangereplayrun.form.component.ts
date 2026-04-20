import { Component } from '@angular/core';
import { MJRecordChangeReplayRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Record Change Replay Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordchangereplayrun-form',
    templateUrl: './mjrecordchangereplayrun.form.component.html'
})
export class MJRecordChangeReplayRunFormComponent extends BaseFormComponent {
    public record!: MJRecordChangeReplayRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runIdentification', sectionName: 'Run Identification', isExpanded: true },
            { sectionKey: 'runTimingStatus', sectionName: 'Run Timing & Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJRecordChanges', sectionName: 'Record Changes', isExpanded: false }
        ]);
    }
}


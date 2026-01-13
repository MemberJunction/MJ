import { Component } from '@angular/core';
import { RecordChangeReplayRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Record Change Replay Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recordchangereplayrun-form',
    templateUrl: './recordchangereplayrun.form.component.html'
})
export class RecordChangeReplayRunFormComponent extends BaseFormComponent {
    public record!: RecordChangeReplayRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runIdentification', sectionName: 'Run Identification', isExpanded: true },
            { sectionKey: 'runTimingStatus', sectionName: 'Run Timing & Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'recordChanges', sectionName: 'Record Changes', isExpanded: false }
        ]);
    }
}

export function LoadRecordChangeReplayRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

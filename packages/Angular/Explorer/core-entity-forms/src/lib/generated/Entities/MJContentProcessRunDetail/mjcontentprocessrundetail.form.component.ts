import { Component } from '@angular/core';
import { MJContentProcessRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Content Process Run Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentprocessrundetail-form',
    templateUrl: './mjcontentprocessrundetail.form.component.html'
})
export class MJContentProcessRunDetailFormComponent extends BaseFormComponent {
    public record!: MJContentProcessRunDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sourceRunContext', sectionName: 'Source & Run Context', isExpanded: true },
            { sectionKey: 'processingMetrics', sectionName: 'Processing Metrics', isExpanded: true },
            { sectionKey: 'timelineUsage', sectionName: 'Timeline & Usage', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJContentProcessRunPromptRuns', sectionName: 'Content Process Run Prompt Runs', isExpanded: false }
        ]);
    }
}


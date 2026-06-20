import { Component } from '@angular/core';
import { MJProcessRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Process Run Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjprocessrundetail-form',
    templateUrl: './mjprocessrundetail.form.component.html'
})
export class MJProcessRunDetailFormComponent extends BaseFormComponent {
    public record!: MJProcessRunDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'processContext', sectionName: 'Process Context', isExpanded: true },
            { sectionKey: 'executionStatus', sectionName: 'Execution Status', isExpanded: true },
            { sectionKey: 'processingOutput', sectionName: 'Processing Output', isExpanded: true },
            { sectionKey: 'traceability', sectionName: 'Traceability', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { MJMCPToolExecutionLogsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: MCP Tool Execution Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmcptoolexecutionlogs-form',
    templateUrl: './mjmcptoolexecutionlogs.form.component.html'
})
export class MJMCPToolExecutionLogsFormComponent extends BaseFormComponent {
    public record!: MJMCPToolExecutionLogsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'connectionContext', sectionName: 'Connection Context', isExpanded: true },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: true },
            { sectionKey: 'userContext', sectionName: 'User Context', isExpanded: false },
            { sectionKey: 'payloadErrors', sectionName: 'Payload & Errors', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


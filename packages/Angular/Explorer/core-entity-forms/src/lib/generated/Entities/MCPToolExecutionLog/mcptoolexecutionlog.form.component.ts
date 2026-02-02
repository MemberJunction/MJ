import { Component } from '@angular/core';
import { MCPToolExecutionLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: MCP Tool Execution Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-mcptoolexecutionlog-form',
    templateUrl: './mcptoolexecutionlog.form.component.html'
})
export class MCPToolExecutionLogFormComponent extends BaseFormComponent {
    public record!: MCPToolExecutionLogEntity;

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

export function LoadMCPToolExecutionLogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

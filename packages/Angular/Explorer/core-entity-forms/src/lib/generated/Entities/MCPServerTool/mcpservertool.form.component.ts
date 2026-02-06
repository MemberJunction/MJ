import { Component } from '@angular/core';
import { MCPServerToolEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: MCP Server Tools') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mcpservertool-form',
    templateUrl: './mcpservertool.form.component.html'
})
export class MCPServerToolFormComponent extends BaseFormComponent {
    public record!: MCPServerToolEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'toolOverview', sectionName: 'Tool Overview', isExpanded: true },
            { sectionKey: 'schemasAnnotations', sectionName: 'Schemas & Annotations', isExpanded: true },
            { sectionKey: 'automation', sectionName: 'Automation', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMCPServerConnectionTools', sectionName: 'MJ: MCP Server Connection Tools', isExpanded: false },
            { sectionKey: 'mJMCPToolExecutionLogs', sectionName: 'MJ: MCP Tool Execution Logs', isExpanded: false }
        ]);
    }
}

export function LoadMCPServerToolFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

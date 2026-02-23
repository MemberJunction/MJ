import { Component } from '@angular/core';
import { MJMCPServerToolsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: MCP Server Tools') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmcpservertools-form',
    templateUrl: './mjmcpservertools.form.component.html'
})
export class MJMCPServerToolsFormComponent extends BaseFormComponent {
    public record!: MJMCPServerToolsEntity;

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


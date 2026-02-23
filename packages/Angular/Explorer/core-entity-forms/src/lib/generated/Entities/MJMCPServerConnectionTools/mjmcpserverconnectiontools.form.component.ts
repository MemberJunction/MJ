import { Component } from '@angular/core';
import { MJMCPServerConnectionToolsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: MCP Server Connection Tools') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmcpserverconnectiontools-form',
    templateUrl: './mjmcpserverconnectiontools.form.component.html'
})
export class MJMCPServerConnectionToolsFormComponent extends BaseFormComponent {
    public record!: MJMCPServerConnectionToolsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'connectionMapping', sectionName: 'Connection Mapping', isExpanded: true },
            { sectionKey: 'executionSettings', sectionName: 'Execution Settings', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


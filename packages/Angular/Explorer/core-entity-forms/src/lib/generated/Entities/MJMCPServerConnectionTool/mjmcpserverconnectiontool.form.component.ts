import { Component } from '@angular/core';
import { MJMCPServerConnectionToolEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: MCP Server Connection Tools') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmcpserverconnectiontool-form',
    templateUrl: './mjmcpserverconnectiontool.form.component.html'
})
export class MJMCPServerConnectionToolFormComponent extends BaseFormComponent {
    public record!: MJMCPServerConnectionToolEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'connectionMapping', sectionName: 'Connection Mapping', isExpanded: true },
            { sectionKey: 'executionSettings', sectionName: 'Execution Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { MJMCPServerConnectionPermissionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: MCP Server Connection Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmcpserverconnectionpermissions-form',
    templateUrl: './mjmcpserverconnectionpermissions.form.component.html'
})
export class MJMCPServerConnectionPermissionsFormComponent extends BaseFormComponent {
    public record!: MJMCPServerConnectionPermissionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'connectionPermissions', sectionName: 'Connection Permissions', isExpanded: true },
            { sectionKey: 'accessAssignment', sectionName: 'Access Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { WorkspaceItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Workspace Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-workspaceitem-form',
    templateUrl: './workspaceitem.form.component.html'
})
export class WorkspaceItemFormComponent extends BaseFormComponent {
    public record!: WorkspaceItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'presentationSettings', sectionName: 'Presentation Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


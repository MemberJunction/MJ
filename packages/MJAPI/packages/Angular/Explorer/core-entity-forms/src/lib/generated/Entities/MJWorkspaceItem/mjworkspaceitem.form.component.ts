import { Component } from '@angular/core';
import { MJWorkspaceItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Workspace Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkspaceitem-form',
    templateUrl: './mjworkspaceitem.form.component.html'
})
export class MJWorkspaceItemFormComponent extends BaseFormComponent {
    public record!: MJWorkspaceItemEntity;

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


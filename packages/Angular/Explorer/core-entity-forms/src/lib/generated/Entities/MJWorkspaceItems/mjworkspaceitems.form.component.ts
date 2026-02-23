import { Component } from '@angular/core';
import { MJWorkspaceItemsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Workspace Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkspaceitems-form',
    templateUrl: './mjworkspaceitems.form.component.html'
})
export class MJWorkspaceItemsFormComponent extends BaseFormComponent {
    public record!: MJWorkspaceItemsEntity;

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


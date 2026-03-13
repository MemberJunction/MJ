import { Component } from '@angular/core';
import { MJExplorerNavigationItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Explorer Navigation Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjexplorernavigationitem-form',
    templateUrl: './mjexplorernavigationitem.form.component.html'
})
export class MJExplorerNavigationItemFormComponent extends BaseFormComponent {
    public record!: MJExplorerNavigationItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreNavigationItem', sectionName: 'Core Navigation Item', isExpanded: true },
            { sectionKey: 'presentationSettings', sectionName: 'Presentation Settings', isExpanded: true },
            { sectionKey: 'administrativeMetadata', sectionName: 'Administrative Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { MJExplorerNavigationItemsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Explorer Navigation Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjexplorernavigationitems-form',
    templateUrl: './mjexplorernavigationitems.form.component.html'
})
export class MJExplorerNavigationItemsFormComponent extends BaseFormComponent {
    public record!: MJExplorerNavigationItemsEntity;

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


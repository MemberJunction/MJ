import { Component } from '@angular/core';
import { ExplorerNavigationItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Explorer Navigation Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-explorernavigationitem-form',
    templateUrl: './explorernavigationitem.form.component.html'
})
export class ExplorerNavigationItemFormComponent extends BaseFormComponent {
    public record!: ExplorerNavigationItemEntity;

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

export function LoadExplorerNavigationItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

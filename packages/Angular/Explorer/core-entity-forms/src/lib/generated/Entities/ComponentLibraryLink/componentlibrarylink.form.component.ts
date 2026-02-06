import { Component } from '@angular/core';
import { ComponentLibraryLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Component Library Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-componentlibrarylink-form',
    templateUrl: './componentlibrarylink.form.component.html'
})
export class ComponentLibraryLinkFormComponent extends BaseFormComponent {
    public record!: ComponentLibraryLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'componentLinkDetails', sectionName: 'Component Link Details', isExpanded: true },
            { sectionKey: 'libraryDependency', sectionName: 'Library Dependency', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadComponentLibraryLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

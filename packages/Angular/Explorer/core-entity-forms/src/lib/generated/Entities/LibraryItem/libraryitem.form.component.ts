import { Component } from '@angular/core';
import { LibraryItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Library Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-libraryitem-form',
    templateUrl: './libraryitem.form.component.html'
})
export class LibraryItemFormComponent extends BaseFormComponent {
    public record!: LibraryItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'itemInformation', sectionName: 'Item Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadLibraryItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

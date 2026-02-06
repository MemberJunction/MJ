import { Component } from '@angular/core';
import { ActionLibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Action Libraries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-actionlibrary-form',
    templateUrl: './actionlibrary.form.component.html'
})
export class ActionLibraryFormComponent extends BaseFormComponent {
    public record!: ActionLibraryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'referenceIDs', sectionName: 'Reference IDs', isExpanded: true },
            { sectionKey: 'actionLibraryInformation', sectionName: 'Action & Library Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadActionLibraryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

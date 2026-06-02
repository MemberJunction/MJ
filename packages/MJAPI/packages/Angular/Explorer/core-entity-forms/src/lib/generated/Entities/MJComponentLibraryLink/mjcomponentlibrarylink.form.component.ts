import { Component } from '@angular/core';
import { MJComponentLibraryLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Component Library Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcomponentlibrarylink-form',
    templateUrl: './mjcomponentlibrarylink.form.component.html'
})
export class MJComponentLibraryLinkFormComponent extends BaseFormComponent {
    public record!: MJComponentLibraryLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'componentLinkDetails', sectionName: 'Component Link Details', isExpanded: true },
            { sectionKey: 'libraryDependency', sectionName: 'Library Dependency', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


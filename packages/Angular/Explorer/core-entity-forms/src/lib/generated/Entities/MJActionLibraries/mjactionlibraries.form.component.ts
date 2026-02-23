import { Component } from '@angular/core';
import { MJActionLibrariesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Action Libraries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjactionlibraries-form',
    templateUrl: './mjactionlibraries.form.component.html'
})
export class MJActionLibrariesFormComponent extends BaseFormComponent {
    public record!: MJActionLibrariesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'referenceIDs', sectionName: 'Reference IDs', isExpanded: true },
            { sectionKey: 'actionLibraryInformation', sectionName: 'Action & Library Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { MJLibraryItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Library Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlibraryitem-form',
    templateUrl: './mjlibraryitem.form.component.html'
})
export class MJLibraryItemFormComponent extends BaseFormComponent {
    public record!: MJLibraryItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'itemInformation', sectionName: 'Item Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


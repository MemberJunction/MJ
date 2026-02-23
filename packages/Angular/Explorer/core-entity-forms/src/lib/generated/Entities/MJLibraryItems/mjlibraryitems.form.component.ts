import { Component } from '@angular/core';
import { MJLibraryItemsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Library Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlibraryitems-form',
    templateUrl: './mjlibraryitems.form.component.html'
})
export class MJLibraryItemsFormComponent extends BaseFormComponent {
    public record!: MJLibraryItemsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'itemInformation', sectionName: 'Item Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


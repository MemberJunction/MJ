import { Component } from '@angular/core';
import { MJRecordLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Record Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordlink-form',
    templateUrl: './mjrecordlink.form.component.html'
})
export class MJRecordLinkFormComponent extends BaseFormComponent {
    public record!: MJRecordLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'linkCore', sectionName: 'Link Core', isExpanded: true },
            { sectionKey: 'recordReferences', sectionName: 'Record References', isExpanded: true },
            { sectionKey: 'linkDetails', sectionName: 'Link Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


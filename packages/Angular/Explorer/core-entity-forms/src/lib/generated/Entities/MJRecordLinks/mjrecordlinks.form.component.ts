import { Component } from '@angular/core';
import { MJRecordLinksEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Record Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordlinks-form',
    templateUrl: './mjrecordlinks.form.component.html'
})
export class MJRecordLinksFormComponent extends BaseFormComponent {
    public record!: MJRecordLinksEntity;

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


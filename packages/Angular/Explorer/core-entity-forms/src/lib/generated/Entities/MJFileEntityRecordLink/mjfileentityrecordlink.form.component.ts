import { Component } from '@angular/core';
import { MJFileEntityRecordLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: File Entity Record Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfileentityrecordlink-form',
    templateUrl: './mjfileentityrecordlink.form.component.html'
})
export class MJFileEntityRecordLinkFormComponent extends BaseFormComponent {
    public record!: MJFileEntityRecordLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalIdentifiers', sectionName: 'Technical Identifiers', isExpanded: true },
            { sectionKey: 'linkDetails', sectionName: 'Link Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


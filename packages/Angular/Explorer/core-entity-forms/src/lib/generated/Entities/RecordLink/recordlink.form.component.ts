import { Component } from '@angular/core';
import { RecordLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Record Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-recordlink-form',
    templateUrl: './recordlink.form.component.html'
})
export class RecordLinkFormComponent extends BaseFormComponent {
    public record!: RecordLinkEntity;

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


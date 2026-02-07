import { Component } from '@angular/core';
import { FileEntityRecordLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'File Entity Record Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-fileentityrecordlink-form',
    templateUrl: './fileentityrecordlink.form.component.html'
})
export class FileEntityRecordLinkFormComponent extends BaseFormComponent {
    public record!: FileEntityRecordLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalIdentifiers', sectionName: 'Technical Identifiers', isExpanded: true },
            { sectionKey: 'linkDetails', sectionName: 'Link Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadFileEntityRecordLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

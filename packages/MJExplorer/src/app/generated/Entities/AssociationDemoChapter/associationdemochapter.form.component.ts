import { Component } from '@angular/core';
import { AssociationDemoChapterEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Chapters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemochapter-form',
    templateUrl: './associationdemochapter.form.component.html'
})
export class AssociationDemoChapterFormComponent extends BaseFormComponent {
    public record!: AssociationDemoChapterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'chapterProfile', sectionName: 'Chapter Profile', isExpanded: true },
            { sectionKey: 'locationDetails', sectionName: 'Location Details', isExpanded: true },
            { sectionKey: 'operations', sectionName: 'Operations', isExpanded: false },
            { sectionKey: 'communication', sectionName: 'Communication', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'chapterMemberships', sectionName: 'Chapter Memberships', isExpanded: false },
            { sectionKey: 'chapterOfficers', sectionName: 'Chapter Officers', isExpanded: false }
        ]);
    }
}


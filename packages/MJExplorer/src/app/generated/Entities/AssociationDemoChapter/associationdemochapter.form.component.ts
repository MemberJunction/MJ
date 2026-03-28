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
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'chapterMemberships', sectionName: 'Chapter Memberships', isExpanded: false },
            { sectionKey: 'chapterOfficers', sectionName: 'Chapter Officers', isExpanded: false }
        ]);
    }
}


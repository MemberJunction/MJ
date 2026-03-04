import { Component } from '@angular/core';
import { BranchEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Branches') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-branch-form',
    templateUrl: './branch.form.component.html'
})
export class BranchFormComponent extends BaseFormComponent {
    public record!: BranchEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'bookCopies', sectionName: 'Book Copies', isExpanded: false },
            { sectionKey: 'patrons', sectionName: 'Patrons', isExpanded: false }
        ]);
    }
}


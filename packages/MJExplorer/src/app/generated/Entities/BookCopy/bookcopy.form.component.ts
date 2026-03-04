import { Component } from '@angular/core';
import { BookCopyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Book Copies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-bookcopy-form',
    templateUrl: './bookcopy.form.component.html'
})
export class BookCopyFormComponent extends BaseFormComponent {
    public record!: BookCopyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'checkouts', sectionName: 'Checkouts', isExpanded: false }
        ]);
    }
}


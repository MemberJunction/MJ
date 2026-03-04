import { Component } from '@angular/core';
import { BookEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Books') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-book-form',
    templateUrl: './book.form.component.html'
})
export class BookFormComponent extends BaseFormComponent {
    public record!: BookEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'bookCopies', sectionName: 'Book Copies', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { AuthorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Authors') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-author-form',
    templateUrl: './author.form.component.html'
})
export class AuthorFormComponent extends BaseFormComponent {
    public record!: AuthorEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'books', sectionName: 'Books', isExpanded: false }
        ]);
    }
}


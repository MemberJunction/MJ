import { Component } from '@angular/core';
import { GenreEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Genres') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-genre-form',
    templateUrl: './genre.form.component.html'
})
export class GenreFormComponent extends BaseFormComponent {
    public record!: GenreEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'books', sectionName: 'Books', isExpanded: false }
        ]);
    }
}


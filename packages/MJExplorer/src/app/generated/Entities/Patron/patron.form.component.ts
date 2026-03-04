import { Component } from '@angular/core';
import { PatronEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Patrons') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-patron-form',
    templateUrl: './patron.form.component.html'
})
export class PatronFormComponent extends BaseFormComponent {
    public record!: PatronEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'checkouts', sectionName: 'Checkouts', isExpanded: false },
            { sectionKey: 'fines', sectionName: 'Fines', isExpanded: false }
        ]);
    }
}


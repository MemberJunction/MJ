import { Component } from '@angular/core';
import { AssociationDemoCompetitionEntryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Competition Entries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocompetitionentry-form',
    templateUrl: './associationdemocompetitionentry.form.component.html'
})
export class AssociationDemoCompetitionEntryFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCompetitionEntryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'productAwards', sectionName: 'Product Awards', isExpanded: false }
        ]);
    }
}


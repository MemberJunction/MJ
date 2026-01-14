import { Component } from '@angular/core';
import { CompetitionEntryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Competition Entries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-competitionentry-form',
    templateUrl: './competitionentry.form.component.html'
})
export class CompetitionEntryFormComponent extends BaseFormComponent {
    public record!: CompetitionEntryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'productAwards', sectionName: 'Product Awards', isExpanded: false }
        ]);
    }
}

export function LoadCompetitionEntryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

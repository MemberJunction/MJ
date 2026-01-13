import { Component } from '@angular/core';
import { CompetitionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Competitions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-competition-form',
    templateUrl: './competition.form.component.html'
})
export class CompetitionFormComponent extends BaseFormComponent {
    public record!: CompetitionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'competitionJudges', sectionName: 'Competition Judges', isExpanded: false },
            { sectionKey: 'competitionEntries', sectionName: 'Competition Entries', isExpanded: false },
            { sectionKey: 'productAwards', sectionName: 'Product Awards', isExpanded: false }
        ]);
    }
}

export function LoadCompetitionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

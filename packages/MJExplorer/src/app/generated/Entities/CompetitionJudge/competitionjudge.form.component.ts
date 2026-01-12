import { Component } from '@angular/core';
import { CompetitionJudgeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Competition Judges') // Tell MemberJunction about this class
@Component({
    selector: 'gen-competitionjudge-form',
    templateUrl: './competitionjudge.form.component.html'
})
export class CompetitionJudgeFormComponent extends BaseFormComponent {
    public record!: CompetitionJudgeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'competitionAssignment', sectionName: 'Competition Assignment', isExpanded: true },
            { sectionKey: 'compensationAdministration', sectionName: 'Compensation & Administration', isExpanded: true },
            { sectionKey: 'judgeProfile', sectionName: 'Judge Profile', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadCompetitionJudgeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

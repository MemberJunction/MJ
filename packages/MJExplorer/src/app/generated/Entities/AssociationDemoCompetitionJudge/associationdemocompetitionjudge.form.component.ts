import { Component } from '@angular/core';
import { AssociationDemoCompetitionJudgeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Competition Judges') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocompetitionjudge-form',
    templateUrl: './associationdemocompetitionjudge.form.component.html'
})
export class AssociationDemoCompetitionJudgeFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCompetitionJudgeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}


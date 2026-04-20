import { Component } from '@angular/core';
import { AssociationDemoCompetitionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Competitions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocompetition-form',
    templateUrl: './associationdemocompetition.form.component.html'
})
export class AssociationDemoCompetitionFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCompetitionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'competitionOverview', sectionName: 'Competition Overview', isExpanded: true },
            { sectionKey: 'competitionTimeline', sectionName: 'Competition Timeline', isExpanded: true },
            { sectionKey: 'logisticsAndContact', sectionName: 'Logistics and Contact', isExpanded: false },
            { sectionKey: 'operationalMetrics', sectionName: 'Operational Metrics', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'competitionJudges', sectionName: 'Competition Judges', isExpanded: false },
            { sectionKey: 'competitionEntries', sectionName: 'Competition Entries', isExpanded: false },
            { sectionKey: 'productAwards', sectionName: 'Product Awards', isExpanded: false }
        ]);
    }
}


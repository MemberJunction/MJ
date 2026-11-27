import { Component } from '@angular/core';
import { MJMLSearchStrategyComparisonEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Search Strategy Comparisons') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlsearchstrategycomparison-form',
    templateUrl: './mjmlsearchstrategycomparison.form.component.html'
})
export class MJMLSearchStrategyComparisonFormComponent extends BaseFormComponent {
    public record!: MJMLSearchStrategyComparisonEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'strategyConfiguration', sectionName: 'Strategy Configuration', isExpanded: true },
            { sectionKey: 'comparisonResults', sectionName: 'Comparison Results', isExpanded: true },
            { sectionKey: 'auditAndTracking', sectionName: 'Audit and Tracking', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Model Scoring Bindings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlmodelscoringbinding-form',
    templateUrl: './mjmlmodelscoringbinding.form.component.html'
})
export class MJMLModelScoringBindingFormComponent extends BaseFormComponent {
    public record!: MJMLModelScoringBindingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'bindingConfiguration', sectionName: 'Binding Configuration', isExpanded: true },
            { sectionKey: 'targetDestination', sectionName: 'Target Destination', isExpanded: true },
            { sectionKey: 'executionMetrics', sectionName: 'Execution Metrics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { LegislativeFindingsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Legislative Findings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-legislativefindings-form',
    templateUrl: './legislativefindings.form.component.html'
})
export class LegislativeFindingsFormComponent extends BaseFormComponent {
    public record!: LegislativeFindingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadLegislativeFindingsFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

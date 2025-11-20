import { Component } from '@angular/core';
import { IndustryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Industries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-industry-form',
    templateUrl: './industry.form.component.html'
})
export class IndustryFormComponent extends BaseFormComponent {
    public record!: IndustryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadIndustryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

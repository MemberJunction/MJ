import { Component } from '@angular/core';
import { EmailClickEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Email Clicks') // Tell MemberJunction about this class
@Component({
    selector: 'gen-emailclick-form',
    templateUrl: './emailclick.form.component.html'
})
export class EmailClickFormComponent extends BaseFormComponent {
    public record!: EmailClickEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadEmailClickFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

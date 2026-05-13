import { Component } from '@angular/core';
import { bettyPromptComponentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Prompt Components') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-bettypromptcomponent-form',
    templateUrl: './bettypromptcomponent.form.component.html'
})
export class bettyPromptComponentFormComponent extends BaseFormComponent {
    public record!: bettyPromptComponentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}


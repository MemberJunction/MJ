import { Component } from '@angular/core';
import { Grant_Entity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Grant _s') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-grant_-form',
    templateUrl: './grant_.form.component.html'
})
export class Grant_FormComponent extends BaseFormComponent {
    public record!: Grant_Entity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}


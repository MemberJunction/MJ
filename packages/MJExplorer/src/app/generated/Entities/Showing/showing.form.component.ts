import { Component } from '@angular/core';
import { ShowingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Showings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-showing-form',
    templateUrl: './showing.form.component.html'
})
export class ShowingFormComponent extends BaseFormComponent {
    public record!: ShowingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}


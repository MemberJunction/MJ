import { Component } from '@angular/core';
import { DealTagEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dealtag-form',
    templateUrl: './dealtag.form.component.html'
})
export class DealTagFormComponent extends BaseFormComponent {
    public record!: DealTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}


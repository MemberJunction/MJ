import { Component } from '@angular/core';
import { dboRSU_TestGadgetEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'RSU_ Test Gadgets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dborsu_testgadget-form',
    templateUrl: './dborsu_testgadget.form.component.html'
})
export class dboRSU_TestGadgetFormComponent extends BaseFormComponent {
    public record!: dboRSU_TestGadgetEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}


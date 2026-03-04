import { Component } from '@angular/core';
import { OpenHouseEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Open Houses') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-openhouse-form',
    templateUrl: './openhouse.form.component.html'
})
export class OpenHouseFormComponent extends BaseFormComponent {
    public record!: OpenHouseEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}


import { Component } from '@angular/core';
import { MJMLComponentTypePropertyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Component Type Properties') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlcomponenttypeproperty-form',
    templateUrl: './mjmlcomponenttypeproperty.form.component.html'
})
export class MJMLComponentTypePropertyFormComponent extends BaseFormComponent {
    public record!: MJMLComponentTypePropertyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}


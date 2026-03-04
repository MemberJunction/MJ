import { Component } from '@angular/core';
import { PropertyImageEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Property Images') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-propertyimage-form',
    templateUrl: './propertyimage.form.component.html'
})
export class PropertyImageFormComponent extends BaseFormComponent {
    public record!: PropertyImageEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}


import { Component } from '@angular/core';
import { RestaurantTagEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Restaurant Tags') // Tell MemberJunction about this class
@Component({
    selector: 'gen-restauranttag-form',
    templateUrl: './restauranttag.form.component.html'
})
export class RestaurantTagFormComponent extends BaseFormComponent {
    public record!: RestaurantTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagInformation', sectionName: 'Tag Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadRestaurantTagFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

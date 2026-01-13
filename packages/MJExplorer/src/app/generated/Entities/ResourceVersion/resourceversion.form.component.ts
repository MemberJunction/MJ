import { Component } from '@angular/core';
import { ResourceVersionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Resource Versions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourceversion-form',
    templateUrl: './resourceversion.form.component.html'
})
export class ResourceVersionFormComponent extends BaseFormComponent {
    public record!: ResourceVersionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadResourceVersionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

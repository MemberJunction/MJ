import { Component } from '@angular/core';
import { ResourceLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Resource Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-resourcelink-form',
    templateUrl: './resourcelink.form.component.html'
})
export class ResourceLinkFormComponent extends BaseFormComponent {
    public record!: ResourceLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadResourceLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

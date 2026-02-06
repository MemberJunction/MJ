import { Component } from '@angular/core';
import { ApplicationEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Application Entities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-applicationentity-form',
    templateUrl: './applicationentity.form.component.html'
})
export class ApplicationEntityFormComponent extends BaseFormComponent {
    public record!: ApplicationEntityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'applicationLinkage', sectionName: 'Application Linkage', isExpanded: true },
            { sectionKey: 'entityDefinition', sectionName: 'Entity Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadApplicationEntityFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

import { Component } from '@angular/core';
import { OpenAppDependencyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Open App Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-openappdependency-form',
    templateUrl: './openappdependency.form.component.html'
})
export class OpenAppDependencyFormComponent extends BaseFormComponent {
    public record!: OpenAppDependencyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'applicationInfo', sectionName: 'Application Info', isExpanded: true },
            { sectionKey: 'dependencyDetails', sectionName: 'Dependency Details', isExpanded: true },
            { sectionKey: 'versionStatus', sectionName: 'Version & Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


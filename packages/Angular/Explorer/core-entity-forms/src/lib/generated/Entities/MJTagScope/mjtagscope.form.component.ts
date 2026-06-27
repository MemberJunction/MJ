import { Component } from '@angular/core';
import { MJTagScopeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tag Scopes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtagscope-form',
    templateUrl: './mjtagscope.form.component.html'
})
export class MJTagScopeFormComponent extends BaseFormComponent {
    public record!: MJTagScopeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagConfiguration', sectionName: 'Tag Configuration', isExpanded: true },
            { sectionKey: 'scopeDefinition', sectionName: 'Scope Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}


import { Component } from '@angular/core';
import { ActionContextEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Action Contexts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-actioncontext-form',
    templateUrl: './actioncontext.form.component.html'
})
export class ActionContextFormComponent extends BaseFormComponent {
    public record!: ActionContextEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionCore', sectionName: 'Action Core', isExpanded: true },
            { sectionKey: 'contextMapping', sectionName: 'Context Mapping', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadActionContextFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

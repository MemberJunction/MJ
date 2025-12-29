import { Component } from '@angular/core';
import { ContentProcessRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Process Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentprocessrun-form',
    templateUrl: './contentprocessrun.form.component.html'
})
export class ContentProcessRunFormComponent extends BaseFormComponent {
    public record!: ContentProcessRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'runMetadata', sectionName: 'Run Metadata', isExpanded: false }
        ]);
    }
}

export function LoadContentProcessRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

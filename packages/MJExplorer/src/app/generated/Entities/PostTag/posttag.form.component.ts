import { Component } from '@angular/core';
import { PostTagEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Post Tags') // Tell MemberJunction about this class
@Component({
    selector: 'gen-posttag-form',
    templateUrl: './posttag.form.component.html'
})
export class PostTagFormComponent extends BaseFormComponent {
    public record!: PostTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadPostTagFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}

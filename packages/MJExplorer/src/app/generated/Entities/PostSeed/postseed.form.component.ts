import { Component } from '@angular/core';
import { PostSeedEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPostSeedDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Post Seeds') // Tell MemberJunction about this class
@Component({
    selector: 'gen-postseed-form',
    templateUrl: './postseed.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PostSeedFormComponent extends BaseFormComponent {
    public record!: PostSeedEntity;
} 

export function LoadPostSeedFormComponent() {
    LoadPostSeedDetailsComponent();
}

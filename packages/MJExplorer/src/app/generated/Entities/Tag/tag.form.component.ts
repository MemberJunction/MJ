import { Component } from '@angular/core';
import { TagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadTagDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Tags') // Tell MemberJunction about this class
@Component({
    selector: 'gen-tag-form',
    templateUrl: './tag.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TagFormComponent extends BaseFormComponent {
    public record: TagEntity | null = null;
} 

export function LoadTagFormComponent() {
    LoadTagDetailsComponent();
}

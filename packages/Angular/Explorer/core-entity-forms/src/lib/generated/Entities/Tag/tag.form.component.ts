import { Component } from '@angular/core';
import { TagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTagDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Tags') // Tell MemberJunction about this class
@Component({
    selector: 'gen-tag-form',
    templateUrl: './tag.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TagFormComponent extends BaseFormComponent {
    public record!: TagEntity;
} 

export function LoadTagFormComponent() {
    LoadTagDetailsComponent();
}

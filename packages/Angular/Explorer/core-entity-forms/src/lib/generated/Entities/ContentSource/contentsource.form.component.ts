import { Component } from '@angular/core';
import { ContentSourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentSourceDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Content Sources') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentsource-form',
    templateUrl: './contentsource.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentSourceFormComponent extends BaseFormComponent {
    public record!: ContentSourceEntity;
} 

export function LoadContentSourceFormComponent() {
    LoadContentSourceDetailsComponent();
}

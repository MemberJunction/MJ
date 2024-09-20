import { Component } from '@angular/core';
import { ContentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Content Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contenttype-form',
    templateUrl: './contenttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentTypeFormComponent extends BaseFormComponent {
    public record!: ContentTypeEntity;
} 

export function LoadContentTypeFormComponent() {
    LoadContentTypeDetailsComponent();
}

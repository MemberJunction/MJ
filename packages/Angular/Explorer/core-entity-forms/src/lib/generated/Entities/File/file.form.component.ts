import { Component } from '@angular/core';
import { FileEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFileDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Files') // Tell MemberJunction about this class
@Component({
    selector: 'gen-file-form',
    templateUrl: './file.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FileFormComponent extends BaseFormComponent {
    public record!: FileEntity;
} 

export function LoadFileFormComponent() {
    LoadFileDetailsComponent();
}

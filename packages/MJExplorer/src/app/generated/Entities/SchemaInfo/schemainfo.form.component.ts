import { Component } from '@angular/core';
import { SchemaInfoEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadSchemaInfoDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Schema Info') // Tell MemberJunction about this class
@Component({
    selector: 'gen-schemainfo-form',
    templateUrl: './schemainfo.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SchemaInfoFormComponent extends BaseFormComponent {
    public record!: SchemaInfoEntity;
} 

export function LoadSchemaInfoFormComponent() {
    LoadSchemaInfoDetailsComponent();
}

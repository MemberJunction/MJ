import { EntityInfo, EntityFieldInfo, GeneratedFormSectionType, EntityFieldTSType } from '@memberjunction/core';
import { logError, logStatus } from './logging';
import fs from 'fs';
import path from 'path';
import { mjCoreSchema, outputOptionValue } from './config';

class AngularFormSectionInfo {
    Type: GeneratedFormSectionType
    Name: string
    ClassName: string
    FileName: string
    ComponentCode: string
    TabCode: string
    Fields: EntityFieldInfo[]
    FileNameWithoutExtension: string
    EntityClassName: string
}

export function generateAngularCode(entities: EntityInfo[], directory: string, modulePrefix: string): boolean {
  try {
    const entityPath = path.join(directory, 'Entities');
    //const classMapEntries: string[] = [];
    const componentImports: string[] = [];
    const componentNames: string[] = [];
    const sections: AngularFormSectionInfo[] = [];

    if (!fs.existsSync(entityPath))
        fs.mkdirSync(entityPath, { recursive: true }); // create the directory if it doesn't exist

    for (let i:number = 0; i < entities.length; ++i) {
        const entity = entities[i];

        if (entity.PrimaryKey && entity.IncludeInAPI) {
            const thisEntityPath = path.join(entityPath, entity.ClassName);
            if (!fs.existsSync(thisEntityPath))
                fs.mkdirSync(thisEntityPath, { recursive: true }); // create the directory if it doesn't exist

            const { htmlCode, sections: entitySections } = generateSingleEntityHTMLForAngular(entity)
            const tsCode = generateSingleEntityTypeScriptForAngular(entity, entitySections)

            fs.writeFileSync(path.join(thisEntityPath, `${entity.ClassName.toLowerCase()}.form.component.ts`), tsCode);
            fs.writeFileSync(path.join(thisEntityPath, `${entity.ClassName.toLowerCase()}.form.component.html`), htmlCode);


            if (entitySections.length > 0) {
                const sectionPath = path.join(thisEntityPath, 'sections');
                if (!fs.existsSync(sectionPath))
                    fs.mkdirSync(sectionPath, { recursive: true }); // create the directory if it doesn't exist

                for (let j:number = 0; j < entitySections.length; ++j) {
                    fs.writeFileSync(path.join(sectionPath, `${entitySections[j].FileName}`), entitySections[j].ComponentCode);
                    sections.push(entitySections[j]); // add the entity's secitons one by one to the master/global list of sections
                }
            }

            const componentName: string = `${entity.ClassName}FormComponent`;
            componentImports.push (`import { ${componentName}, Load${componentName} } from "./Entities/${entity.ClassName}/${entity.ClassName.toLowerCase()}.form.component";`);
            componentNames.push(componentName);
        }
        else {
            logStatus(`   Entity ${entity.Name} does not have a primary key or is not included in the API, skipping code generation for this entity`);
        }
    }

    const maxComponentsPerModule = outputOptionValue('Angular', 'maxComponentsPerModule', 25);

    const moduleCode = generateAngularModule(componentImports, componentNames, sections, modulePrefix, maxComponentsPerModule);
    fs.writeFileSync(path.join(directory, 'generated-forms.module.ts'), moduleCode);

    return true;
  } 
  catch (err) {
    logError(err);
    return false;
  }
}
 

function generateAngularModule(componentImports: string[], componentNames: string[], sections: AngularFormSectionInfo[], modulePrefix: string, maxComponentsPerModule: number = 25): string {
    // this function will generate the overall code for the module file.
    // there is one master angular module called GeneratedFormsModule, and this module will include all of the sub-modules
    // the reason we do this is because of limits in the size of the types you can create in TypeScript and if we have a very large 
    // number of generated components for large systems, we can exceed that limit. So, we break the generated components into
    // smaller modules and then import those modules into the master module, which is what this function does

    // first, generate the sub-modules
    const moduleCode: string = generateAngularModuleCode(componentNames, sections, maxComponentsPerModule, modulePrefix);

    return `/**********************************************************************************
* GENERATED FILE - This file is automatically managed by the MJ CodeGen tool, 
* 
* DO NOT MODIFY THIS FILE - any changes you make will be wiped out the next time the file is
* generated
* 
**********************************************************************************/
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';

// Import Generated Components
${componentImports.join('\n')}
${sections.map(s => `import { ${s.ClassName}, Load${s.ClassName} } from "./Entities/${s.EntityClassName}/sections/${s.FileNameWithoutExtension}"`).join('\n')}

${moduleCode}

export function Load${modulePrefix}GeneratedForms() {
    // This function doesn't do much, but it calls each generated form's loader function
    // which in turn calls the sections for that generated form. Ultimately, those bits of 
    // code do NOTHING - the point is to prevent the code from being eliminated during tree shaking
    // since it is dynamically instantiated on demand, and the Angular compiler has no way to know that,
    // in production builds tree shaking will eliminate the code unless we do this
    ${componentNames.map(c => `Load${c}();`).join('\n    ')}
    ${sections.map(s => `Load${s.ClassName}();`).join('\n    ')}
}
`
}

function generateAngularModuleCode(componentNames: string[], sections: AngularFormSectionInfo[], maxComponentsPerModule: number, modulePrefix: string): string {
    // this function breaks up the componentNames and sections up, we only want to have a max of maxComponentsPerModule components per module (of components and/or sections, doesn't matter)
    // so, we break up the list of components into sub-modules, and then generate the code for each sub-module
    
    // iterate through the componentNames first, then after we've exhausted those, then iterate through the sections
    const combinedArray: string[] = componentNames.concat(sections.map(s => s.ClassName));
    const subModules: string[] = [];
    let currentComponentCount: number = 0;
    const subModuleStarter: string =   `
@NgModule({
declarations: [
`
    let currentSubModuleCode: string = subModuleStarter;

    // loop through the combined array which is the combination of the componentNames and the sections
    for (let i: number = 0; i < combinedArray.length; ++i) {
        currentSubModuleCode += (currentComponentCount === 0 ? '' : ',\n') +  '    ' + combinedArray[i]; // prepend a comma if this isn't the first component in the module
        if ( 
             (currentComponentCount === maxComponentsPerModule - 1) || 
             (i === combinedArray.length - 1) 
           ) {
            // we have reached the max number of components for this module, so generate the module code and reset the counters
            currentSubModuleCode += generateSubModuleEnding(subModules.length);
            subModules.push(currentSubModuleCode);
            currentSubModuleCode = subModuleStarter;
            currentComponentCount = 0;
        }
        else    
            currentComponentCount++;
    }            

    // at this point, we have a list of sub-modules that are generated into the subModules array, now we need to generate the main module that imports each of the sub-modules.
    const subModuleNames = subModules.map((s, i) => `${subModule_BaseName}${i}`);
    const masterModuleCode: string = `
@NgModule({
declarations: [
],
imports: [
    ${subModuleNames.join(',\n    ')}
]
})
export class ${modulePrefix}GeneratedFormsModule { }`;

    // now we have the sub-modules generated into the subModules array, and we have the master module code generated into the masterModuleCode variable
    // so we need to combine the two into a single return value and send back to the caller
    return subModules.join('\n\n') + '\n\n' + masterModuleCode; 
    
}

const subModule_BaseName: string = 'GeneratedForms_SubModule_';
function generateSubModuleEnding(moduleNumber: number): string {
return `],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
    LinkDirectivesModule,
    BaseFormsModule
],
exports: [
]
})
export class ${subModule_BaseName}${moduleNumber} { }
`;
}


function generateSingleEntityTypeScriptForAngular(entity: EntityInfo, sections: AngularFormSectionInfo[]): string {
    const entityObjectClass: string = entity.ClassName
    const sectionImports: string = sections.length > 0 ? sections.map(s => `import { Load${s.ClassName} } from "./sections/${s.FileNameWithoutExtension}"`).join('\n') : '';

    return `import { Component } from '@angular/core';
import { ${entityObjectClass}Entity } from '${entity.SchemaName === mjCoreSchema ? '@memberjunction/core-entities' : 'mj_generatedentities'}';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
${sectionImports}
@RegisterClass(BaseFormComponent, '${entity.Name}') // Tell MemberJunction about this class
@Component({
    selector: 'gen-${entity.ClassName.toLowerCase()}-form',
    templateUrl: './${entity.ClassName.toLowerCase()}.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ${entity.ClassName}FormComponent extends BaseFormComponent {
    public record!: ${entityObjectClass}Entity;
} 

export function Load${entity.ClassName}FormComponent() {
    ${sections.map(s => `Load${s.ClassName}();`).join('\n    ')}
}
`
}

function entityHasTopArea(entity: EntityInfo): boolean {
    return entity.Fields.some(f => f.GeneratedFormSectionType === GeneratedFormSectionType.Top);
}
function generateTopAreaHTMLForAngular(entity: EntityInfo): string {
    if (!entityHasTopArea(entity)) 
        return '';
    else
        return `<mj-form-section Entity="${entity.Name}" Section="top-area" [record]="record" [EditMode]="this.EditMode"></mj-form-section>`
} 

function AddSectionIfNeeded(entity: EntityInfo, sections: AngularFormSectionInfo[], type: GeneratedFormSectionType, name: string) {
    const section = sections.find(s => s.Name === name && s.Type === type);
    const fName = `${stripWhiteSpace(name.toLowerCase())}.component`
    if (!section) 
        sections.push({
            Type: type,
            Name: name,
            FileName: `${fName}.ts`,
            ComponentCode: '',
            ClassName: `${entity.ClassName}${stripWhiteSpace(name)}Component`,
            TabCode: '',
            Fields: [],
            EntityClassName: entity.ClassName,
            FileNameWithoutExtension: fName
        });
}
function generateAngularAdditionalSections(entity: EntityInfo, startIndex: number): AngularFormSectionInfo[] {
    const sections: AngularFormSectionInfo[] = [];
    let index = startIndex;
    for (const field of entity.Fields) {
        if (field.IncludeInGeneratedForm) {
            if (field.GeneratedFormSectionType === GeneratedFormSectionType.Category && field.Category && field.Category !== ''  && field.IncludeInGeneratedForm) 
                AddSectionIfNeeded(entity, sections, GeneratedFormSectionType.Category, field.Category);
            else if (field.GeneratedFormSectionType === GeneratedFormSectionType.Details) 
                AddSectionIfNeeded(entity, sections, GeneratedFormSectionType.Details, "Details");
            else if (field.GeneratedFormSectionType === GeneratedFormSectionType.Top)
                AddSectionIfNeeded(entity, sections, GeneratedFormSectionType.Top, "Top");
        }
    }

    // now we have a distinct list of section names set, generate HTML for each section 
    for (const section of sections) {
        let sectionName: string = ''
        if (section.Type === GeneratedFormSectionType.Top) {
            section.TabCode = generateTopAreaHTMLForAngular(entity);
            sectionName = 'top-area'
        }
        else {
            if (section.Type === GeneratedFormSectionType.Category)
                sectionName = stripWhiteSpace(section.Name.toLowerCase());
            else if (section.Type === GeneratedFormSectionType.Details)
                sectionName = 'details';

            section.TabCode = `
                    <kendo-tabstrip-tab  [selected]="this.RegisterAndCheckIfCurrentTab('${section.Name}')">
                        <ng-template kendoTabTitle>${section.Name}</ng-template>
                        <ng-template kendoTabContent >
                            <mj-form-section Entity="${entity.Name}" Section="${stripWhiteSpace(section.Name.toLowerCase())}" [record]="record" [EditMode]="this.EditMode"></mj-form-section>
                        </ng-template>
                    </kendo-tabstrip-tab>`
        }

        const { readModeHTML, editModeHTML } = generateSectionHTMLForAngular(entity, section);

        section.ComponentCode = `import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ${entity.ClassName}Entity } from '${entity.SchemaName === mjCoreSchema ? '@memberjunction/core-entities' : 'mj_generatedentities'}';

@RegisterClass(BaseFormSectionComponent, '${entity.Name}.${sectionName}') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-${entity.ClassName.toLowerCase()}-form-${sectionName}',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: \`<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
    ${editModeHTML}
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
    ${readModeHTML}
    </div>
</div>
    \`
})
export class ${entity.ClassName}${stripWhiteSpace(section.Name)}Component extends BaseFormSectionComponent {
    @Input() override record!: ${entity.ClassName}Entity;
    @Input() override EditMode: boolean = false;
}

export function Load${entity.ClassName}${stripWhiteSpace(section.Name)}Component() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
`

        if (section.Type !== GeneratedFormSectionType.Top)
            index++; // don't increment the tab index for TOP AREA, becuse it won't be rendered as a tab
    }

    return sections;
}

function generateSectionHTMLForAngular(entity: EntityInfo, section: AngularFormSectionInfo): { readModeHTML: string, editModeHTML: string } {
    let readModeHTML: string = ''
    let editModeHTML: string = ''

    for (const field of entity.Fields) {
        if (field.IncludeInGeneratedForm) {
            let bMatch: boolean = false;
            if (field.GeneratedFormSectionType === GeneratedFormSectionType.Top && section.Type === GeneratedFormSectionType.Top) {
                // match, include the field in the output
                bMatch = true;
            }
            else if (field.GeneratedFormSectionType === GeneratedFormSectionType.Category && field.Category && section.Name && field.Category.trim().toLowerCase() === section.Name.trim().toLowerCase()) {
                // match, include the field in the output
                bMatch = true;
            }
            else if (field.GeneratedFormSectionType === GeneratedFormSectionType.Details && section.Type === GeneratedFormSectionType.Details) {
                // match, include the field in the output
                bMatch = true;
            }
            if (bMatch && field.Name.toLowerCase() !== 'id') {
                section.Fields.push(field) // add the field to the section fields array

                // next, generate HTML for the field
                const linkDirective = field.RelatedEntity && field.RelatedEntity.length > 0 ? `mjFieldLink [record]="record" fieldName="${field.CodeName}" ` : ''
                const linkNoTextDirective = field.RelatedEntity && field.RelatedEntity.length > 0 ? `mjFieldLink [record]="record" fieldName="${field.CodeName}" [replaceText]="false" ` : ''
                const webLinkDirective = field.ExtendedType && field.ExtendedType.length > 0 && field.ExtendedType.trim().toLowerCase() === 'url' ? `mjWebLink [field]="record.GetFieldByName('${field.CodeName}')" ` : '';
                const emailLinkDirective = field.ExtendedType && field.ExtendedType.length > 0 && field.ExtendedType.trim().toLowerCase() === 'email' ? `mjEmailLink [field]="record.GetFieldByName('${field.CodeName}')" ` : '';
                readModeHTML += `              
        <div class="record-form-row">
            <label class="fieldLabel">${field.DisplayNameOrName}</label>
            <span ${linkDirective}${webLinkDirective}${emailLinkDirective}>{{FormatValue('${field.CodeName}', 0)}}</span>
        </div>`

                let editControl = '';
                let bReadOnly: boolean = false;
    
                if (!field.ReadOnly) {
                    if (field.TSType === EntityFieldTSType.Boolean)
                        editControl = `<input type="checkbox" [(ngModel)]="record.${field.CodeName}" kendoCheckBox />`
                    else if (field.TSType === EntityFieldTSType.Date)
                        editControl = `<kendo-datepicker [(value)]="record.${field.CodeName}${field.AllowsNull ? "!" : ""}" ></kendo-datepicker>` // if the field allows null, then add the ! to the end of the field name because the datepicker expects a date object, not null
                    else if (field.TSType === EntityFieldTSType.Number)
                        editControl = `<kendo-numerictextbox [(value)]="record.${field.CodeName}${field.AllowsNull ? "!" : ""}" ></kendo-numerictextbox>` // if the field allows null, then add the ! to the end of the field name because the numerictextbox expects a number, not null
                    else if (field.TSType === EntityFieldTSType.String) {
                        if (field.MaxLength > 100)
                            editControl = `<kendo-textarea [(ngModel)]="record.${field.CodeName}" ></kendo-textarea>`
                        else
                            editControl = `<kendo-textbox [(ngModel)]="record.${field.CodeName}"  />`
                    }
                }
                else {
                    // read only field
                    editControl = `<span ${linkDirective}${webLinkDirective}${emailLinkDirective}>{{FormatValue('${field.CodeName}', 0)}}</span>`
                    bReadOnly = true;
                }

                editModeHTML += `              
        <div class="record-form-row">
            <label class="fieldLabel">${field.DisplayNameOrName}</label>
            ${editControl}   
        </div> `
            }
        }
    }

    return { readModeHTML, editModeHTML };
}

function generateRelatedEntityTabs(entity: EntityInfo, startIndex: number): string[] {
    const tabs: string[] = [];
    let index = startIndex;
    for (const relatedEntity of entity.RelatedEntities) {
        const tabName: string = relatedEntity.DisplayName ? relatedEntity.DisplayName : relatedEntity.RelatedEntity
        tabs.push(`          
                    <kendo-tabstrip-tab  [selected]="this.RegisterAndCheckIfCurrentTab('${tabName}')">
                        <ng-template kendoTabTitle>${tabName}</ng-template>
                        <ng-template kendoTabContent >
                            <mj-user-view-grid [Params]="this.BuildRelationshipViewParamsByEntityName('${relatedEntity.RelatedEntity}')"  
                                               [AllowLoad]="this.IsCurrentTab('${tabName}')"  
                                               [EditMode]="this.GridEditMode()"  
                                               [BottomMargin]="GridBottomMargin"></mj-user-view-grid>
                        </ng-template>
                    </kendo-tabstrip-tab>`)

        index++;
    }

    return tabs;
}

function stripWhiteSpace(s: string): string {
    return s.replace(/\s/g, '');
}

function generateSingleEntityHTMLForAngular(entity: EntityInfo): {htmlCode: string, sections: AngularFormSectionInfo[]} {
    const topArea = generateTopAreaHTMLForAngular(entity);
    const additionalSections = generateAngularAdditionalSections(entity, 0);
    // calc ending index for additional sections so we can pass taht into the related entity tabs because they need to start incrementally up from there...
    const endingIndex = additionalSections && additionalSections.length ? (topArea && topArea.length > 0 ? additionalSections.length - 1 : additionalSections.length) : 0;
    const relatedEntitySections = generateRelatedEntityTabs(entity, endingIndex);
    const htmlCode = topArea.length > 0 ? generateSingleEntityHTMLWithSplitterForAngular(topArea, additionalSections, relatedEntitySections) : 
                                          generateSingleEntityHTMLWithOUTSplitterForAngular(topArea, additionalSections, relatedEntitySections);
    return {htmlCode, sections: additionalSections};
}


function generateSingleEntityHTMLWithSplitterForAngular(topArea, additionalSections, relatedEntitySections): string {
    const htmlCode: string =  `<div class="record-form-container">
    <form *ngIf="record" class="record-form"  #form="ngForm">
        <kendo-splitter orientation="vertical" (layoutChange)="splitterLayoutChange()">
            <kendo-splitter-pane>
${innerTopAreaHTML(topArea)}
            </kendo-splitter-pane>
            <kendo-splitter-pane>
${innerTabStripHTML(additionalSections, relatedEntitySections)}
            </kendo-splitter-pane>
        </kendo-splitter>
    </form>
  </div>
    `
    return htmlCode;
}

function innerTopAreaHTML(topArea: string): string {
return `                <div #topArea class="record-form-group">
                    <mj-form-toolbar [form]="this"></mj-form-toolbar>
                    ${topArea}
                </div>`
}
function innerTabStripHTML(additionalSections, relatedEntitySections): string {
    return `                <kendo-tabstrip #tabStrip (tabSelect)="onTabSelect($event)" [keepTabContent]="true" [animate] = "false" [height]="TabHeight" >
                                ${additionalSections ? additionalSections.filter(s => s.Type !== GeneratedFormSectionType.Top).map(s => s.TabCode).join('\n               ') : ''}
                                ${relatedEntitySections ? relatedEntitySections.join('\n') : ''}
                            </kendo-tabstrip>`
}

function generateSingleEntityHTMLWithOUTSplitterForAngular(topArea, additionalSections, relatedEntitySections): string {
    const htmlCode: string =  `<div class="record-form-container">
    <form *ngIf="record" class="record-form"  #form="ngForm">
        ${innerTopAreaHTML(topArea)}
        ${innerTabStripHTML(additionalSections, relatedEntitySections)}
    </form>
  </div>
    `
    return htmlCode;
}

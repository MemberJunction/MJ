import { EntityInfo, EntityFieldInfo, GeneratedFormSectionType, EntityFieldTSType, EntityFieldValueListType, Metadata } from '@memberjunction/core';
import { logError, logStatus } from './logging';
import fs from 'fs';
import path from 'path';
import { mjCoreSchema, outputOptionValue } from './config';
import { RegisterClass } from '@memberjunction/global';

export class AngularFormSectionInfo {
    Type: GeneratedFormSectionType
    Name: string
    TabCode: string
    ClassName?: string
    FileName?: string
    ComponentCode?: string
    Fields?: EntityFieldInfo[]
    FileNameWithoutExtension?: string
    EntityClassName?: string
    IsRelatedEntity?: boolean = false
    RelatedEntityDisplayLocation?: 'Before Field Tabs' | 'After Field Tabs' = 'After Field Tabs'
}

/**
 * Base class for generating Angular client code, you can sub-class this class to create your own Angular client code generator logic
 */
@RegisterClass(AngularClientGeneratorBase)
export class AngularClientGeneratorBase {
    public generateAngularCode(entities: EntityInfo[], directory: string, modulePrefix: string): boolean {
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
      
              if (entity.PrimaryKeys && entity.PrimaryKeys.length > 0 && entity.IncludeInAPI) {
                  const thisEntityPath = path.join(entityPath, entity.ClassName);
                  if (!fs.existsSync(thisEntityPath))
                      fs.mkdirSync(thisEntityPath, { recursive: true }); // create the directory if it doesn't exist
      
                  const { htmlCode, sections: entitySections } = this.generateSingleEntityHTMLForAngular(entity)
                  const tsCode = this.generateSingleEntityTypeScriptForAngular(entity, entitySections)
      
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
      
          const moduleCode = this.generateAngularModule(componentImports, componentNames, sections, modulePrefix, maxComponentsPerModule);
          fs.writeFileSync(path.join(directory, 'generated-forms.module.ts'), moduleCode);
      
          return true;
        } 
        catch (err) {
          logError(err);
          return false;
        }
      }
       
      
      protected generateAngularModule(componentImports: string[], componentNames: string[], sections: AngularFormSectionInfo[], modulePrefix: string, maxComponentsPerModule: number = 25): string {
          // this function will generate the overall code for the module file.
          // there is one master angular module called GeneratedFormsModule, and this module will include all of the sub-modules
          // the reason we do this is because of limits in the size of the types you can create in TypeScript and if we have a very large 
          // number of generated components for large systems, we can exceed that limit. So, we break the generated components into
          // smaller modules and then import those modules into the master module, which is what this function does
      
          // first, generate the sub-modules
          const moduleCode: string = this.generateAngularModuleCode(componentNames, sections, maxComponentsPerModule, modulePrefix);
      
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

// MemberJunction Imports
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { FormToolbarModule } from '@memberjunction/ng-form-toolbar';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { MJTabStripModule } from "@memberjunction/ng-tabstrip";
import { ContainerDirectivesModule } from "@memberjunction/ng-container-directives";

// Kendo Imports
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { ComboBoxModule } from '@progress/kendo-angular-dropdowns';
import { DropDownListModule } from '@progress/kendo-angular-dropdowns';

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
      
      protected generateAngularModuleCode(componentNames: string[], sections: AngularFormSectionInfo[], maxComponentsPerModule: number, modulePrefix: string): string {
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
                currentSubModuleCode += this.generateSubModuleEnding(subModules.length);
                subModules.push(currentSubModuleCode);
                currentSubModuleCode = subModuleStarter;
                currentComponentCount = 0;
            }
            else    
                currentComponentCount++;
        }            
    
        // at this point, we have a list of sub-modules that are generated into the subModules array, now we need to generate the main module that imports each of the sub-modules.
        const subModuleNames = subModules.map((s, i) => `${this.SubModuleBaseName}${i}`);
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
      
      protected subModule_BaseName: string = 'GeneratedForms_SubModule_';
      /**
       * Get the base name for the sub-modules, override this method to change the base name. Defaults to 'GeneratedForms_SubModule_'
       */
      public get SubModuleBaseName(): string { 
        return this.subModule_BaseName;
      }

      protected generateSubModuleEnding(moduleNumber: number): string {
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
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class ${this.SubModuleBaseName}${moduleNumber} { }
    `;
      }
      
      
      protected generateSingleEntityTypeScriptForAngular(entity: EntityInfo, sections: AngularFormSectionInfo[]): string {
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
      
      protected entityHasTopArea(entity: EntityInfo): boolean {
          return entity.Fields.some(f => f.GeneratedFormSectionType === GeneratedFormSectionType.Top);
      }
      protected generateTopAreaHTMLForAngular(entity: EntityInfo): string {
          if (!this.entityHasTopArea(entity)) 
              return '';
          else
              return `<mj-form-section Entity="${entity.Name}" Section="top-area" [record]="record" [EditMode]="this.EditMode"></mj-form-section>`
      } 
      
      protected AddSectionIfNeeded(entity: EntityInfo, sections: AngularFormSectionInfo[], type: GeneratedFormSectionType, name: string) {
          const section = sections.find(s => s.Name === name && s.Type === type);
          const fName = `${this.stripWhiteSpace(name.toLowerCase())}.component`
          if (!section) 
              sections.push({
                  Type: type,
                  Name: name,
                  FileName: `${fName}.ts`,
                  ComponentCode: '',
                  ClassName: `${entity.ClassName}${this.stripWhiteSpace(name)}Component`,
                  TabCode: '',
                  Fields: [],
                  EntityClassName: entity.ClassName,
                  FileNameWithoutExtension: fName
              });
      }
      protected generateAngularAdditionalSections(entity: EntityInfo, startIndex: number): AngularFormSectionInfo[] {
          const sections: AngularFormSectionInfo[] = [];
          let index = startIndex;
          for (const field of entity.Fields) {
              if (field.IncludeInGeneratedForm) {
                  if (field.GeneratedFormSectionType === GeneratedFormSectionType.Category && field.Category && field.Category !== ''  && field.IncludeInGeneratedForm) 
                      this.AddSectionIfNeeded(entity, sections, GeneratedFormSectionType.Category, field.Category);
                  else if (field.GeneratedFormSectionType === GeneratedFormSectionType.Details) 
                      this.AddSectionIfNeeded(entity, sections, GeneratedFormSectionType.Details, "Details");
                  else if (field.GeneratedFormSectionType === GeneratedFormSectionType.Top)
                      this.AddSectionIfNeeded(entity, sections, GeneratedFormSectionType.Top, "Top");
              }
          }
      
          // now we have a distinct list of section names set, generate HTML for each section 
          let sectionIndex = 0;
          for (const section of sections) {
              let sectionName: string = ''
              if (section.Type === GeneratedFormSectionType.Top) {
                  section.TabCode = this.generateTopAreaHTMLForAngular(entity);
                  sectionName = 'top-area'
              }
              else {
                  if (section.Type === GeneratedFormSectionType.Category)
                      sectionName = this.stripWhiteSpace(section.Name.toLowerCase());
                  else if (section.Type === GeneratedFormSectionType.Details)
                      sectionName = 'details';
      
                  section.TabCode = `${sectionIndex++ > 0 ? '\n                    ' : ''}<mj-tab Name="${section.Name}">
                        ${section.Name}
                    </mj-tab>
                    <mj-tab-body>
                        <mj-form-section 
                            Entity="${entity.Name}" 
                            Section="${this.stripWhiteSpace(section.Name.toLowerCase())}" 
                            [record]="record" 
                            [EditMode]="this.EditMode">
                        </mj-form-section>
                    </mj-tab-body>`
              }
      
              const formHTML = this.generateSectionHTMLForAngular(entity, section);
      
              section.ComponentCode = `import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ${entity.ClassName}Entity } from '${entity.SchemaName === mjCoreSchema ? '@memberjunction/core-entities' : 'mj_generatedentities'}';

@RegisterClass(BaseFormSectionComponent, '${entity.Name}.${sectionName}') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-${entity.ClassName.toLowerCase()}-form-${sectionName}',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: \`<div *ngIf="this.record">
    <div class="record-form">
${formHTML}
    </div>
</div>
    \`
})
export class ${entity.ClassName}${this.stripWhiteSpace(section.Name)}Component extends BaseFormSectionComponent {
    @Input() override record!: ${entity.ClassName}Entity;
    @Input() override EditMode: boolean = false;
}

export function Load${entity.ClassName}${this.stripWhiteSpace(section.Name)}Component() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      `
      
              if (section.Type !== GeneratedFormSectionType.Top)
                  index++; // don't increment the tab index for TOP AREA, becuse it won't be rendered as a tab
          }
      
          return sections;
      }
      
      protected generateSectionHTMLForAngular(entity: EntityInfo, section: AngularFormSectionInfo): string {
          let html: string = ''
      
          // figure out which fields will be in this section first
          section.Fields = [];
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
                  }
              }
          }

          // now iterate through the selected fields for the section
          for (const field of section.Fields) {
            let editControl = 'textbox'; // default to textbox
            if (!field.ReadOnly) {
                // first, check to see if we have a ValueListType != None, if so, generate a dropdown. 
                // If value list type is ListOrUserEntry, then generate a combobox, if ValueListType = List, then generate a dropdown
                if (field.ValueListTypeEnum !== EntityFieldValueListType.None) {
                    // build the possible values list
                    if (field.ValueListTypeEnum === EntityFieldValueListType.ListOrUserEntry) {
                        // combo box
                        editControl = `combobox`  
                    }
                    else if (field.ValueListTypeEnum === EntityFieldValueListType.List) {
                        // dropdown
                        editControl = `dropdownlist`  
                    }
                }
                else {
                    // no value list, generate a text box, checkbox, or date picker
                    if (field.TSType === EntityFieldTSType.Boolean)
                        editControl = `checkbox`
                    else if (field.TSType === EntityFieldTSType.Date)
                        editControl = `datepicker`  
                    else if (field.TSType === EntityFieldTSType.Number)
                        editControl = `numerictextbox`
                    else if (field.TSType === EntityFieldTSType.String) {
                        if (field.Length < 0 || field.MaxLength > 100) // length < 0 means nvarchar(max) or similar, so use textarea
                            editControl = `textarea`
                        else
                            editControl = `textbox`
                    }
                }
            }
            if (field.ExtendedType === 'Code') {
              editControl = 'code';
            }

            let linkType = null;
            if (field.RelatedEntity && field.RelatedEntity.length > 0)
                linkType = 'Record'
            else if (field.ExtendedType && field.ExtendedType.length > 0) { 
                switch (field.ExtendedType.trim().toLowerCase()) {
                    case 'url':
                        linkType = 'URL'
                        break;
                    case 'email':
                        linkType = 'Email'
                        break;
                }
            } 
            // next, generate HTML for the field, use fillContainer if we have just one field
            html += `        <mj-form-field ${section.Fields.length === 1 ? 'mjFillContainer' : ''}
            [record]="record"
            [ShowLabel]="${ section.Fields.length > 1 ? 'true' : 'false'}"
            FieldName="${field.CodeName}"
            Type="${editControl}"
            [EditMode]="EditMode"${linkType ? `\n            LinkType="${linkType}"` : ''}
        ></mj-form-field>
`
          }
      
          return html;
      }
      
      protected generateRelatedEntityTabs(entity: EntityInfo, startIndex: number): AngularFormSectionInfo[] {
        const md = new Metadata();
        const tabs: AngularFormSectionInfo[] = [];
        const sortedRelatedEntities = entity.RelatedEntities.filter(re => re.DisplayInForm).sort((a, b) => a.Sequence - b.Sequence); // only show related entities that are marked to display in the form and sort by sequence
        let index = startIndex;
        for (const relatedEntity of sortedRelatedEntities) {
            const tabName: string = relatedEntity.DisplayName ? relatedEntity.DisplayName : relatedEntity.RelatedEntity
            let icon: string = '';
            switch (relatedEntity.DisplayIconType) {
                case 'Custom':
                    if (relatedEntity.DisplayIcon && relatedEntity.DisplayIcon.length > 0)
                        icon = `<span class="${relatedEntity.DisplayIcon} tab-header-icon"></span>`;
                    break;
                case 'Related Entity Icon':
                    const re: EntityInfo = md.Entities.find(e => e.ID === relatedEntity.RelatedEntityID)
                    if (re && re.Icon && re.Icon.length > 0)
                        icon = `<span class="${re.Icon} tab-header-icon"></span>`;
                    break;
                default:
                    // none
                    break;
            }

            const tabCode = `${index > 0 ? '\n' : ''}                    <mj-tab Name="${tabName}" 
                        [Visible]="record.IsSaved" 
                        [Props]="{EntityRelationshipID: ${relatedEntity.ID}}">
                        ${icon}${tabName}
                    </mj-tab>
                    <mj-tab-body>
                        <mj-user-view-grid 
                            [Params]="BuildRelationshipViewParamsByEntityName('${relatedEntity.RelatedEntity}')"  
                            [NewRecordValues]="NewRecordValues('${relatedEntity.RelatedEntity}')"
                            [AllowLoad]="IsCurrentTab('${tabName}')"  
                            [EditMode]="GridEditMode()"  
                            [BottomMargin]="GridBottomMargin">
                        </mj-user-view-grid>
                    </mj-tab-body>`
            tabs.push({
                Type: GeneratedFormSectionType.Category,
                IsRelatedEntity: true,
                RelatedEntityDisplayLocation: relatedEntity.DisplayLocation,
                Name: tabName,
                TabCode: tabCode
            })
            index++;
        }

        return tabs;
      }
      
      protected stripWhiteSpace(s: string): string {
          return s.replace(/\s/g, '');
      }
      
      protected generateSingleEntityHTMLForAngular(entity: EntityInfo): {htmlCode: string, sections: AngularFormSectionInfo[]} {
          const topArea = this.generateTopAreaHTMLForAngular(entity);
          const additionalSections = this.generateAngularAdditionalSections(entity, 0);
          // calc ending index for additional sections so we can pass taht into the related entity tabs because they need to start incrementally up from there...
          const endingIndex = additionalSections && additionalSections.length ? (topArea && topArea.length > 0 ? additionalSections.length - 1 : additionalSections.length) : 0;
          const relatedEntitySections = this.generateRelatedEntityTabs(entity, endingIndex);
          const htmlCode = topArea.length > 0 ? this.generateSingleEntityHTMLWithSplitterForAngular(topArea, additionalSections, relatedEntitySections) : 
                                                this.generateSingleEntityHTMLWithOUTSplitterForAngular(topArea, additionalSections, relatedEntitySections);
          return {htmlCode, sections: additionalSections};
      }
      
      
      protected generateSingleEntityHTMLWithSplitterForAngular(topArea, additionalSections: AngularFormSectionInfo[], relatedEntitySections: AngularFormSectionInfo[]): string {
          const htmlCode: string =  `<div class="record-form-container" mjFillContainer [bottomMargin]="20" [rightMargin]="5">
    <form *ngIf="record" class="record-form"  #form="ngForm" mjFillContainer>
        <mj-form-toolbar [form]="this"></mj-form-toolbar>
        <kendo-splitter orientation="vertical" (layoutChange)="splitterLayoutChange()" mjFillContainer>
            <kendo-splitter-pane [collapsible]="true" [size]="TopAreaHeight">
${this.innerTopAreaHTML(topArea)}
            </kendo-splitter-pane>
            <kendo-splitter-pane>
${this.innerTabStripHTML(additionalSections, relatedEntitySections)}
            </kendo-splitter-pane>
        </kendo-splitter>
    </form>
</div>
        `
          return htmlCode;
      }
      
      protected innerTopAreaHTML(topArea: string): string {
        if (topArea.trim().length === 0)
            return '';
        else
      return `                <div #topArea class="record-form-group">
                    ${topArea}
                </div>`
      }
      protected innerTabStripHTML(additionalSections: AngularFormSectionInfo[], relatedEntitySections: AngularFormSectionInfo[]): string {
        // come up with the overall order by looking for the tabs that have DisplayLocation === 'Before Field Tabs' and put those, in sequence order
        // ahead of the additionalSections, then do the additionalSections, and then do the relatedEntitySections
        const relatedEntityBeforeFieldTabs = relatedEntitySections.filter(s => s.RelatedEntityDisplayLocation === 'Before Field Tabs');
        const relatedEntityAfterFieldTabs = relatedEntitySections.filter(s => s.RelatedEntityDisplayLocation === 'After Field Tabs');

      return `                <mj-tabstrip (TabSelected)="onTabSelect($event.index)" mjFillContainer>
                    ${relatedEntityBeforeFieldTabs ? relatedEntityBeforeFieldTabs.map(s => s.TabCode).join('\n') : ''}
                    ${additionalSections ? additionalSections.filter(s => s.Type !== GeneratedFormSectionType.Top).map(s => s.TabCode).join('\n               ') : ''}
                    ${relatedEntityAfterFieldTabs ? relatedEntityAfterFieldTabs.map(s => s.TabCode).join('\n') : ''}
                </mj-tabstrip>`
      }
      
      protected generateSingleEntityHTMLWithOUTSplitterForAngular(topArea, additionalSections: AngularFormSectionInfo[], relatedEntitySections: AngularFormSectionInfo[]): string {
          const htmlCode: string =  `<div class="record-form-container" mjFillContainer [bottomMargin]="20" [rightMargin]="5">
    <form *ngIf="record" class="record-form"  #form="ngForm" mjFillContainer>
        <mj-form-toolbar [form]="this"></mj-form-toolbar>
${this.innerTopAreaHTML(topArea)}
${this.innerTabStripHTML(additionalSections, relatedEntitySections)}
    </form>
</div>
        `
          return htmlCode;
      }
}
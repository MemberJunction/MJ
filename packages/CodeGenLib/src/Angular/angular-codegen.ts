import { EntityInfo, EntityFieldInfo, GeneratedFormSectionType, EntityFieldTSType, EntityFieldValueListType, Metadata, UserInfo, EntityRelationshipInfo } from '@memberjunction/core';
import { logError, logStatus } from '../Misc/status_logging';
import fs from 'fs';
import path from 'path';
import { mjCoreSchema, outputOptionValue } from '../Config/config';
import { GenerationResult, RelatedEntityDisplayComponentGeneratorBase } from './related-entity-components';
import { sortBySequenceAndCreatedAt } from '../Misc/util';

/**
 * Represents metadata about an Angular form section that is generated for an entity
 */
export class AngularFormSectionInfo {
    /**
     * The type of form section (e.g., Top, Category, Details)
     */
    Type!: GeneratedFormSectionType;

    /**
     * The display name of the section
     */
    Name!: string;

    /**
     * The generated HTML code for the section (panel or tab)
     */
    TabCode!: string;
    
    /**
     * The TypeScript class name for the section component
     */
    ClassName?: string;
    
    /**
     * The filename where the section component will be saved
     */
    FileName?: string;
    
    /**
     * The complete TypeScript component code for the section
     */
    ComponentCode?: string;
    
    /**
     * Array of entity fields that belong to this section
     */
    Fields?: EntityFieldInfo[];
    
    /**
     * The filename without the .ts extension
     */
    FileNameWithoutExtension?: string;
    
    /**
     * The class name of the entity this section belongs to
     */
    EntityClassName?: string;
    
    /**
     * Indicates if this section represents a related entity tab
     */
    IsRelatedEntity?: boolean = false;
    
    /**
     * Specifies where related entity tabs should be displayed relative to field tabs
     */
    RelatedEntityDisplayLocation?: 'Before Field Tabs' | 'After Field Tabs' = 'After Field Tabs'
    
    /**
     * The generation result for related entity components
     */
    GeneratedOutput?: GenerationResult;

    /**
     * The minimum sequence number from fields in this section (used for sorting)
     */
    MinSequence?: number;
}

/**
 * Base class for generating Angular client code for MemberJunction entities.
 * This class handles the generation of Angular components, forms, and modules based on entity metadata.
 * You can sub-class this class to create your own Angular client code generator logic.
 */
export class AngularClientGeneratorBase {
    /**
     * Main entry point for generating Angular code for a collection of entities
     * @param entities Array of EntityInfo objects to generate Angular code for
     * @param directory The output directory where generated files will be saved
     * @param modulePrefix A prefix to use for the generated module name
     * @param contextUser The user context for permission checking and personalization
     * @returns Promise<boolean> True if generation was successful, false otherwise
     */
    public async generateAngularCode(entities: EntityInfo[], directory: string, modulePrefix: string, contextUser: UserInfo): Promise<boolean> {
        try {
          const entityPath = path.join(directory, 'Entities');
          //const classMapEntries: string[] = [];
          const componentImports: string[] = [];
          const relatedEntityModuleImports: {library: string, modules: string[]}[] = [];
          const componentNames: {
                                    componentName: string, 
                                    relatedEntityItemsRequired: {itemClassName: string, moduleClassName: string}[] 
                                }[] = [];
          const sections: AngularFormSectionInfo[] = [];
      
          if (!fs.existsSync(entityPath))
              fs.mkdirSync(entityPath, { recursive: true }); // create the directory if it doesn't exist
      
          for (let i:number = 0; i < entities.length; ++i) {
              const entity = entities[i];
      
              if (entity.PrimaryKeys && entity.PrimaryKeys.length > 0 && entity.IncludeInAPI) {
                  const thisEntityPath = path.join(entityPath, entity.ClassName);
                  if (!fs.existsSync(thisEntityPath))
                      fs.mkdirSync(thisEntityPath, { recursive: true }); // create the directory if it doesn't exist
      
                  const { htmlCode, additionalSections, relatedEntitySections } = await this.generateSingleEntityHTMLForAngular(entity, contextUser)
                  const tsCode = this.generateSingleEntityTypeScriptForAngular(entity, additionalSections, relatedEntitySections)
      
                  fs.writeFileSync(path.join(thisEntityPath, `${entity.ClassName.toLowerCase()}.form.component.ts`), tsCode);
                  fs.writeFileSync(path.join(thisEntityPath, `${entity.ClassName.toLowerCase()}.form.component.html`), htmlCode);
      
                  if (additionalSections.length > 0) {
                      const sectionPath = path.join(thisEntityPath, 'sections');
                      if (!fs.existsSync(sectionPath))
                          fs.mkdirSync(sectionPath, { recursive: true }); // create the directory if it doesn't exist

                      for (let j:number = 0; j < additionalSections.length; ++j) {
                          const section = additionalSections[j];
                          // Only write file if FileName and ComponentCode are populated
                          if (section.FileName && section.ComponentCode) {
                              fs.writeFileSync(path.join(sectionPath, section.FileName), section.ComponentCode);
                          }
                          sections.push(section); // add the entity's secitons one by one to the master/global list of sections
                      }
                  }
      
                  const componentName: string = `${entity.ClassName}FormComponent`;
                  componentImports.push (`import { ${componentName}, Load${componentName} } from "./Entities/${entity.ClassName}/${entity.ClassName.toLowerCase()}.form.component";`);
                  const currentComponentDistinctRelatedEntityClassNames: {itemClassName: string, moduleClassName: string}[] = [];
                  relatedEntitySections.forEach(s => s.GeneratedOutput!.Component!.ImportItems.forEach(i => {
                    if (!currentComponentDistinctRelatedEntityClassNames.find(ii => ii.itemClassName === i.ClassName))
                        currentComponentDistinctRelatedEntityClassNames.push({itemClassName: i.ClassName, moduleClassName: i.ModuleName});
                  }))

                  componentNames.push({
                    componentName: componentName, 
                    relatedEntityItemsRequired: currentComponentDistinctRelatedEntityClassNames,
                  });

                  // go through all related entities used by this component and add them to the relatedEntityModuleImports array, but distinct for the library and the module names within the library
                  relatedEntitySections.forEach(s => {
                    let match = relatedEntityModuleImports.find(m => m.library === s.GeneratedOutput!.Component!.ImportPath)
                      if (!match) {
                        match = {library: s.GeneratedOutput!.Component!.ImportPath, modules: []};
                        relatedEntityModuleImports.push(match);
                      }
                      s.GeneratedOutput!.Component!.ImportItems.forEach(i => {
                        if (!match.modules.includes(i.ModuleName))
                            match.modules.push(i.ModuleName);
                      });
                  });

                  // now the imports are good
              }
              else {
                  logStatus(`   Entity ${entity.Name} does not have a primary key or is not included in the API, skipping code generation for this entity`);
              }
          }
      
          const maxComponentsPerModule = outputOptionValue('Angular', 'maxComponentsPerModule', 25);
      
          const moduleCode = this.generateAngularModule(componentImports, componentNames, relatedEntityModuleImports, sections, modulePrefix, maxComponentsPerModule);
          fs.writeFileSync(path.join(directory, 'generated-forms.module.ts'), moduleCode);
      
          return true;
        } 
        catch (err) {
          logError(err as string);
          return false;
        }
      }
       
      
      /**
       * Generates the main Angular module that imports all generated components and sub-modules
       * @param componentImports Array of import statements for generated components
       * @param componentNames Array of component names with their required related entity items
       * @param relatedEntityModuleImports Array of library imports for related entity modules
       * @param sections Array of form section information
       * @param modulePrefix Prefix for the module name
       * @param maxComponentsPerModule Maximum number of components to include in each sub-module (default: 25)
       * @returns The generated TypeScript code for the Angular module
       */
      protected generateAngularModule(componentImports: string[], 
                                      componentNames: {componentName: string, relatedEntityItemsRequired: {itemClassName: string, moduleClassName: string}[]}[], 
                                      relatedEntityModuleImports: {library: string, modules: string[]}[], 
                                      sections: AngularFormSectionInfo[], 
                                      modulePrefix: string, 
                                      maxComponentsPerModule: number = 25): string {
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
${sections.filter(s => !s.IsRelatedEntity && s.ClassName && s.EntityClassName && s.FileNameWithoutExtension).map(s => `import { ${s.ClassName}, Load${s.ClassName} } from "./Entities/${s.EntityClassName}/sections/${s.FileNameWithoutExtension}"`).join('\n')}
${
    relatedEntityModuleImports.filter(remi => remi.library.trim().toLowerCase() !== '@memberjunction/ng-user-view-grid' )
                                 .map(remi => `import { ${remi.modules.map(m => m).join(', ')} } from "${remi.library}"`)
                                .join('\n')
}   
${moduleCode}
    
export function Load${modulePrefix}GeneratedForms() {
    // This function doesn't do much, but it calls each generated form's loader function
    // which in turn calls the sections for that generated form. Ultimately, those bits of 
    // code do NOTHING - the point is to prevent the code from being eliminated during tree shaking
    // since it is dynamically instantiated on demand, and the Angular compiler has no way to know that,
    // in production builds tree shaking will eliminate the code unless we do this
    ${componentNames.map(c => `Load${c.componentName}();`).join('\n    ')}
    ${sections.filter(s => !s.IsRelatedEntity && s.ClassName).map(s => `Load${s.ClassName}();`).join('\n    ')}
}
    `
      }
      
      /**
       * Generates sub-modules to handle large numbers of components by breaking them into smaller chunks
       * @param componentNames Array of component names with their required related entity items
       * @param sections Array of form section information
       * @param maxComponentsPerModule Maximum components per sub-module
       * @param modulePrefix Prefix for module naming
       * @returns Generated TypeScript code for all sub-modules and the master module
       */
      protected generateAngularModuleCode(componentNames: {componentName: string, relatedEntityItemsRequired: {itemClassName: string, moduleClassName: string}[]}[], 
                                          sections: AngularFormSectionInfo[], 
                                          maxComponentsPerModule: number, 
                                          modulePrefix: string): string {
          // this function breaks up the componentNames and sections up, we only want to have a max of maxComponentsPerModule components per module (of components and/or sections, doesn't matter)
          // so, we break up the list of components into sub-modules, and then generate the code for each sub-module
          
          // iterate through the componentNames first, then after we've exhausted those, then iterate through the sections
          const simpleComponentNames = componentNames.map(c => c.componentName);
          const combinedArray: string[] = simpleComponentNames.concat(sections.filter(s => s.ClassName).map(s => s.ClassName!));
          const subModules: string[] = [];
          let currentComponentCount: number = 0;
          const subModuleStarter: string =   `
@NgModule({
declarations: [
`
        let currentSubModuleCode: string = subModuleStarter;
    
        // loop through the combined array which is the combination of the componentNames and the sections
        let currentSubModuleAdditionalModulesToImport: string[] = [];
        for (let i: number = 0; i < combinedArray.length; ++i) {
            currentSubModuleCode += (currentComponentCount === 0 ? '' : ',\n') +  '    ' + combinedArray[i]; // prepend a comma if this isn't the first component in the module
            // lookup the componentName and see if we have any relatedEntityItemsRequired, if so, add them to the currentSubModuleAdditionalModulesToImport array
            const relatedEntityItemsRequired = componentNames.find(c => c.componentName === combinedArray[i])?.relatedEntityItemsRequired;
            if (relatedEntityItemsRequired && relatedEntityItemsRequired.length > 0) {
                relatedEntityItemsRequired.forEach(r => {
                    if (!currentSubModuleAdditionalModulesToImport.includes(r.moduleClassName))
                        currentSubModuleAdditionalModulesToImport.push(r.moduleClassName);
                });
            }
            if ((currentComponentCount === maxComponentsPerModule - 1) || (i === combinedArray.length - 1)) {
                // we have reached the max number of components for this module, so generate the module code and reset the counters
                currentSubModuleCode += this.generateSubModuleEnding(subModules.length, currentSubModuleAdditionalModulesToImport);
                subModules.push(currentSubModuleCode);
                currentSubModuleCode = subModuleStarter; // reset
                currentSubModuleAdditionalModulesToImport = []; // reset
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
      
      /**
       * Base name used for generating sub-module names
       * @protected
       */
      protected subModule_BaseName: string = 'GeneratedForms_SubModule_';
      
      /**
       * Get the base name for the sub-modules. Override this method to change the base name.
       * @returns The base name for sub-modules (default: 'GeneratedForms_SubModule_')
       */
      public get SubModuleBaseName(): string { 
        return this.subModule_BaseName;
      }

      /**
       * Generates the closing section of a sub-module including imports and exports
       * @param moduleNumber The sequential number of this sub-module
       * @param additionalModulesToImport Array of additional module names to import
       * @returns TypeScript code for the sub-module ending
       */
      protected generateSubModuleEnding(moduleNumber: number, additionalModulesToImport: string[]): string {
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
    ComboBoxModule${additionalModulesToImport.length > 0 ? ',\n    ' + additionalModulesToImport.join(',\n    ') : ''}
],
exports: [
]
})
export class ${this.SubModuleBaseName}${moduleNumber} { }
    `;
      }
      
      
      /**
       * Generates the TypeScript component code for a single entity
       * @param entity The entity to generate the component for
       * @param additionalSections Array of additional form sections for this entity
       * @param relatedEntitySections Array of related entity sections
       * @returns Generated TypeScript component code
       */
      protected generateSingleEntityTypeScriptForAngular(entity: EntityInfo, additionalSections: AngularFormSectionInfo[], relatedEntitySections: AngularFormSectionInfo[]): string {
        const entityObjectClass: string = entity.ClassName

        // next, build a list of distinct imports at the library level and for components within the library
        const libs: {lib: string, items: string[]}[] = relatedEntitySections.length > 0 ? relatedEntitySections.filter(s => s.GeneratedOutput && s.GeneratedOutput.Component && s.GeneratedOutput.Component.ImportPath)
                                                                                                                  .map(s => {
                                                                                                                                return {
                                                                                                                                    lib: s.GeneratedOutput!.Component!.ImportPath,
                                                                                                                                    items: []
                                                                                                                                }
                                                                                                                            }
                                                                                                                        ) : [];
        const distinctLibs: {lib: string, items: string[]}[] = [];
        libs.forEach(l => {
            if (!distinctLibs.find(ll => ll.lib === l.lib))
                distinctLibs.push(l);
        });
        // now we have a list of distinct libraries, next we go through all the ITEMS and add them to the appropriate library but make sure to keep those items distinct too
        relatedEntitySections.filter(s => s.GeneratedOutput && s.GeneratedOutput.Component && s.GeneratedOutput.Component.ImportItems)
                            .forEach(s => {
                                const lib = distinctLibs.find(l => l.lib === s.GeneratedOutput!.Component!.ImportPath);
                                if (lib) {
                                    s.GeneratedOutput!.Component!.ImportItems.forEach(i => {
                                        if (!lib.items.includes(i.ClassName))
                                            lib.items.push(i.ClassName);
                                    });
                                }
                            });

        // now our libs array is good to go, we can generate the import statements for the libraries and the items within the libraries
        const generationImports: string = distinctLibs.map(l => `import { ${l.items.join(", ")} } from "${l.lib}"`).join('\n');
        const generationInjectedCode: string = relatedEntitySections.length > 0 ?
                                                        relatedEntitySections.filter(s => s.GeneratedOutput && s.GeneratedOutput!.CodeOutput!.length > 0)
                                                                                .map(s => s.GeneratedOutput!.CodeOutput!.split("\n").map(l => `    ${l}`).join("\n")).join('\n') : '';

        // Generate sectionsExpanded state object for collapsible panels (both field sections and related entities)
        const sectionsWithoutTop = additionalSections.filter(s => s.Type !== GeneratedFormSectionType.Top && s.Name);
        const allSections = [...sectionsWithoutTop, ...relatedEntitySections];
        const sectionsExpandedEntries = allSections.map((s, index) => {
            const sectionKey = this.camelCase(s.Name);
            // First 2 sections expanded by default, metadata and related entities collapsed
            const isExpanded = index < 2 && !s.Name.toLowerCase().includes('metadata') && !s.IsRelatedEntity;
            return `        ${sectionKey}: ${isExpanded}`;
        });
        const sectionsExpandedObject = sectionsExpandedEntries.length > 0
            ? `\n\n    // Collapsible section state\n    public sectionsExpanded = {\n${sectionsExpandedEntries.join(',\n')}\n    };`
            : '';

        const toggleSectionMethod = sectionsExpandedEntries.length > 0
            ? `\n\n    public toggleSection(section: keyof typeof this.sectionsExpanded): void {\n        this.sectionsExpanded[section] = !this.sectionsExpanded[section];\n    }`
            : '';

        // Add expand all/collapse all/filter methods if there are 4+ sections
        const totalSections = allSections.length;
        const sectionUtilityMethods = totalSections >= 4 ? `\n
    public expandAllSections(): void {
        Object.keys(this.sectionsExpanded).forEach(key => {
            this.sectionsExpanded[key as keyof typeof this.sectionsExpanded] = true;
        });
    }

    public collapseAllSections(): void {
        Object.keys(this.sectionsExpanded).forEach(key => {
            this.sectionsExpanded[key as keyof typeof this.sectionsExpanded] = false;
        });
    }

    public getExpandedCount(): number {
        return Object.values(this.sectionsExpanded).filter(v => v === true).length;
    }

    public filterSections(event: Event): void {
        const searchTerm = (event.target as HTMLInputElement).value.toLowerCase();
        const panels = document.querySelectorAll('.form-card.collapsible-card');

        panels.forEach((panel: Element) => {
            const sectionName = panel.getAttribute('data-section-name') || '';
            if (sectionName.includes(searchTerm)) {
                panel.classList.remove('search-hidden');
            } else {
                panel.classList.add('search-hidden');
            }
        });
    }` : '';

        return `import { Component } from '@angular/core';
import { ${entityObjectClass}Entity } from '${entity.SchemaName === mjCoreSchema ? '@memberjunction/core-entities' : 'mj_generatedentities'}';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
${generationImports.length > 0 ? generationImports + '\n' : ''}
@RegisterClass(BaseFormComponent, '${entity.Name}') // Tell MemberJunction about this class
@Component({
    selector: 'gen-${entity.ClassName.toLowerCase()}-form',
    templateUrl: './${entity.ClassName.toLowerCase()}.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ${entity.ClassName}FormComponent extends BaseFormComponent {
    public record!: ${entityObjectClass}Entity;${generationInjectedCode.length > 0 ? '\n' + generationInjectedCode : ''}${sectionsExpandedObject}${toggleSectionMethod}${sectionUtilityMethods}
}

export function Load${entity.ClassName}FormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
`
      }
      
      /**
       * Checks if an entity has any fields designated for the top area section
       * @param entity The entity to check
       * @returns True if the entity has top area fields, false otherwise
       */
      protected entityHasTopArea(entity: EntityInfo): boolean {
          return entity.Fields.some(f => f.GeneratedFormSectionType === GeneratedFormSectionType.Top);
      }
      /**
       * Generates HTML for the top area section of an entity form
       * @param entity The entity to generate top area HTML for
       * @returns HTML string for the top area section, or empty string if no top area exists
       */
      protected generateTopAreaHTMLForAngular(entity: EntityInfo): string {
          if (!this.entityHasTopArea(entity)) 
              return '';
          else
              return `<mj-form-section Entity="${entity.Name}" Section="top-area" [record]="record" [EditMode]="this.EditMode"></mj-form-section>`
      } 
      
      /**
       * Adds a new section to the sections array if it doesn't already exist
       * @param entity The entity the section belongs to
       * @param sections Array of existing sections
       * @param type The type of section to add
       * @param name The name of the section
       * @param fieldSequence Optional sequence number of the field (used to track minimum sequence for sorting)
       */
      protected AddSectionIfNeeded(entity: EntityInfo, sections: AngularFormSectionInfo[], type: GeneratedFormSectionType, name: string, fieldSequence?: number) {
          const section = sections.find(s => s.Name === name && s.Type === type);
          const fName = `${this.stripWhiteSpace(name.toLowerCase())}.component`
          if (!section) {
              sections.push({
                  Type: type,
                  Name: name,
                  FileName: `${fName}.ts`,
                  ComponentCode: '',
                  ClassName: `${entity.ClassName}${this.stripWhiteSpace(name)}Component`,
                  TabCode: '',
                  Fields: [],
                  EntityClassName: entity.ClassName,
                  FileNameWithoutExtension: fName,
                  MinSequence: fieldSequence
              });
          } else if (fieldSequence != null && (section.MinSequence == null || fieldSequence < section.MinSequence)) {
              // Update the minimum sequence if this field has a lower sequence
              section.MinSequence = fieldSequence;
          }
      }
      /**
       * Generates additional form sections based on entity field metadata
       * @param entity The entity to generate sections for
       * @param startIndex Starting index for tab ordering
       * @param categoryIcons Optional map of category names to Font Awesome icon classes
       * @returns Array of generated form sections
       */
      protected generateAngularAdditionalSections(entity: EntityInfo, startIndex: number, categoryIcons?: Record<string, string>): AngularFormSectionInfo[] {
          const sections: AngularFormSectionInfo[] = [];
          let index = startIndex;
          const sortedFields = sortBySequenceAndCreatedAt(entity.Fields);
          for (const field of sortedFields) {
              if (field.IncludeInGeneratedForm) {
                  if (field.GeneratedFormSectionType === GeneratedFormSectionType.Category && field.Category && field.Category !== ''  && field.IncludeInGeneratedForm)
                      this.AddSectionIfNeeded(entity, sections, GeneratedFormSectionType.Category, field.Category, field.Sequence);
                  else if (field.GeneratedFormSectionType === GeneratedFormSectionType.Details)
                      this.AddSectionIfNeeded(entity, sections, GeneratedFormSectionType.Details, "Details", field.Sequence);
                  else if (field.GeneratedFormSectionType === GeneratedFormSectionType.Top)
                      this.AddSectionIfNeeded(entity, sections, GeneratedFormSectionType.Top, "Top", field.Sequence);
              }
          }

          // Sort sections by minimum sequence (Top sections first, then by MinSequence)
          sections.sort((a, b) => {
              if (a.Type === GeneratedFormSectionType.Top) return -1;
              if (b.Type === GeneratedFormSectionType.Top) return 1;
              const aSeq = a.MinSequence ?? Number.MAX_SAFE_INTEGER;
              const bSeq = b.MinSequence ?? Number.MAX_SAFE_INTEGER;
              return aSeq - bSeq;
          });

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

                  // Generate collapsible panel HTML inline instead of using separate components
                  const formHTML = this.generateSectionHTMLForAngular(entity, section);
                  // Use category-specific icon from LLM if available, otherwise fall back to keyword matching
                  const icon = (categoryIcons && categoryIcons[section.Name]) || this.getIconForCategory(section.Name);
                  const sectionKey = this.camelCase(section.Name);
                  // First 2 sections expanded by default, metadata collapsed
                  const isExpanded = sectionIndex < 2 && !section.Name.toLowerCase().includes('metadata');

                  section.TabCode = `${sectionIndex > 0 ? '\n        ' : ''}<!-- ${section.Name} Section -->
        <div class="form-card collapsible-card" data-section-name="${section.Name.toLowerCase()}">
            <div class="collapsible-header" (click)="toggleSection('${sectionKey}')" role="button" tabindex="0">
                <div class="collapsible-title">
                    <i class="${icon}"></i>
                    <h3>${section.Name}</h3>
                </div>
                <div class="collapse-icon">
                    <i [class]="sectionsExpanded.${sectionKey} ? 'fa fa-chevron-up' : 'fa fa-chevron-down'"></i>
                </div>
            </div>
            <div class="collapsible-body" [class.collapsed]="!sectionsExpanded.${sectionKey}">
                <div class="form-body">
${formHTML}
                </div>
            </div>
        </div>`

                  sectionIndex++;
              }

              // We no longer need separate component files for sections - everything is inline
              section.ComponentCode = undefined;
              section.FileName = undefined;
              section.ClassName = undefined;
              section.FileNameWithoutExtension = undefined;

              if (section.Type !== GeneratedFormSectionType.Top)
                  index++; // don't increment the tab index for TOP AREA, becuse it won't be rendered as a tab
          }

          return sections;
      }
      
      /**
       * Generates HTML for a specific form section
       * @param entity The entity containing the fields
       * @param section The section to generate HTML for
       * @returns HTML string for the form section
       */
      protected generateSectionHTMLForAngular(entity: EntityInfo, section: AngularFormSectionInfo): string {
          let html: string = ''
      
          // figure out which fields will be in this section first
          section.Fields = [];
          const sortedFields = sortBySequenceAndCreatedAt(entity.Fields);
          for (const field of sortedFields) {
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
            let linkComponentType = null;
            if (field.RelatedEntity && field.RelatedEntity.length > 0) {
                linkType = 'Record'
                linkComponentType = `\n            LinkComponentType="${field.RelatedEntityDisplayType}"`
            }
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
            html += `        <mj-form-field ${section.Fields.length === 1 ? '' : ''}
            [record]="record"
            [ShowLabel]="${ section.Fields.length > 1 ? 'true' : 'false'}"
            FieldName="${field.CodeName}"
            Type="${editControl}"
            [EditMode]="EditMode"${linkType ? `\n            LinkType="${linkType}"` : ''}${linkComponentType ? linkComponentType : ''}
        ></mj-form-field>
`
          }
      
          return html;
      }

      /**
       * Generates the tab name for a related entity tab. Appends the field's display name to the tab name 
       * if there are multiple tabs for the same related entity to differentiate them.
       * @param relatedEntity The relationship information for the related entity
       * @param sortedRelatedEntities All related entities sorted by sequence
       * @returns The generated tab name
       */
      protected generateRelatedEntityTabName(relatedEntity: EntityRelationshipInfo, sortedRelatedEntities: EntityRelationshipInfo[]): string {  
        if (relatedEntity.DisplayName && relatedEntity.DisplayName.length > 0) {
            // the metadata has a display name for the related entity, so use that without any changes
            return relatedEntity.DisplayName;
        }
        else {
            let tabName = relatedEntity.RelatedEntity;
            
            // check to see if we have > 1 related entities for this entity for the current RelatedEntityID 
            const relationships = sortedRelatedEntities.filter(re => re.RelatedEntityID === relatedEntity.RelatedEntityID);
            if (relationships.length > 1) {
                // we have more than one related entity for this entity, so we need to append the field name to the tab name
                let fkeyField = relatedEntity.RelatedEntityJoinField;
                if (fkeyField) {
                    // if the fkeyField has wrapping [] then remove them
                    fkeyField = fkeyField.trim().replace('[', '').replace(']', '');
    
                    // let's get the actual entityInfo for the related entity so we can get the field and see if it has a display name
                    const md = new Metadata();
                    const re = md.EntityByID(relatedEntity.RelatedEntityID);
                    const f = re.Fields.find(f => f.Name.trim().toLowerCase() === fkeyField.trim().toLowerCase());
                    if (f)
                        tabName += ` (${f.DisplayNameOrName})`
                }
            }
            return tabName;    
        }
      }
      
      /**
       * Generates tabs for all related entities that should be displayed in the form
       * @param entity The parent entity
       * @param startIndex Starting index for tab ordering
       * @param contextUser User context for permission checking
       * @returns Promise resolving to array of related entity tab sections
       */
      protected async generateRelatedEntityTabs(entity: EntityInfo, startIndex: number, contextUser: UserInfo): Promise<AngularFormSectionInfo[]> {
        const md = new Metadata();
        const tabs: AngularFormSectionInfo[] = [];
        // Sort related entities by Sequence (user's explicit ordering), then by RelatedEntity name (stable tiebreaker)
        const sortedRelatedEntities = entity.RelatedEntities
            .filter(re => re.DisplayInForm)
            .sort((a, b) => {
                if (a.Sequence !== b.Sequence) {
                    return a.Sequence - b.Sequence;
                }
                return a.RelatedEntity.localeCompare(b.RelatedEntity);
            });
        let index = startIndex;
        for (const relatedEntity of sortedRelatedEntities) {
            const tabName: string = this.generateRelatedEntityTabName(relatedEntity, sortedRelatedEntities)
            
            let icon: string = '';
            switch (relatedEntity.DisplayIconType) {
                case 'Custom':
                    if (relatedEntity.DisplayIcon && relatedEntity.DisplayIcon.length > 0)
                        icon = `<span class="${relatedEntity.DisplayIcon} tab-header-icon"></span>`;
                    break;
                case 'Related Entity Icon':
                    const re: EntityInfo | undefined = md.Entities.find(e => e.ID === relatedEntity.RelatedEntityID)
                    if (re && re.Icon && re.Icon.length > 0)
                        icon = `<span class="${re.Icon} tab-header-icon"></span>`;
                    break;
                default:
                    // none
                    break;
            }

            const component = await RelatedEntityDisplayComponentGeneratorBase.GetComponent(relatedEntity, contextUser);
            const generateResults = await component.Generate({
                Entity: entity,
                RelationshipInfo: relatedEntity,
                TabName: tabName
            });
            // Add proper indentation for collapsible panel body
            const componentCodeWithIndent = generateResults.TemplateOutput.split('\n').map(l => `                    ${l}`).join('\n')

            // Generate collapsible panel HTML for related entity
            const sectionKey = this.camelCase(tabName);
            const iconClass = icon ? icon.match(/class="([^"]+)"/)?.[1] || 'fa fa-table' : 'fa fa-table';

            const tabCode = `${index > 0 ? '\n        ' : ''}<!-- ${tabName} Section -->
        <div class="form-card collapsible-card related-entity" data-section-name="${tabName.toLowerCase()}">
            <div class="collapsible-header" (click)="toggleSection('${sectionKey}')" role="button" tabindex="0">
                <div class="collapsible-title">
                    <i class="${iconClass}"></i>
                    <h3>${tabName}</h3>
                </div>
                <div class="collapse-icon">
                    <i [class]="sectionsExpanded.${sectionKey} ? 'fa fa-chevron-up' : 'fa fa-chevron-down'"></i>
                </div>
            </div>
            <div class="collapsible-body" [class.collapsed]="!sectionsExpanded.${sectionKey}" *ngIf="record.IsSaved">
                <div class="form-body">
${componentCodeWithIndent}
                </div>
            </div>
        </div>`

            tabs.push({
                Type: GeneratedFormSectionType.Category,
                IsRelatedEntity: true,
                RelatedEntityDisplayLocation: relatedEntity.DisplayLocation,
                Name: tabName,
                TabCode: tabCode,
                GeneratedOutput: generateResults,
                EntityClassName: entity.ClassName,
            })
            index++;
        }

        return tabs;
      }
      
      /**
       * Removes all whitespace from a string
       * @param s The string to process
       * @returns String with all whitespace removed
       */
      protected stripWhiteSpace(s: string): string {
          return s.replace(/\s/g, '');
      }

      /**
       * Converts a string to camelCase and sanitizes it for use as a JavaScript identifier
       * @param str The string to convert
       * @returns String in camelCase format, safe for use as object key or variable name
       */
      protected camelCase(str: string): string {
          // First, replace non-alphanumeric characters (except spaces) with spaces
          let sanitized = str.replace(/[^a-zA-Z0-9\s]/g, ' ');

          // Convert to camelCase
          let result = sanitized
              .replace(/\s(.)/g, (match, char) => char.toUpperCase())
              .replace(/\s/g, '')
              .replace(/^(.)/, (match, char) => char.toLowerCase());

          // If starts with a digit, prefix with underscore
          if (/^\d/.test(result)) {
              result = '_' + result;
          }

          // If result is empty (all special chars), use a default
          if (result.length === 0) {
              result = 'section';
          }

          return result;
      }

      /**
       * Maps category names to appropriate Font Awesome icon classes
       * @param category The category name to map
       * @returns Font Awesome icon class string
       */
      protected getIconForCategory(category: string): string {
          const lowerCategory = category.toLowerCase();

          // Address/Location categories
          if (lowerCategory.includes('address') || lowerCategory.includes('location')) {
              return 'fa fa-map-marker-alt';
          }
          // Contact Information
          if (lowerCategory.includes('contact')) {
              return 'fa fa-address-card';
          }
          // Financial/Pricing categories
          if (lowerCategory.includes('pric') || lowerCategory.includes('cost') ||
              lowerCategory.includes('payment') || lowerCategory.includes('financial') ||
              lowerCategory.includes('billing')) {
              return 'fa fa-dollar-sign';
          }
          // Date/Time categories
          if (lowerCategory.includes('date') || lowerCategory.includes('time') ||
              lowerCategory.includes('schedule')) {
              return 'fa fa-calendar';
          }
          // Status/State categories
          if (lowerCategory.includes('status') || lowerCategory.includes('state')) {
              return 'fa fa-flag';
          }
          // Metadata/Technical categories
          if (lowerCategory.includes('metadata') || lowerCategory.includes('technical') ||
              lowerCategory.includes('system')) {
              return 'fa fa-cog';
          }
          // Description/Details categories
          if (lowerCategory.includes('description') || lowerCategory.includes('detail')) {
              return 'fa fa-align-left';
          }
          // Settings/Configuration categories
          if (lowerCategory.includes('setting') || lowerCategory.includes('config') ||
              lowerCategory.includes('preference')) {
              return 'fa fa-sliders-h';
          }
          // Shipping/Delivery categories
          if (lowerCategory.includes('ship') || lowerCategory.includes('delivery')) {
              return 'fa fa-truck';
          }
          // User/Person categories
          if (lowerCategory.includes('user') || lowerCategory.includes('person') ||
              lowerCategory.includes('customer') || lowerCategory.includes('employee')) {
              return 'fa fa-user';
          }
          // Default icon for uncategorized sections
          return 'fa fa-info-circle';
      }

      /**
       * Generates the complete HTML template for a single entity form
       * @param entity The entity to generate HTML for
       * @param contextUser User context for permission checking
       * @returns Promise resolving to an object containing the HTML code and section information
       */
      protected async generateSingleEntityHTMLForAngular(entity: EntityInfo, contextUser: UserInfo): Promise<{htmlCode: string,
                                                                                                              additionalSections: AngularFormSectionInfo[],
                                                                                                              relatedEntitySections: AngularFormSectionInfo[]}> {
          // Load category icons from EntitySetting if available
          let categoryIcons: Record<string, string> | undefined;
          const entitySettings = entity.Settings;
          if (entitySettings) {
              const iconSetting = entitySettings.find((s: any) => s.Name === 'FieldCategoryIcons');
              if (iconSetting && iconSetting.Value) {
                  try {
                      categoryIcons = JSON.parse(iconSetting.Value);
                  } catch (e) {
                      // Invalid JSON, ignore and fall back to keyword matching
                  }
              }
          }

          const topArea = this.generateTopAreaHTMLForAngular(entity);
          const additionalSections = this.generateAngularAdditionalSections(entity, 0, categoryIcons);
          // calc ending index for additional sections so we can pass taht into the related entity tabs because they need to start incrementally up from there...
          const endingIndex = additionalSections && additionalSections.length ? (topArea && topArea.length > 0 ? additionalSections.length - 1 : additionalSections.length) : 0;
          const relatedEntitySections = await this.generateRelatedEntityTabs(entity, endingIndex, contextUser);
          const htmlCode = topArea.length > 0 ? this.generateSingleEntityHTMLWithSplitterForAngular(topArea, additionalSections, relatedEntitySections) :
                                                this.generateSingleEntityHTMLWithOUTSplitterForAngular(topArea, additionalSections, relatedEntitySections);
          return {htmlCode, additionalSections, relatedEntitySections};
      }
      
      
      /**
       * Generates HTML with a vertical splitter layout for entities with a top area
       * @param topArea HTML for the top area section
       * @param additionalSections Array of additional form sections
       * @param relatedEntitySections Array of related entity sections
       * @returns Generated HTML with splitter layout
       */
      protected generateSingleEntityHTMLWithSplitterForAngular(topArea: string, additionalSections: AngularFormSectionInfo[], relatedEntitySections: AngularFormSectionInfo[]): string {
          const htmlCode: string =  `<div class="record-form-container">
    <form *ngIf="record" class="record-form" #form="ngForm">
        <mj-form-toolbar [form]="this"></mj-form-toolbar>
        <kendo-splitter orientation="vertical" (layoutChange)="splitterLayoutChange()">
            <kendo-splitter-pane [collapsible]="true" [size]="TopAreaHeight">
${this.innerTopAreaHTML(topArea)}
            </kendo-splitter-pane>
            <kendo-splitter-pane>
${this.innerCollapsiblePanelsHTML(additionalSections, relatedEntitySections)}
            </kendo-splitter-pane>
        </kendo-splitter>
    </form>
</div>
        `
          return htmlCode;
      }
      
      /**
       * Generates the inner HTML for the top area section
       * @param topArea The top area content
       * @returns HTML string for the top area container, or empty string if no content
       */
      protected innerTopAreaHTML(topArea: string): string {
        if (topArea.trim().length === 0)
            return '';
        else
      return `                <div #topArea class="record-form-group">
                    ${topArea}
                </div>`
      }
      /**
       * Generates the HTML for collapsible panels containing all form sections
       * @param additionalSections Array of field-based form sections
       * @param relatedEntitySections Array of related entity sections
       * @returns HTML string for all collapsible panels
       */
      protected innerCollapsiblePanelsHTML(additionalSections: AngularFormSectionInfo[], relatedEntitySections: AngularFormSectionInfo[]): string {
        // Filter out Top sections as they're handled separately
        const sectionsToRender = additionalSections.filter(s => s.Type !== GeneratedFormSectionType.Top);
        const totalSections = sectionsToRender.length + relatedEntitySections.length;

        // Only show section controls if there are 4+ sections
        const showControls = totalSections >= 4;
        const controlsHTML = showControls ? `        <div class="form-section-controls">
            <div class="control-group">
                <button (click)="expandAllSections()" title="Expand all sections">
                    <i class="fa fa-expand-alt"></i>Expand All
                </button>
                <button (click)="collapseAllSections()" title="Collapse all sections">
                    <i class="fa fa-compress-alt"></i>Collapse All
                </button>
            </div>
            <input type="text"
                   class="section-search"
                   placeholder="Search sections..."
                   (input)="filterSections($event)"
                   #sectionSearch>
            <span class="section-count">
                <span class="section-count-badge">{{getExpandedCount()}}</span> of ${totalSections} expanded
            </span>
        </div>
` : '';

        // Combine field sections and related entity sections into panels, respecting DisplayLocation
        if (relatedEntitySections.length > 0) {
            const relatedEntityBeforePanels = relatedEntitySections.filter(s => s.RelatedEntityDisplayLocation === 'Before Field Tabs');
            const relatedEntityAfterPanels = relatedEntitySections.filter(s => s.RelatedEntityDisplayLocation === 'After Field Tabs');

            const beforePanelsHTML = relatedEntityBeforePanels.length > 0 ? relatedEntityBeforePanels.map(s => s.TabCode).join('\n') : '';
            const afterPanelsHTML = relatedEntityAfterPanels.length > 0 ? relatedEntityAfterPanels.map(s => s.TabCode).join('\n') : '';
            const fieldPanelsHTML = sectionsToRender.map(s => s.TabCode).join('\n');

            return `${controlsHTML}        <div class="form-panels-container">
${beforePanelsHTML}${beforePanelsHTML && fieldPanelsHTML ? '\n' : ''}${fieldPanelsHTML}${fieldPanelsHTML && afterPanelsHTML ? '\n' : ''}${afterPanelsHTML}
        </div>`
        } else {
            // No related entities, just show field panels
            return `${controlsHTML}        <div class="form-panels-container">
${sectionsToRender.map(s => s.TabCode).join('\n')}
        </div>`
        }
      }

      /**
       * @deprecated Use innerCollapsiblePanelsHTML instead
       * Generates the HTML for the tab strip containing all form sections
       * @param additionalSections Array of field-based form sections
       * @param relatedEntitySections Array of related entity sections
       * @returns HTML string for the complete tab strip
       */
      protected innerTabStripHTML(additionalSections: AngularFormSectionInfo[], relatedEntitySections: AngularFormSectionInfo[]): string {
        // come up with the overall order by looking for the tabs that have DisplayLocation === 'Before Field Tabs' and put those, in sequence order
        // ahead of the additionalSections, then do the additionalSections, and then do the relatedEntitySections
        const relatedEntityBeforeFieldTabs = relatedEntitySections.filter(s => s.RelatedEntityDisplayLocation === 'Before Field Tabs');
        const relatedEntityAfterFieldTabs = relatedEntitySections.filter(s => s.RelatedEntityDisplayLocation === 'After Field Tabs');

      return `                <mj-tabstrip (TabSelected)="onTabSelect($event)"  (ResizeContainer)="InvokeManualResize()">
                    ${relatedEntityBeforeFieldTabs ? relatedEntityBeforeFieldTabs.map(s => s.TabCode).join('\n') : ''}
                    ${additionalSections ? additionalSections.filter(s => s.Type !== GeneratedFormSectionType.Top).map(s => s.TabCode).join('\n               ') : ''}
                    ${relatedEntityAfterFieldTabs ? relatedEntityAfterFieldTabs.map(s => s.TabCode).join('\n') : ''}
                </mj-tabstrip>`
      }
      
      /**
       * Generates HTML without a splitter layout for entities without a top area
       * @param topArea HTML for the top area section (expected to be empty)
       * @param additionalSections Array of additional form sections
       * @param relatedEntitySections Array of related entity sections
       * @returns Generated HTML without splitter layout
       */
      protected generateSingleEntityHTMLWithOUTSplitterForAngular(topArea: string, additionalSections: AngularFormSectionInfo[], relatedEntitySections: AngularFormSectionInfo[]): string {
          const htmlCode: string =  `<div class="record-form-container">
    <form *ngIf="record" class="record-form" #form="ngForm">
        <mj-form-toolbar [form]="this"></mj-form-toolbar>
${this.innerTopAreaHTML(topArea)}
${this.innerCollapsiblePanelsHTML(additionalSections, relatedEntitySections)}
    </form>
</div>
        `
          return htmlCode;
      }
}
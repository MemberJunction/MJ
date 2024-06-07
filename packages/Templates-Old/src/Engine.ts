import { Injector, Type, NgModuleRef, ViewContainerRef, ComponentRef, NgModule, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';

import { BaseEngine, CodeNameFromString, UserInfo } from "@memberjunction/core";
import { DataContext } from "@memberjunction/data-context";


export interface DynamicComponentResult {
  component: Type<any>;
  module: Type<any>;
}

export class TemplateEngine extends BaseEngine<TemplateEngine> {
    private constructor() {
        super('MJ_Template_Metadata');
    }


    private _compiledTemplates: Map<string, DynamicComponentResult> = new Map<string, DynamicComponentResult>();

    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): TemplateEngine {
    return super.getInstance<TemplateEngine>('MJ_Template_Metadata');
    }


    public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
    const config = [];
    await this.Load(config, forceRefresh, contextUser);
    }

    /**
     * Executes the specified template with the given context.
     * @param templateName 
     * @param context 
     * @param forceRefresh 
     * @param contextUser 
     */
    public async ExecuteTemplate(templateName: string, context: DataContext, forceRefresh?: boolean, contextUser?: UserInfo) {

    }


    compileTemplate(templateName: string, template: string, customCode: string): DynamicComponentResult  {
        const templateClassName = CodeNameFromString(templateName);
        const cacheKey = `${templateName}::${template}::${customCode}`;
        if (this._compiledTemplates.has(cacheKey)) {
          return this._compiledTemplates.get(cacheKey);
        }
    
        const componentCode = `
        import { Component, Input, NgModule } from '@angular/core';
        import { CommonModule } from '@angular/common';
        import { BrowserModule } from '@angular/platform-browser';

        @Component({
        selector: 'dynamic-component',
        template: \`${template}\`
        })
        export class ${templateClassName} {
            @Input() context: any;
            ${customCode}
        }

        @NgModule({
        declarations: [dynamicComponent],
        imports: [CommonModule, BrowserModule],
        })
        export class DynamicComponentModule {}

        `;
    
        const result: DynamicComponentResult = new Function(`return ${componentCode}`)();

        this._compiledTemplates.set(cacheKey, result);
        return result;
    }

    /**
     * Renders a compiled Angular component into a view container.
     * @param viewContainerRef The view container reference where the component will be rendered.
     * @param componentResult The compiled Angular component result.
     * @param context The data context to be passed to the component.
     * @returns The component reference.
     */
    renderTemplate(viewContainerRef: ViewContainerRef, componentResult: DynamicComponentResult, context: any): ComponentRef<any> {
        const componentRef = viewContainerRef.createComponent(componentResult.component);
        componentRef.instance.context = context;
        componentRef.changeDetectorRef.detectChanges();
        return componentRef;
    }    
} 
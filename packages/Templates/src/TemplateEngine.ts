import { BaseEngine, BaseEnginePropertyConfig, UserInfo } from "@memberjunction/core";
import { TemplateEntity } from "@memberjunction/core-entities";

export class TemplateEngine extends BaseEngine<TemplateEngine> {
    private constructor() {
        super('MJ_Templates_Metadata');
    }
  
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): TemplateEngine {
       return super.getInstance<TemplateEngine>('MJ_Templates_Metadata');
    }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
        const c: BaseEnginePropertyConfig[] = [
            {
                EntityName: 'Templates',
                PropertyName: '_Templates',
            }
        ]
        await this.Load(c, forceRefresh, contextUser);
    }

    private _Templates: TemplateEntity[];
    public get Templates(): TemplateEntity[] {
        return this._Templates;
    }
}
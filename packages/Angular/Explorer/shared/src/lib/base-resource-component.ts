import { BaseEntity } from "@memberjunction/core";
import { SharedService } from "./shared.service";
import { BaseNavigationComponent } from "./base-navigation-component";
import { ResourceData } from "@memberjunction/core-entities";

export abstract class BaseResourceComponent extends BaseNavigationComponent {
    public Data: ResourceData = new ResourceData();

    private _loadComplete: boolean = false;
    public get LoadComplete(): boolean {
        return this._loadComplete;
    }

    private _loadStarted: boolean = false;
    public get LoadStarted(): boolean {
        return this._loadStarted;
    }

    
    private _loadCompleteEvent: any = null;
    public get LoadCompleteEvent(): any {
        return this._loadCompleteEvent
    }
    public set LoadCompleteEvent(value: any) {
        this._loadCompleteEvent = value;
    }

    private _loadStartedEvent: any = null;
    public get LoadStartedEvent(): any {
        return this._loadStartedEvent
    }
    public set LoadStartedEvent(value: any) {
        this._loadStartedEvent = value;
    }

    private _resourceRecordSavedEvent: any = null;
    public get ResourceRecordSavedEvent(): any {
        return this._resourceRecordSavedEvent
    }
    public set ResourceRecordSavedEvent(value: any) {
        this._resourceRecordSavedEvent = value;
    }

    protected NotifyLoadComplete() {
        this._loadComplete = true;
        if (this._loadCompleteEvent) {
            this._loadCompleteEvent();
        }
    }

    protected NotifyLoadStarted() {
        this._loadStarted = true;
        if (this._loadStartedEvent) {
            this._loadStartedEvent();
        }
    }
 
    

    protected ResourceRecordSaved(resourceRecordEntity: BaseEntity) {
        this.Data.ResourceRecordID = resourceRecordEntity.PrimaryKey.ToString();
        if (this._resourceRecordSavedEvent) {
            this._resourceRecordSavedEvent(resourceRecordEntity);
        }
    }

    abstract GetResourceDisplayName(data: ResourceData): Promise<string>

    abstract GetResourceIconClass(data: ResourceData): Promise<string>
}

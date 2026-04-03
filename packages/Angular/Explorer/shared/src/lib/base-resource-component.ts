import { BaseEntity } from "@memberjunction/core";
import { SharedService } from "./shared.service";
import { BaseNavigationComponent } from "./base-navigation-component";
import { ResourceData } from "@memberjunction/core-entities";

export abstract class BaseResourceComponent extends BaseNavigationComponent {
    private _data: ResourceData = new ResourceData();

    public get Data(): ResourceData {
        return this._data;
    }
    public set Data(value: ResourceData) {
        this._data = value;
    }

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

    private _displayNameChangedEvent: ((newName: string) => void) | null = null;
    public get DisplayNameChangedEvent(): ((newName: string) => void) | null {
        return this._displayNameChangedEvent;
    }
    public set DisplayNameChangedEvent(value: ((newName: string) => void) | null) {
        this._displayNameChangedEvent = value;
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
 
    

    /**
     * Call this to notify the tab system that the resource's display name has changed.
     * The tab container will update the tab title and browser title accordingly.
     */
    protected NotifyDisplayNameChanged(newName: string): void {
        if (this._displayNameChangedEvent) {
            this._displayNameChangedEvent(newName);
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

import { BaseEntity } from "@memberjunction/core";
import { SharedService } from "./shared.service";

export abstract class BaseResourceComponent {
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
        this.Data.ResourceRecordID = resourceRecordEntity.PrimaryKey.Value;
        if (this._resourceRecordSavedEvent) {
            this._resourceRecordSavedEvent(resourceRecordEntity);
        }
    }

    abstract GetResourceDisplayName(data: ResourceData): Promise<string>
}

export class ResourceData {
    constructor(data: any = null) {
        if (data) {
            this.ID = data.ID;
            this.Name = data.Name;
            this.ResourceTypeID = data.ResourceTypeID;
            this.ResourceRecordID = data.ResourceRecordID;
            this.Configuration = data.Configuration;
        }
    }
    public ID!: number;
    public Name!: string;
    public ResourceTypeID!: number;
    public ResourceRecordID!: any;
    public Configuration: any;

    /**
     * Returns the name of the resource type based on the ResourceTypeID
     */
    public get ResourceType(): string {
        const rt = SharedService.Instance.ResourceTypes.find(rt => rt.ID === this.ResourceTypeID);
        return rt ? rt.Name : '';
    }
    public get ResourceIcon(): string {
        const rt = SharedService.Instance.ResourceTypes.find(rt => rt.ID === this.ResourceTypeID);
        return rt && rt.Icon ? rt.Icon : '';
    }
}
import { ResourcePermissionEngine } from "./ResourcePermissionEngine";
import { UUIDsEqual } from "@memberjunction/global";

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
    public ResourceTypeID!: string;
    public ResourceRecordID!: any; 
    public Configuration: any;

    /**
     * Returns the name of the resource type based on the ResourceTypeID
     */
    public get ResourceType(): string {
        const rt = ResourcePermissionEngine.Instance.ResourceTypes.find(rt => UUIDsEqual(rt.ID, this.ResourceTypeID));
        return rt ? rt.Name : '';
    }
    public get ResourceIcon(): string {
        const rt = ResourcePermissionEngine.Instance.ResourceTypes.find(rt => UUIDsEqual(rt.ID, this.ResourceTypeID));
        return rt && rt.Icon ? rt.Icon : '';
    }
}
export enum ItemType {
    Folder = "Folder",
    Entity = "Entity",
    Resource = "Resource",
    UserView = "UserView",
    Application = "Application",
    StubData = "StubData"
};

export class Item {
    public Name: string;
    public Description: string;
    public Type: ItemType;
    public Favorite: boolean = false;
    /**
     * Is this item a link to a shared resource from another user?
     */
    public IsLink: boolean = false;
    /**
     * If this item is a link, what is the permission level of the link?
     */
    public LinkPermissionLevel: 'View' | 'Edit' | 'Owner' | null = null;
    public Data : any | Folder;

    constructor(data: any | Folder, type: ItemType){
        this.Type = type;
        this.Data = data;
        this.Name = "";
        this.Description = "";

        if(data){
            //Try to set the name and description from the data
            let anyData: any = data;
            if(anyData.Name){
                this.Name = anyData.Name;
            }

            if(anyData.Description){
                this.Description = anyData.Description;
            }
        }
    }
}

export class TreeItem extends Item {
    public ChildItems: TreeItem[] = [];

    constructor(data: any | Folder, type: ItemType){
        super(data, type);
    }
}

/**
 * A folder is a wrapper class for the various Category
 * entities that we have, e.g. Dashboard Categories, 
 * Report Categories, Query Categories, etc.
 */
export class Folder {
    public ID: string;
    public ParentFolderID?: string | null;
    public Name: string;
    public Description: string | null;

    constructor(id: string, folderName: string){
        this.ID = id;
        this.Name = folderName;
        this.Description = "";
    }
}

export class TreeFolder extends Folder {
    public EntityID: string;

    constructor(entityID: string, id: string, folderName: string){
        super(id, folderName);
        this.EntityID = entityID;
    }
}

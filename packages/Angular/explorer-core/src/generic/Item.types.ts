export enum ItemType {
    Folder = "Folder",
    Entity = "Entity"
};

export class Item {
    public Name: string;
    public Description: string;
    public Type: ItemType;
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

/**
 * A folder is a wrapper class for the various Category
 * entities that we have, e.g. Dashboard Categories, 
 * Report Categories, Query Categories, etc.
 */
export class Folder {
    public ID: number;
    public ParentFolderID?: number | null;
    public Name: string;
    public Description: string | null;

    constructor(id: number, folderName: string){
        this.ID = id;
        this.Name = folderName;
        this.Description = "";
    }
}

export enum ItemType {
    Folder = "Folder",
    Resource = "Resource"
};

export class PathData {
    public Name: string;
    public ID: number;
    public URL: string;
    public ParentPathData?: PathData;
    public ChildPatchData?: PathData;

    constructor(id: number, name: string, url: string){
        this.ID = id;
        this.Name = name;
        this.URL = url;
    }
}

export class Item<T> {
    public Name: string;
    public Description: string;
    public Type: ItemType;
    public Data : T;

    constructor(data: T, type: ItemType){
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

export class Folder {
    public ID: number;
    public ParentFolderID?: number;
    public Name: string;
    public Description: string;
    public Type: ItemType;

    constructor(id: number, folderName: string){
        this.ID = id;
        this.Name = folderName;
        this.Description = "";
        this.Type = ItemType.Folder;
    }
}
import { BaseEntity } from "@memberjunction/core";

export enum ItemType {
    Folder = "Folder",
    Entity = "Entity"
};

export class Item {
    public Name: string;
    public Description: string;
    public Type: ItemType;
    public Data : BaseEntity | Folder;

    constructor(data: BaseEntity | Folder, type: ItemType){
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
    public ParentFolderID?: number | null;
    public Name: string;
    public Description: string | null;
    public Type: ItemType;

    constructor(id: number, folderName: string){
        this.ID = id;
        this.Name = folderName;
        this.Description = "";
        this.Type = ItemType.Folder;
    }
}

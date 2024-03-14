import { PrimaryKeyValue } from "@memberjunction/core";

export enum ItemType {
    Folder = "Folder",
    Resource = "Resource"
};

export class PathData {
    public Name: string;
    public ID: number;
    public rootPath: string;

    constructor(id: number, name: string, rootPath: string){
        this.ID = id;
        this.Name = name;
        this.rootPath = rootPath;
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
    public PathData: PathData[];
    public Name: string;
    public Description: string;
    public Type: ItemType;

    constructor(id: number, name: string, pathData: PathData[]){

        let clonedPath: PathData[] = JSON.parse(JSON.stringify(pathData));
        let path: PathData = new PathData(id, name, "");
        clonedPath.push({FieldName: "ID", Value: id});

        this.ID = id;
        this.Name = name;
        this.PathData = clonedPath;
        this.Description = "";
        this.Type = ItemType.Folder;
    }
}
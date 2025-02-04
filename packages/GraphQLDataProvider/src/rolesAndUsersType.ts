import { CompositeKey } from "@memberjunction/core";

export class RoleInput {
    ID: string;

    Name: string;
    
    Description: string;
}


export class UserInput {
    ID!: string;

    Name!: string;

    Email!: string;

    Type!: 'Owner' | 'User';

    FirstName: string;

    LastName: string;
    
    Title: string;

    Roles?: RoleInput[];
}

export class RolesAndUsersInput {
    public Users: UserInput[];
  
    public Roles: RoleInput[];
}



export enum SyncDataActionType {
    Create = "Create",
    Update = "Update",
    CreateOrUpdate = "CreateOrUpdate",
    Delete = "Delete",
    DeleteWithFilter = "DeleteWithFilter"
}
  
export class ActionItemInput {
    EntityName!: string;
    PrimaryKey!: CompositeKey;

    Type!: SyncDataActionType;
    /**
     * This field is a JSON representation of the field values of the entity to be created or updated. It is used for all ActionTypes except for 
     */
    RecordJSON?: string;

    /**
     * This field is only provided when the Action Type is DeleteWithFilter. It is a valid SQL expression that can be used in a where clause to get a list of records in a given entity to delete
     */
    DeleteFilter?: string;
}
  

export class SyncDataResult {
    Success: boolean;
  
    Results: ActionItemOutput[] = [];
}

export class ActionItemOutput {
    input: ActionItemInput;
    success: boolean;
    errorMessage: string;
}

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



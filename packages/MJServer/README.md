# @memberjunction/server

The `@memberjunction/server` library provides a simple way to run the MemberJunction API server. It includes all the functions required to start up the GraphQL server, manage authentication, and connect to the common data store.

The server provides a comprehensive interface for accessing and managing metadata within MemberJunction, along with facilities for working with entities, applications, and various other aspects central to the MemberJunction ecosystem.

## Installation

```shell
npm install @memberjunction/server
```

## Configuration

The server uses configuration from its environment

| Env variable             | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| DB_HOST                  | The hostname for the common data store database              |
| DB_PORT                  | The port for the common data store database (default 1433)   |
| DB_USERNAME              | The username used to authenticate with the common data store |
| DB_PASSWORD              | The password used to authenticate with the common data store |
| DB_DATABASE              | The common data store database name                          |
| PORT                     | The port used by the server (default 4000)                   |
| ROOT_PATH                | The GraphQL root path (default /)                            |
| WEB_CLIENT_ID            | The client ID used for MSAL authentication                   |
| TENANT_ID                | The tenant ID used for MSAL authentication                   |
| ENABLE_INTROSPECTION     | A flag to allow GraphQL introspection (default false)        |
| WEBSITE_RUN_FROM_PACKAGE | An Azure flag to indicate a read-only file system            |
| AUTH0_DOMAIN             | The Auth0 domain                                             |
| AUTH0_CLIENT_ID          | The Auth0 Client ID                                          |
| AUTH0_CLIENT_SECRET      | The Auth0 Client secret                                      |
| MJ_CORE_SCHEMA           | The core schema to use for the data provider                 |
| CONFIG_FILE              | An absolute path to the config file json                     |

### REST API

In addition to the GraphQL API, MemberJunction now provides a REST API for applications that prefer RESTful architecture. By default, the REST API is disabled for security reasons.

For comprehensive documentation on the REST API, including configuration options, security controls, and available endpoints, see [REST_API.md](./REST_API.md).

The REST API supports:
- Standard CRUD operations for entities
- View operations for data retrieval
- Metadata exploration
- Wildcard pattern matching for entity filtering
- Schema-level access control
- Comprehensive security configuration


## Usage

Import the `serve` function from the package and run it as part of the server's main function. The function accepts an array of absolute paths to the resolver code.

```ts
import { serve } from '@memberjunction/server';
import { resolve } from 'node:path';

const localPath = (p: string) => resolve(__dirname, p);

const resolverPaths = [
  'resolvers/**/*Resolver.{js,ts}',
  'generic/*Resolver.{js,ts}',
  'generated/generated.ts',
]

serve(resolverPaths.map(localPath));
```

### Custom New User Behavior

The behavior to handle new users can be customized by subclassing the `NewUserBase` class. The subclass can pre-process, post-process or entirely override the base class behavior as needed. Import the class before calling `serve` to ensure the class is registered.

`index.ts`

```ts
import { serve } from '@memberjunction/server';
import { resolve } from 'node:path';

import './auth/exampleNewUserSubClass'; // make sure this new class gets registered

// ...
```


`auth/exampleNewUserSubClass.ts`

```ts
import { LogError, Metadata, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { NewUserBase, configInfo } from '@memberjunction/server';
import { UserCache } from "@memberjunction/sqlserver-dataprovider";

/**
 * This example class subclasses the @NewUserBase class and overrides the createNewUser method to create a new person record and then call the base class to create the user record. In this example there is an entity
 * called "Persons" that is mapped to the User table in the core MemberJunction schema. You can sub-class the NewUserBase to do whatever behavior you want and pre-process, post-process or entirely override the base
 * class behavior.
 */
@RegisterClass(NewUserBase, undefined, 1) /*by putting 1 into the priority setting, MJGlobal ClassFactory will use this instead of the base class as that registration had no priority*/
export class ExampleNewUserSubClass extends NewUserBase {
    public override async createNewUser(firstName: string, lastName: string, email: string) {
        try {
            const md = new Metadata();
            const contextUser = UserCache.Instance.Users.find(u => u.Email.trim().toLowerCase() === configInfo?.userHandling?.contextUserForNewUserCreation?.trim().toLowerCase())
            if(!contextUser) {
                LogError(`Failed to load context user ${configInfo?.userHandling?.contextUserForNewUserCreation}, if you've not specified this on your config.json you must do so. This is the user that is contextually used for creating a new user record dynamically.`);
                return undefined;
            }

            const pEntity = md.Entities.find(e => e.Name === 'Persons'); // look up the entity info for the Persons entity
            if (!pEntity) {
                LogError('Failed to find Persons entity');
                return undefined;
            }

            let personId;
            // this block of code only executes if we have an entity called Persons
            const rv = new RunView();
            const viewResults = await rv.RunView({
                EntityName: 'Persons',
                ExtraFilter: `Email = '${email}'`
            }, contextUser)
    
            if (viewResults && viewResults.Success && Array.isArray(viewResults.Results) && viewResults.Results.length > 0) {
                // we have a match so use it
                const row = (viewResults.Results as { ID: number }[])[0]; // we know the rows will have an ID number
                personId = row['ID'];
            }
    
            if (!personId) {
                // we don't have a match so create a new person record
                const p = await md.GetEntityObject('Persons', contextUser);
                p.NewRecord(); // assumes we have an entity called Persons that has FirstName/LastName/Email fields
                p.FirstName = firstName;
                p.LastName = lastName;
                p.Email = email;
                p.Status = 'active';
                if (await p.Save()) {
                    personId = p.ID;
                }   
                else {
                    LogError(`Failed to create new person ${firstName} ${lastName} ${email}`)
                }
            }
    
            // now call the base class to create the user, and pass in our LinkedRecordType and ID
            return super.createNewUser(firstName, lastName, email, 'Other', pEntity?.ID, personId);        
        }
        catch (e) {
            LogError(`Error creating new user ${email} ${e}`);
            return undefined;
        }
    }
}
```

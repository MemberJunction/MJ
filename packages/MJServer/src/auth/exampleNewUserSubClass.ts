import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView, LogError, EntitySaveOptions } from '@memberjunction/core';
import { NewUserBase } from './newUsers.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { configInfo } from '../config.js';
import { UserEntity } from '@memberjunction/core-entities';

/**
 * This example class subclasses the @NewUserBase class and overrides the createNewUser method to create a new person record and then call the base class to create the user record. In this example there is an entity
 * called "Persons" that is mapped to the User table in the core MemberJunction schema. You can sub-class the NewUserBase to do whatever behavior you want and pre-process, post-process or entirely override the base
 * class behavior.
 */
// NOTE: This is commented out becuase it is turned off by default. To make this work, you'd have to do a real implementation below, and then uncomment this decorator
//       so that your class is actually used.
//@RegisterClass(NewUserBase, undefined, 1) /*by putting 1 into the priority setting, MJGlobal ClassFactory will use this instead of the base class as that registration had no priority*/
export class ExampleNewUserSubClass extends NewUserBase {
  public override async createNewUser(firstName: string, lastName: string, email: string, linkedRecordType: string = 'None', linkedEntityId?: string, linkedEntityRecordId?: string): Promise<UserEntity | null> {
    try {
      const md = new Metadata();

      const contextUser = UserCache.Instance.Users.find(
        (u) => u.Email.trim().toLowerCase() === configInfo?.userHandling?.contextUserForNewUserCreation?.trim().toLowerCase()
      );
      if (!contextUser) {
        LogError(
          `Failed to load context user ${configInfo?.userHandling?.contextUserForNewUserCreation}, if you've not specified this on your config.json you must do so. This is the user that is contextually used for creating a new user record dynamically.`
        );
        return undefined;
      }

      const pEntity = md.Entities.find((e) => e.Name === 'Persons'); // look up the entity info for the Persons entity
      if (!pEntity) {
        LogError('Failed to find Persons entity');
        return undefined;
      }

      let personId;
      // this block of code only executes if we have an entity called Persons
      const rv = new RunView();
      const viewResults = await rv.RunView(
        {
          EntityName: 'Persons',
          ExtraFilter: `Email = '${email}'`,
        },
        contextUser
      );

      if (viewResults && viewResults.Success && Array.isArray(viewResults.Results) && viewResults.Results.length > 0) {
        // we have a match so use it
        const row = (viewResults.Results as { ID: number }[])[0]; // we know the rows will have an ID number
        personId = row['ID'];
      }

      if (!personId) {
        // we don't have a match so create a new person record
        const p = await md.GetEntityObject('Persons', contextUser);
        p.NewRecord(); // assumes we have an entity called Persons that has FirstName/LastName/Email fields
        // this code is commented out because we don't have a strongly typed sub-class generatd for this "Persons" entity as it is a demo/hypothetical example
        //p.FirstName = firstName;
        //p.LastName = lastName;
        //p.Email = email;
        //p.Status = 'active';
        if (await p.Save()) {
          personId = p.FirstPrimaryKey.Value; // if we had a strongly typed sub-class above, we could use this code p.ID;
        } else {
          LogError(`Failed to create new person ${firstName} ${lastName} ${email}`);
        }
      }

      // now call the base class to create the user, and pass in our LinkedRecordType and ID
      return super.createNewUser(firstName, lastName, email, 'Other', pEntity?.ID, personId);
    } catch (e) {
      LogError(`Error creating new user ${email} ${e}`);
      return undefined;
    }
  }
}

export function LoadExampleNewUserSubClass() {
  // do nothing, just having this forces the above class to get registered via its @RegisterClass decorator
}

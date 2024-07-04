import { CompositeKey, EntityPermissionType, Metadata, RunView } from '@memberjunction/core';
import { FileCategoryEntity, FileEntity } from '@memberjunction/core-entities';
import { AppContext, Arg, Ctx, DeleteOptionsInput, Int, Mutation } from '@memberjunction/server';
import { mj_core_schema } from '../config';
import { FileCategoryResolver as FileCategoryResolverBase, FileCategory_ } from '../generated/generated';

export class FileResolver extends FileCategoryResolverBase {
  @Mutation(() => FileCategory_)
  async DeleteFileCategory(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext) {
    const key = new CompositeKey();
    key.LoadFromSingleKeyValuePair('ID', ID);
    if (!(await this.BeforeDelete(dataSource, key))) {
      return null;
    }

    const md = new Metadata();
    const user = this.GetUserFromPayload(userPayload);
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    const fileCategoryEntity = await md.GetEntityObject<FileCategoryEntity>('File Categories', user);

    fileEntity.CheckPermissions(EntityPermissionType.Update, true);
    fileCategoryEntity.CheckPermissions(EntityPermissionType.Delete, true);

    await fileCategoryEntity.Load(ID);
    const returnValue = fileCategoryEntity.GetAll();

    // Any files using the deleted category fall back to its parent
    await dataSource.transaction(async () => {
      // SHOULD USE BaseEntity for each of these records to ensure object model
      // is used everywhere - new code below. The below is SLOWER than a single
      // Update statement, but it ensures that the object model is used everywhere
      // in case there are sub-classes and business logic/etc for the updates
      // the direct SQL would bypass that logic.

      // const sSQL = `UPDATE [${mj_core_schema}].[File] 
      //                 SET [CategoryID]=${fileCategoryEntity.ParentID}
      //                 WHERE [CategoryID]=${fileCategoryEntity.ID}`;

      // await dataSource.query(sSQL);
      const rv = new RunView();
      const filesResult = await rv.RunView({
        EntityName: 'Files',
        ExtraFilter: 'CategoryID=' + fileCategoryEntity.ID,
        ResultType: 'entity_object'
      }, user);
      if (filesResult) {
        // iterate through each of the files in filesResult.Results
        // and update the CategoryID to fileCategoryEntity.ParentID
        for (const file of filesResult.Results) {
          const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
          await fileEntity.Load(file.ID);
          fileEntity.CategoryID = fileCategoryEntity.ParentID;
          await fileEntity.Save();
        }
      }
      await fileCategoryEntity.Delete();
    });

    await this.AfterDelete(dataSource, key); // fire event
    return returnValue;
  }
}

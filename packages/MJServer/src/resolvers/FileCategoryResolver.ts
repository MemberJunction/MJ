import { EntityPermissionType, Metadata } from '@memberjunction/core';
import { FileCategoryEntity, FileEntity } from '@memberjunction/core-entities';
import { AppContext, Arg, Ctx, Int, Mutation } from '@memberjunction/server';
import { mj_core_schema } from '../config';
import { FileCategoryResolver as FileCategoryResolverBase, FileCategory_ } from '../generated/generated';

export class FileResolver extends FileCategoryResolverBase {
  @Mutation(() => FileCategory_)
  async DeleteFileCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext) {
    if (!(await this.BeforeDelete(dataSource, ID))) {
      return null;
    }

    const md = await new Metadata();
    const user = this.GetUserFromPayload(userPayload);
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    const fileCategoryEntity = await md.GetEntityObject<FileCategoryEntity>('File Categories', user);

    fileEntity.CheckPermissions(EntityPermissionType.Update, true);
    fileCategoryEntity.CheckPermissions(EntityPermissionType.Delete, true);

    await fileCategoryEntity.Load(ID);
    const returnValue = fileCategoryEntity.GetAll();

    // Any files using the deleted category fall back to its parent
    await dataSource.transaction(async () => {
      const sSQL = `UPDATE [${mj_core_schema}].[File] 
                      SET [CategoryID]=${fileCategoryEntity.ParentID}
                      WHERE [CategoryID]=${fileCategoryEntity.ID}`;

      await dataSource.query(sSQL);
      await fileCategoryEntity.Delete();
    });

    await this.AfterDelete(dataSource, ID); // fire event
    return returnValue;
  }
}

import { Metadata } from '@memberjunction/core';
import { FileEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { AppContext, Arg, Ctx, Field, InputType, Int, Mutation, ObjectType, Resolver } from '@memberjunction/server';
import { FileStorageBase } from '@memberjunction/storage';
import mime from 'mime';
import { CreateFileInput, FileResolver as FileResolverBase, File_ } from '../generated/generated';


@InputType()
export class CreateUploadURLInput {
  @Field(() => Int)
  FileID: number;
}

@ObjectType()
export class CreateFilePayload {
  @Field(() => File_)
  File: File_;
  @Field(() => String)
  UploadUrl: string;
}

@Resolver(File_)
export class FileResolver extends FileResolverBase {
  @Mutation(() => CreateFilePayload)
  async CreateFile(@Arg('input', () => CreateFileInput) input: CreateFileInput, @Ctx() { dataSource, userPayload }: AppContext) {
    const { Name, ProviderID } = input;
    const ContentType = input.ContentType ?? mime.getType(Name.split('.').pop()) ?? 'application/octet-stream';
    const Status = 'DRAFT';

    // get the provider key from the provider ID
    console.log('Get provider rec', ProviderID);
    console.log('Use that to instantiate the right provider implementation');
    console.log('For now that is hard-coded to use Azure');
    const driverClassName = 'Azure Blob Storage';

    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, driverClassName);
    const { UploadUrl, ...maybeProviderKey } = await driver.CreatePreAuthUploadUrl(Name);
    const updatedInput = { ...input, ...maybeProviderKey, ContentType, Status };

    // return { File, UploadUrl };
    if (await this.BeforeCreate(dataSource, updatedInput)) {
      // fire event and proceed if it wasn't cancelled
      const entityObject = <FileEntity>await new Metadata().GetEntityObject('Files', this.GetUserFromPayload(userPayload));
      await entityObject.NewRecord();
      entityObject.SetMany(updatedInput);
      if (await entityObject.Save()) {
        // save worked, fire the AfterCreate event and then return all the data
        await this.AfterCreate(dataSource, updatedInput); // fire event
        return { UploadUrl, File: entityObject.GetAll() };
      }
      // save failed, return null
      else return null;
    } else return null;
  }
}

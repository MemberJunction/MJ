import { CloudStorageBase } from "../../generic/CloudStorageBase";
import { UserInfo } from "@memberjunction/core";
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import dotenv from 'dotenv';
import { ContentItemEntity } from "@memberjunction/core-entities";
import { Metadata } from "@memberjunction/core";
import path from "path";
import { LoadGeneratedEntities } from "mj_generatedentities";
dotenv.config()
LoadGeneratedEntities()

export class AutotagAzureBlob extends CloudStorageBase {
    private blobServiceClient: BlobServiceClient;
    private containerClient: ContainerClient;
    private connectionString: string;
    private containerName: string;

    constructor(conntectionString: string, containerName: string) { 
        super();
        this.connectionString = conntectionString
        this.containerName = containerName
    }
    

    /**
     * Implemented abstract method from the CloudStorageBase class for cloud storage authentication. This method authenticates the user to the Azure Blob Storage.
     * @returns void
    */
    public async Authenticate(): Promise<void> {
        try {
            this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
            for await (const container of this.blobServiceClient.listContainers()) {
                console.log(`Container: ${container.name}`);
            }

            this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        } catch (error) {
            console.error(error)
            throw new Error('Error authenticating to Azure Blob Storage')
        }
    }

    public async SetNewAndModifiedContentItems(contentSourceParams: any, lastRunDate: Date, contextUser: UserInfo, prefix=''): Promise<ContentItemEntity[]> {
        const contentItemsToProcess: ContentItemEntity[] = []

        for await (const blob of this.containerClient.listBlobsFlat()) {
            const filePath = path.join(this.containerName, blob.name)
            if (blob.properties.createdOn && blob.properties.createdOn > lastRunDate) {
                // The file has been created, add a new record for this file
                const md = new Metadata()
                const contentItem = <any> await md.GetEntityObject('Content Items', contextUser)
                const text = await this.extractText(blob.name)
                contentItem.Set('ContentSourceID', contentSourceParams.contentSourceID)
                contentItem.Set('Name', blob.name)
                contentItem.Set('Description', await this.engine.getContentItemDescription(contentSourceParams, contextUser))
                contentItem.Set('URL', filePath)
                contentItem.Set('ContentTypeID', contentSourceParams.ContentTypeID)
                contentItem.Set('ContentSourceTypeID', contentSourceParams.ContentSourceTypeID)
                contentItem.Set('ContentFileTypeID', contentSourceParams.ContentFileTypeID)
                contentItem.Set('Checksum', await this.engine.getChecksumFromText(text))
                contentItem.Set('Text', text)
                contentItem.Set('CreatedAt', new Date())
                contentItem.Set('UpdatedAt', new Date())
                
                await contentItem.Save()
                contentItemsToProcess.push(contentItem)
            }
            else if (blob.properties.lastModified && blob.properties.lastModified > lastRunDate) {
                // The file has been modified, update the record for this file
                const md = new Metadata()
                const contentItem = <any> await md.GetEntityObject('Content Items', contextUser)
                const contentItemID = await this.engine.getContentItemIDFromURL(contentSourceParams.contentSourceID, contextUser)
                await contentItem.Load(contentItemID)
                const text = await this.extractText(blob.name)
                contentItem.Set('Text', text)
                contentItem.Set('Checksum', await this.engine.getChecksumFromText(text))
                contentItem.Set('UpdatedAt', new Date())
                contentItem.Save()
                contentItemsToProcess.push(contentItem)
            }
        }

        return contentItemsToProcess
    }

    public async extractText(file: string): Promise<string> {
        const blockBlobClient = this.containerClient.getBlockBlobClient(file)
        const downloadBlockBlobResponse = await blockBlobClient.download()
        const document = await this.streamToBuffer(downloadBlockBlobResponse.readableStreamBody)
        const text = await this.engine.parsePDF(document)
        return text
    }

    public async streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            readableStream.on("data", (data) => {
                chunks.push(data instanceof Buffer ? data : Buffer.from(data));
            });
            readableStream.on("end", () => {
                resolve(Buffer.concat(chunks));
            });
            readableStream.on("error", reject);
        });
    }
}
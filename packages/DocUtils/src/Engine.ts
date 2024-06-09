import axios from 'axios';
import { JSDOM } from 'jsdom';

import { BaseEngine, BaseEnginePropertyConfig, LogError, UserInfo } from "@memberjunction/core";
import { LibraryEntity } from "@memberjunction/core-entities";
import { RegisterClass } from '@memberjunction/global';
import { BaseEntity } from 'typeorm';


/**
 * Represents a single item within a library/package that is used to provide documentation for the MemberJunction system. For example a library would be something like
 * @memberjunction/core and an item within that library might be the BaseEntity or BaseEngine class.
 */
export class LibraryItem {
    Name: string;
    URL: string;
    HTMLContent: string
    Library: LibraryEntity;
}

@RegisterClass(BaseEntity, "Libraries")
export class LibraryEntityExtended extends LibraryEntity {
    private _items: LibraryItem[] = [];
    public get Items(): LibraryItem[] {
        return this._items;
    }
}

/**
 * Provides utility functionality for documentation of the MemberJunction system using external website content from the MemberJunction project.
 */
export class DocumentationEngine extends BaseEngine<DocumentationEngine> {
    public static get Instance(): DocumentationEngine {
        return super.getInstance<DocumentationEngine>();
    }

 
    // internal instance properties used for the singleton pattern
    private _Libraries: LibraryEntityExtended[] = [];

    /**
     * This method is called to configure the ActionEngine. It loads the metadata for the actions, filters, and result codes and caches them in the GlobalObjectStore. You must call this method before running any actions.
     * If this method was previously run on the instance of the ActionEngine, it will return immediately without re-loading the metadata. If you want to force a reload of the metadata, you can pass true for the forceReload parameter.
     * @param forceRefresh If true, the metadata will be loaded from the database even if it was previously loaded.
     * @param contextUser If you are running the action on the server side you must pass this in, but it is not required in an environment where a user is authenticated directly, e.g. a browser or other client. 
     */
    public async Config(forceRefresh: boolean = false, contextUser?: UserInfo): Promise<void> {
        const configs: BaseEnginePropertyConfig[] = [
            {
                EntityName: 'Libraries',
                PropertyName: '_Libraries'
            },
        ]; 
        await this.Load(configs, forceRefresh, contextUser);
    }

    private _baseURL: string = 'https://memberjunction.github.io/MJ/classes/';
    protected override async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // Load the items for each library using the comma delimited list of included items in the Library metadata
        for (const library of this.Libraries) {
            const items = library.ExportedItems.split(',').map(x => x.trim());
            for (const item of items) {
                const libraryItem = new LibraryItem();
                // lib code name is replace all instances of @ . and / or \ in the library name with _
                const codeName = library.Name.replace(/[@.\/\\]/g, '_');
                libraryItem.Name = item;                
                libraryItem.URL = `${this._baseURL}${codeName}.${item}.html`;
                libraryItem.HTMLContent = await this.GetContent(libraryItem.URL);
                libraryItem.Library = library;
                library.Items.push(libraryItem);
            }
        }
    }

    protected async GetContent(url: string, rootSelector?: string): Promise<string> {
        const html = await this.fetchDocumentation(url);
        return this.parseDocumentation(html, rootSelector);
    }
    protected async fetchDocumentation(url: string): Promise<string> {
        try {
            const response = await axios.get(url);
            if (response.status === 200) {
                return response.data;
            } else {
                return 'No content found';
            }    
        }
        catch (e) {
            LogError(e)
            return "Error fetching content"
        }
    }
    protected  parseDocumentation(html: string, rootSelector?: string): string {
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const content = document.querySelector('div.col-content')?.innerHTML;
        return content || 'No relevant content found';
    }
 
    /** 
     * List of all the Entity Action objects that are available for use in the system. Make sure you call Config() before any other methods on this class.
     */
    public get Libraries(): LibraryEntityExtended[] {
        return this._Libraries;
    }
}
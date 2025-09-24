var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
import { RegisterClass } from "@memberjunction/global";
import fs from 'fs';
import { AutotagBase } from "../../Core";
import { Metadata, RunView } from "@memberjunction/core";
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
let AutotagLocalFileSystem = (() => {
    let _classDecorators = [RegisterClass(AutotagBase, 'AutotagLocalFileSystem')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = AutotagBase;
    var AutotagLocalFileSystem = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AutotagLocalFileSystem = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        contextUser;
        contentSourceTypeID;
        constructor() {
            super();
            // engine is inherited from AutotagBase
        }
        getContextUser() {
            return this.contextUser;
        }
        // NEW CLOUD-FRIENDLY METHODS
        /**
         * Discovery phase: Scan directories and identify files that need processing
         * @param contentSources - Array of local file system content sources
         * @param contextUser - User context
         * @returns Array of discovery results for files that need processing
         */
        async DiscoverContentToProcess(contentSources, contextUser) {
            const discoveries = [];
            this.contextUser = contextUser;
            for (const contentSource of contentSources) {
                try {
                    if (!fs.existsSync(contentSource.URL)) {
                        console.log(`Directory does not exist: ${contentSource.URL}`);
                        continue;
                    }
                    const lastRunDate = await this.engine.getContentSourceLastRunDate(contentSource.ID, contextUser);
                    const files = await this.scanDirectoryRecursive(contentSource.URL);
                    for (const filePath of files) {
                        try {
                            if (!this.isSupportedFileType(filePath)) {
                                continue;
                            }
                            const stat = await fs.promises.stat(filePath);
                            // Determine if this is a new file or modified file
                            const existingContentItemId = await this.getExistingContentItemId(filePath, contentSource.ID, contextUser);
                            if (!existingContentItemId && stat.birthtime > lastRunDate) {
                                // New file
                                discoveries.push({
                                    identifier: filePath,
                                    contentSourceId: contentSource.ID,
                                    lastModified: stat.mtime,
                                    action: 'create',
                                    sourceType: 'LocalFileSystem',
                                    metadata: {
                                        url: filePath,
                                        size: stat.size,
                                        extension: path.extname(filePath).toLowerCase()
                                    }
                                });
                            }
                            else if (existingContentItemId && stat.mtime > lastRunDate) {
                                // Modified file
                                discoveries.push({
                                    identifier: filePath,
                                    contentSourceId: contentSource.ID,
                                    lastModified: stat.mtime,
                                    action: 'update',
                                    sourceType: 'LocalFileSystem',
                                    metadata: {
                                        url: filePath,
                                        existingContentItemId,
                                        size: stat.size,
                                        extension: path.extname(filePath).toLowerCase()
                                    }
                                });
                            }
                        }
                        catch (fileError) {
                            console.warn(`Error processing file ${filePath}:`, fileError.message);
                            continue;
                        }
                    }
                }
                catch (sourceError) {
                    console.error(`Error processing content source ${contentSource.Name}:`, sourceError.message);
                    continue;
                }
            }
            console.log(`Discovered ${discoveries.length} items to process`);
            return discoveries;
        }
        /**
         * Creation phase: Create or update a single ContentItem with parsed text
         * @param discoveryItem - Discovery result identifying the file to process
         * @param contextUser - User context
         * @returns Created or updated ContentItem
         */
        async SetSingleContentItem(discoveryItem, contextUser) {
            const filePath = discoveryItem.identifier;
            const md = new Metadata();
            try {
                let contentItem;
                if (discoveryItem.action === 'update' && discoveryItem.metadata?.existingContentItemId) {
                    // Update existing ContentItem
                    contentItem = await md.GetEntityObject('Content Items', contextUser);
                    await contentItem.Load(discoveryItem.metadata.existingContentItemId);
                }
                else {
                    // Create new ContentItem
                    contentItem = await md.GetEntityObject('Content Items', contextUser);
                    contentItem.NewRecord();
                    contentItem.ContentSourceID = discoveryItem.contentSourceId;
                    // Get content source info for other required fields
                    const contentSource = await this.getContentSource(discoveryItem.contentSourceId, contextUser);
                    contentItem.ContentTypeID = contentSource.ContentTypeID;
                    contentItem.ContentSourceTypeID = contentSource.ContentSourceTypeID;
                    contentItem.Name = path.basename(filePath);
                    contentItem.URL = filePath;
                    // Dynamic file type detection
                    contentItem.ContentFileTypeID = await this.getContentFileTypeFromExtension(filePath, contextUser);
                    contentItem.Description = await this.engine.getContentItemDescription({
                        contentSourceID: discoveryItem.contentSourceId,
                        ContentTypeID: contentSource.ContentTypeID,
                        ContentSourceTypeID: contentSource.ContentSourceTypeID,
                        ContentFileTypeID: contentItem.ContentFileTypeID,
                        URL: filePath,
                        name: contentItem.Name
                    }, contextUser);
                }
                // Parse the content using the centralized method
                const parsedText = await this.engine.parseContentItem(contentItem, contextUser);
                contentItem.Text = parsedText;
                contentItem.Checksum = await this.engine.getChecksumFromText(parsedText);
                // Save the ContentItem
                const saveResult = await contentItem.Save();
                if (saveResult) {
                    console.log(`Successfully ${discoveryItem.action}d content item: ${path.basename(filePath)}`);
                    return contentItem;
                }
                else {
                    throw new Error(`Failed to save content item for ${filePath}`);
                }
            }
            catch (error) {
                console.error(`Failed to process file ${filePath}:`, error.message);
                throw error;
            }
        }
        // HELPER METHODS
        /**
         * Recursively scan directory for files
         */
        async scanDirectoryRecursive(dirPath) {
            const files = [];
            const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dirPath, item.name);
                if (item.isDirectory()) {
                    const subFiles = await this.scanDirectoryRecursive(fullPath);
                    files.push(...subFiles);
                }
                else if (item.isFile()) {
                    files.push(fullPath);
                }
            }
            return files;
        }
        /**
         * Check if file type is supported
         */
        isSupportedFileType(filePath) {
            const extension = path.extname(filePath).toLowerCase();
            const supportedExtensions = ['.pdf', '.docx', '.xlsx'];
            return supportedExtensions.includes(extension);
        }
        /**
         * Check if ContentItem already exists for this file path
         */
        async getExistingContentItemId(filePath, contentSourceId, contextUser) {
            try {
                const contentItemId = await this.engine.getContentItemIDFromURL({
                    contentSourceID: contentSourceId,
                    URL: filePath
                }, contextUser);
                return contentItemId;
            }
            catch {
                return null; // ContentItem doesn't exist
            }
        }
        /**
         * Get ContentSource entity by ID
         */
        async getContentSource(contentSourceId, contextUser) {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'Content Sources',
                ExtraFilter: `ID='${contentSourceId}'`,
                ResultType: 'entity_object'
            }, contextUser);
            if (result.Success && result.Results.length > 0) {
                return result.Results[0];
            }
            else {
                throw new Error(`ContentSource with ID ${contentSourceId} not found`);
            }
        }
        /**
         * Get ContentFileType ID based on file extension (dynamic file type detection)
         */
        async getContentFileTypeFromExtension(filePath, contextUser) {
            const extension = path.extname(filePath).toLowerCase();
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'Content File Types',
                ExtraFilter: `FileExtension='${extension}'`,
                ResultType: 'entity_object'
            }, contextUser);
            if (result.Success && result.Results.length > 0) {
                console.log(`File ${path.basename(filePath)} detected as ${extension} -> ContentFileType: ${result.Results[0].Name}`);
                return result.Results[0].ID;
            }
            else {
                throw new Error(`Unknown file extension ${extension} for file ${filePath}`);
            }
        }
        /**
         * Implemented abstract method from the AutotagBase class. that runs the entire autotagging process. This method is the entry point for the autotagging process.
         * It initializes the connection, retrieves the content sources corresponding to the content source type, sets the content items that we want to process,
         * extracts and processes the text, and sets the results in the database.
         */
        async Autotag(contextUser) {
            try {
                this.contextUser = contextUser;
                this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('Local File System', this.contextUser);
                const contentSources = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID) || [];
                const contentItemsToProcess = await this.SetContentItemsToProcess(contentSources);
                console.log(`Processing ${contentItemsToProcess.length} content items...`);
                // Use standard text processing (parsing was already done in SetContentItemsToProcess)
                await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
                console.log('✅ Autotagging process completed successfully!');
                console.log(`✅ Processed ${contentItemsToProcess.length} content items`);
            }
            catch (error) {
                console.error('❌ Autotagging process failed:', error.message);
                throw error;
            }
            finally {
                // Give a moment for any pending operations to complete, then exit
                setTimeout(() => {
                    console.log('🔄 Shutting down autotagging process...');
                    process.exit(0);
                }, 2000);
            }
        }
        /**
        * Implemented abstract method from the AutotagBase class. Given a list of content sources, this method should return a list
        * of content source items that have been modified or added after the most recent process run for that content source.
        * @param contentSources - An array of content sources to check for modified or added content source items
        * @returns - An array of content source items that have been modified or added after the most recent process run for that content source
        */
        async SetContentItemsToProcess(contentSources) {
            const contentItemsToProcess = [];
            for (const contentSource of contentSources) {
                // First check that the directory exists
                if (fs.existsSync(contentSource.URL)) {
                    const contentSourceParams = await this.setContentSourceParams(contentSource);
                    const lastRunDate = await this.engine.getContentSourceLastRunDate(contentSourceParams.contentSourceID, this.contextUser);
                    // Traverse through all the files in the directory
                    if (lastRunDate) {
                        const contentItems = await this.SetNewAndModifiedContentItems(contentSourceParams, lastRunDate, this.contextUser);
                        if (contentItems && contentItems.length > 0) {
                            contentItemsToProcess.push(...contentItems);
                        }
                        else {
                            // No content items found to process
                            console.log(`No content items found to process for content source: ${contentSource.Get('Name')}`);
                        }
                    }
                    else {
                        throw new Error('Invalid last run date');
                    }
                }
                else {
                    console.log(`Invalid Content Source ${contentSource.Name}`);
                }
            }
            return contentItemsToProcess;
        }
        async setContentSourceParams(contentSource) {
            // If content source parameters were provided, set them. Otherwise, use the default values.
            const contentSourceParamsMap = await this.engine.getContentSourceParams(contentSource, this.contextUser);
            if (contentSourceParamsMap) {
                // Override defaults with content source specific params
                contentSourceParamsMap.forEach((value, key) => {
                    if (key in this) {
                        this[key] = value;
                    }
                });
            }
            const contentSourceParams = {
                contentSourceID: contentSource.ID,
                name: contentSource.Name,
                ContentTypeID: contentSource.ContentTypeID,
                ContentSourceTypeID: contentSource.ContentSourceTypeID,
                ContentFileTypeID: contentSource.ContentFileTypeID,
                URL: contentSource.URL
            };
            return contentSourceParams;
        }
        /**
         * Given a content source and last run date, recursively traverse through the directory and return a
         * list of content source items that have been modified or added after the last run date.
         * @param contentSource
         * @param lastRunDate
         * @param contextUser
         * @returns
         */
        async SetNewAndModifiedContentItems(contentSourceParams, lastRunDate, contextUser) {
            const contentItems = [];
            let contentSourcePath = contentSourceParams.URL;
            const filesAndDirs = fs.readdirSync(contentSourcePath);
            for (const file of filesAndDirs) {
                const filePath = path.join(contentSourcePath, file);
                const stats = fs.statSync(filePath);
                if (stats.isDirectory()) {
                    contentSourceParams.URL = filePath;
                    await this.SetNewAndModifiedContentItems(contentSourceParams, lastRunDate, contextUser);
                }
                else if (stats.isFile()) {
                    const modifiedDate = new Date(stats.mtime.toUTCString());
                    const changedDate = new Date(stats.ctime.toUTCString());
                    if (changedDate > lastRunDate) {
                        // The file has been added, create a new record for this file
                        const contentItem = await this.setAddedContentItem(filePath, contentSourceParams);
                        contentItems.push(contentItem); // Content item was added, add to list
                    }
                    else if (modifiedDate > lastRunDate) {
                        // The file's contents has been, update the record for this file 
                        const contentItem = await this.setModifiedContentItem(filePath, contentSourceParams);
                        contentItems.push(contentItem);
                    }
                }
            }
            return contentItems;
        }
        async setAddedContentItem(filePath, contentSourceParams) {
            const md = new Metadata();
            try {
                // 1. Create ContentItem with basic metadata (no Text or Checksum yet)
                const contentItem = await md.GetEntityObject('Content Items', this.contextUser);
                contentItem.NewRecord();
                contentItem.ContentSourceID = contentSourceParams.contentSourceID;
                contentItem.Name = path.basename(filePath);
                contentItem.Description = await this.engine.getContentItemDescription(contentSourceParams, this.contextUser);
                contentItem.ContentTypeID = contentSourceParams.ContentTypeID;
                contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID;
                contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID;
                contentItem.URL = filePath;
                // Text and Checksum will be set after parsing
                // 2. Parse the content item using the new centralized method
                const parsedText = await this.engine.parseContentItem(contentItem, this.contextUser);
                // 3. Set parsed text and calculate checksum
                contentItem.Text = parsedText;
                contentItem.Checksum = await this.engine.getChecksumFromText(parsedText);
                // 4. Save the complete content item
                const saveResult = await contentItem.Save();
                if (saveResult) {
                    console.log(`Successfully created content item for: ${filePath}`);
                    return contentItem;
                }
                else {
                    throw new Error('Failed to save content item');
                }
            }
            catch (error) {
                console.error(`Failed to create content item for ${filePath}:`, error.message);
                throw error;
            }
        }
        async setModifiedContentItem(filePath, contentSourceParams) {
            try {
                const md = new Metadata();
                const contentItem = await md.GetEntityObject('Content Items', this.contextUser);
                const contentItemID = await this.engine.getContentItemIDFromURL(contentSourceParams, this.contextUser);
                await contentItem.Load(contentItemID);
                // Re-parse the content using the centralized method
                const parsedText = await this.engine.parseContentItem(contentItem, this.contextUser);
                // Update text and checksum
                contentItem.Text = parsedText;
                contentItem.Checksum = await this.engine.getChecksumFromText(parsedText);
                const saveResult = await contentItem.Save();
                if (saveResult) {
                    console.log(`Successfully updated content item for: ${filePath}`);
                    return contentItem;
                }
                else {
                    throw new Error('Failed to save updated content item');
                }
            }
            catch (error) {
                console.error(`Failed to update content item for ${filePath}:`, error.message);
                throw error;
            }
        }
    };
    return AutotagLocalFileSystem = _classThis;
})();
export { AutotagLocalFileSystem };
//# sourceMappingURL=AutotagLocalFileSystem.js.map
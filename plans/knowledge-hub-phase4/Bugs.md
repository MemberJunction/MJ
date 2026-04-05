# Bugs
## Classify / Content Pipeline Stuff
- Add Content Source in Classify Dashboard - when selecting an Entity - you are still asked for Content Type and File Type, not relevant for Entity. But what is releavnt is that you can pick the entity document for the selected ejntity (ONLY IF the selected entity has > 1 entity doc)
- When a ocntent source type is selected in that dialog we need to show the approriate fields. For example for Cloud Storage, we need to select an MJ Storage provider and a base path within that proivder to use, for Local File Ssystem we'd ask for a local file path, for web site/rss a URL, etc etc.
  - Do we have configuration information in the Content Source Types entity that tells us what each source type is expecting - ideally this configuration JSON tells us what is required of each content source type for each content source. Right now we have a Configuration field but it is null for all rows. We have an interface stub I think defined for this in /metadata/entities - we shoudl think this through and define an interafde shape that allows each content source type to tell us which fields are needed (any arbitrary number) for a given source of its type then make UI use that. 
- For the MJ: Content Sources entity, we also have a null configuration - we can define an interface same way and here the attributes of the SourceSpecificConfiguration sub-property would be a Record<string, any> to acount for anything and we would know what it is based on the type, and can also have in our code interfades for each type so we can strong type that too. Study this and give proposal on this before you code it, very important architecture.
- right now when you attempt to save a content source of Type entity it fails. in UI, you should always check .Save() result from entity.Save() operations and if false, chceck the LatestResult.CompleteMessage and put that to console and also use to share message with user when failure, right now we do red toast notification but no further info provided so not helpful. Probably missing fields I'd guess.

## Duplicate Detection
- When i tried to merge records in my test Vendors entity I got:
  Merge error: Entity Vendors does not allow record merging, check the AllowRecordMerge property in the entity metadata
  This is good in the sense of extra checks here, but probably we should check this in Metadata EntityInfo before running the dupe dection and give user a nice message saying somethign like "Hey, we can run the dupe detection but you won't be able to merge unless you enable this" and explain how. This would be a sysadmin setting of cousre but that way user isn't frustrated at end
- Confirm that we are using our built in Merge Records functionality that is in the Metadata/Provider architecture already

## Analytics
- Each drill down is nice, but from the table drill down we can't actually drill from there to the source record, we should make it possible to OpenEntityRecord from the table depending on what is in it, if an entity record in there (usually is). Some drill downs are not entities like quality score, so this wouldn't be available then
- Drill downs do nothing on the other tabs, only on the Overview tab, need drill down on all sections like Tags, Sources, etc.
- All Analytics featuers shoudl have export options to PDF, image or raw data to Excel/CSV. Use whatever built in lower level primitives we have for these features to not reinvent wheel, we do data expoerts in the Data Explorer app and entity-viewer package, levearge what we use there for the data side and for the image/PDF side use screen capture I guess unless chart lib has this built in then use that!





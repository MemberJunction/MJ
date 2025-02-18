--prior versions of CodeGen emitted nulls wrapped in quotes instead of as a literal null. This migration corrects that. and the code has also been
--updated to not emit the quotes around nulls. This migration will remove the quotes from the DefaultValue column in the EntityField table.
UPDATE ${flyway:defaultSchema}.EntityField SET DefaultValue=NULL WHERE DefaultValue='NULL';

-- add Skip to the AIAgent table
INSERT INTO ${flyway:defaultSchema}.AIAgent (ID, Name, Description, LogoURL) 
VALUES ('CC7A433E-F36B-1410-8D98-00021F8B792E', 'Skip','Skip AI Data Analyst by MemberJunction','https://askskip.ai/hubfs/SkipFavicon.png')

-- FIX UP SOME ERRONEOUS SEQUENCES IN THE ENTITYFIELD TABLE FOR THE USER NOTIFICATIONS TABLE
UPDATE ${flyway:defaultSchema}.EntityField 
  SET 
    Sequence=12,
    Type='uniqueidentifier', Length=16, Precision=0 -- these fields were still INT/4/10 for some reason, OLD metadata that never got refreshed... 
  WHERE 
    ID='594F17F0-6F36-EF11-86D4-6045BDEE16E6' -- User Notifications.ResourceRecordID

UPDATE ${flyway:defaultSchema}.EntityField SET Sequence=13 WHERE ID='6F4317F0-6F36-EF11-86D4-6045BDEE16E6' -- User Notifications.User
UPDATE ${flyway:defaultSchema}.EntityField SET Sequence=14 WHERE ID='F1A8FEEC-7840-EF11-86C3-00224821D189' -- User Notifications.ResourceType
UPDATE ${flyway:defaultSchema}.EntityField SET Sequence=Sequence-1 WHERE Sequence>=7 AND EntityID='14248F34-2837-EF11-86D4-6045BDEE16E6' -- now, downshift all of the User Notificaiton Sequences for the empty spot for having moved ResourceRecordID
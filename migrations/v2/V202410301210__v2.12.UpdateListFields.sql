UPDATE [${flyway:defaultSchema}].[Entityfield]
SET    DefaultInView = 1
WHERE  ID IN ( 'C94217F0-6F36-EF11-86D4-6045BDEE16E6', -- List.ID
               'A14D17F0-6F36-EF11-86D4-6045BDEE16E6', -- List.Name 
               'A24D17F0-6F36-EF11-86D4-6045BDEE16E6', -- List.Description
               'A64D17F0-6F36-EF11-86D4-6045BDEE16E6', -- ListDetail.ID
               'A34D17F0-6F36-EF11-86D4-6045BDEE16E6', -- ListDetail.ListID
               'A44D17F0-6F36-EF11-86D4-6045BDEE16E6', -- ListDetail.RecordID
               'A54D17F0-6F36-EF11-86D4-6045BDEE16E6', -- ListDetail.Sequence,
               'CD43433E-F36B-1410-8560-0041FA62858A'  -- ListDetail.AdditionalData
              )

UPDATE [${flyway:defaultSchema}].EntityField
SET    DefaultInView = 0
WHERE  ID = '555817F0-6F36-EF11-86D4-6045BDEE16E6' -- ListDetail.__mj_CreatedAt


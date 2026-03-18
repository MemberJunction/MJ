/* Set soft PK for YourMembership.Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08' AND [Name] = 'ProfileID'

/* Set soft FK for YourMembership.Member.MemberTypeCode → MemberType.TypeCode */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '94BFEFB5-2E4A-4499-BDED-F9197287D761',
                                    [RelatedEntityFieldName] = 'TypeCode',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08' AND [Name] = 'MemberTypeCode'

/* Set soft FK for YourMembership.Member.Country → Country.countryId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'A694C1ED-2BE5-4895-8292-E6377412B980',
                                    [RelatedEntityFieldName] = 'countryId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08' AND [Name] = 'Country'

/* Set soft PK for YourMembership.Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.MemberType.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '94BFEFB5-2E4A-4499-BDED-F9197287D761' AND [Name] = 'ID'

/* Set soft PK for YourMembership.Membership.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C8B8595D-F148-4DEE-B22B-F3FCD754363A' AND [Name] = 'Id'

/* Set soft PK for YourMembership.Group.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8EE7A6AF-EDDD-41A9-9261-86D75B5E25BC' AND [Name] = 'Id'

/* Set soft FK for YourMembership.Group.GroupTypeId → GroupType.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '77038FFA-ABAF-442E-B05D-3B1B1353EEAD',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '8EE7A6AF-EDDD-41A9-9261-86D75B5E25BC' AND [Name] = 'GroupTypeId'

/* Set soft PK for YourMembership.Product.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6525C9E6-6F94-412B-A4CF-B593AB351343' AND [Name] = 'id'

/* Set soft PK for YourMembership.DonationFund.fundId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '03CE4713-C5FC-4998-A6B6-57CFD787A21D' AND [Name] = 'fundId'

/* Set soft PK for YourMembership.Certification.CertificationID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5F6EC2D0-09D9-435F-9A89-3A03ADEAD39A' AND [Name] = 'CertificationID'

/* Set soft PK for YourMembership.InvoiceItem.LineItemID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0' AND [Name] = 'LineItemID'

/* Set soft FK for YourMembership.InvoiceItem.WebSiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0' AND [Name] = 'WebSiteMemberID'

/* Set soft FK for YourMembership.InvoiceItem.GLCodeItemName → GLCode.GLCodeName */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'E2A0E2D0-5CEC-4424-83CD-37E2349379DA',
                                    [RelatedEntityFieldName] = 'GLCodeName',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0' AND [Name] = 'GLCodeItemName'

/* Set soft FK for YourMembership.InvoiceItem.QBClassItemName → QBClass.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'DB54BB01-FEA4-49CD-82F9-8D0140CD61D3',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0' AND [Name] = 'QBClassItemName'

/* Set soft FK for YourMembership.InvoiceItem.InvoiceNo → StoreOrder.OrderID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '4BCFB338-C625-435F-A1B7-4C64B12AA19D',
                                    [RelatedEntityFieldName] = 'OrderID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0' AND [Name] = 'InvoiceNo'

/* Set soft PK for YourMembership.DuesTransaction.TransactionID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '505CB043-3A82-407A-B9A7-7233772AB994' AND [Name] = 'TransactionID'

/* Set soft FK for YourMembership.DuesTransaction.WebsiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '505CB043-3A82-407A-B9A7-7233772AB994' AND [Name] = 'WebsiteMemberID'

/* Set soft FK for YourMembership.DuesTransaction.MemberType → MemberType.TypeCode */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '94BFEFB5-2E4A-4499-BDED-F9197287D761',
                                    [RelatedEntityFieldName] = 'TypeCode',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '505CB043-3A82-407A-B9A7-7233772AB994' AND [Name] = 'MemberType'

/* Set soft PK for YourMembership.EventRegistration.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C12729F5-A6CF-4114-BB8D-61FA041E7F09' AND [Name] = 'Id'

/* Set soft FK for YourMembership.EventRegistration.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C12729F5-A6CF-4114-BB8D-61FA041E7F09' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.EventSession.SessionId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '465B0B78-02B4-4442-AA66-33796DAB50DA' AND [Name] = 'SessionId'

/* Set soft FK for YourMembership.EventSession.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '465B0B78-02B4-4442-AA66-33796DAB50DA' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.EventTicket.TicketId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1E432025-5472-427B-A43C-D4B13FAABECF' AND [Name] = 'TicketId'

/* Set soft FK for YourMembership.EventTicket.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '1E432025-5472-427B-A43C-D4B13FAABECF' AND [Name] = 'EventId'

/* Set soft FK for YourMembership.EventTicket.Category → EventCategory.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '935E7671-FADE-4AFF-A287-7D305EEA4004',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '1E432025-5472-427B-A43C-D4B13FAABECF' AND [Name] = 'Category'

/* Set soft PK for YourMembership.EventCategory.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '935E7671-FADE-4AFF-A287-7D305EEA4004' AND [Name] = 'Id'

/* Set soft PK for YourMembership.MemberGroup.MemberGroupId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F832CD3F-68CF-4F85-9590-A91CCCD6AAB5' AND [Name] = 'MemberGroupId'

/* Set soft FK for YourMembership.MemberGroup.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F832CD3F-68CF-4F85-9590-A91CCCD6AAB5' AND [Name] = 'ProfileID'

/* Set soft FK for YourMembership.MemberGroup.GroupId → Group.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '8EE7A6AF-EDDD-41A9-9261-86D75B5E25BC',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F832CD3F-68CF-4F85-9590-A91CCCD6AAB5' AND [Name] = 'GroupId'

/* Set soft FK for YourMembership.MemberGroup.GroupTypeId → GroupType.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '77038FFA-ABAF-442E-B05D-3B1B1353EEAD',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F832CD3F-68CF-4F85-9590-A91CCCD6AAB5' AND [Name] = 'GroupTypeId'

/* Set soft PK for YourMembership.Connection.ConnectionId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '14709D82-1EFA-4F7F-9A6F-238D8A910A89' AND [Name] = 'ConnectionId'

/* Set soft FK for YourMembership.Connection.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '14709D82-1EFA-4F7F-9A6F-238D8A910A89' AND [Name] = 'ProfileID'

/* Set soft PK for YourMembership.DonationHistory.intDonationId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F58F4447-D46F-47D2-B44C-45B238594B12' AND [Name] = 'intDonationId'

/* Set soft FK for YourMembership.DonationHistory.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F58F4447-D46F-47D2-B44C-45B238594B12' AND [Name] = 'ProfileID'

/* Set soft FK for YourMembership.DonationHistory.intDonationId → DonationTransaction.TransactionID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '23860586-3034-436F-B629-C4CE071357C1',
                                    [RelatedEntityFieldName] = 'TransactionID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F58F4447-D46F-47D2-B44C-45B238594B12' AND [Name] = 'intDonationId'

/* Set soft PK for YourMembership.EngagementScore.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CCECDA70-5577-4DC0-81A1-D0A35DB81701' AND [Name] = 'ProfileID'

/* Set soft FK for YourMembership.EngagementScore.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'CCECDA70-5577-4DC0-81A1-D0A35DB81701' AND [Name] = 'ProfileID'

/* Set soft PK for YourMembership.GroupType.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '77038FFA-ABAF-442E-B05D-3B1B1353EEAD' AND [Name] = 'Id'

/* Set soft PK for YourMembership.DonationTransaction.TransactionID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '23860586-3034-436F-B629-C4CE071357C1' AND [Name] = 'TransactionID'

/* Set soft FK for YourMembership.DonationTransaction.WebsiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '23860586-3034-436F-B629-C4CE071357C1' AND [Name] = 'WebsiteMemberID'

/* Set soft FK for YourMembership.DonationTransaction.FundName → DonationFund.fundName */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '03CE4713-C5FC-4998-A6B6-57CFD787A21D',
                                    [RelatedEntityFieldName] = 'fundName',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '23860586-3034-436F-B629-C4CE071357C1' AND [Name] = 'FundName'

/* Set soft PK for YourMembership.StoreOrder.OrderID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4BCFB338-C625-435F-A1B7-4C64B12AA19D' AND [Name] = 'OrderID'

/* Set soft FK for YourMembership.StoreOrder.WebsiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4BCFB338-C625-435F-A1B7-4C64B12AA19D' AND [Name] = 'WebsiteMemberID'

/* Set soft FK for YourMembership.StoreOrder.ShippingMethod → ShippingMethod.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C212F21F-167E-4CFC-98F3-0D82BE69CFAE',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4BCFB338-C625-435F-A1B7-4C64B12AA19D' AND [Name] = 'ShippingMethod'

/* Set soft PK for YourMembership.StoreOrderDetail.OrderDetailID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4C06760F-6564-4BED-B54E-93248DE64F45' AND [Name] = 'OrderDetailID'

/* Set soft FK for YourMembership.StoreOrderDetail.OrderID → StoreOrder.OrderID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '4BCFB338-C625-435F-A1B7-4C64B12AA19D',
                                    [RelatedEntityFieldName] = 'OrderID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4C06760F-6564-4BED-B54E-93248DE64F45' AND [Name] = 'OrderID'

/* Set soft FK for YourMembership.StoreOrderDetail.WebsiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4C06760F-6564-4BED-B54E-93248DE64F45' AND [Name] = 'WebsiteMemberID'

/* Set soft FK for YourMembership.StoreOrderDetail.ShippingMethod → ShippingMethod.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C212F21F-167E-4CFC-98F3-0D82BE69CFAE',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4C06760F-6564-4BED-B54E-93248DE64F45' AND [Name] = 'ShippingMethod'

/* Set soft PK for YourMembership.CertificationJournal.EntryID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '2BDB1786-D256-45AC-BFA8-9AA4CF8A0F48' AND [Name] = 'EntryID'

/* Set soft FK for YourMembership.CertificationJournal.WebsiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '2BDB1786-D256-45AC-BFA8-9AA4CF8A0F48' AND [Name] = 'WebsiteMemberID'

/* Set soft PK for YourMembership.CertificationCreditType.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '57038F58-C239-4E6B-AF4B-39961551C126' AND [Name] = 'ID'

/* Set soft PK for YourMembership.ProductCategory.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6670A77F-323E-4749-8CF6-7F37E240E3B9' AND [Name] = 'Id'

/* Set soft PK for YourMembership.CareerOpening.CareerOpeningID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '020EE023-76B0-4D95-ADF2-DD5C4804A96B' AND [Name] = 'CareerOpeningID'

/* Set soft PK for YourMembership.Campaign.CampaignId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9FCE89B2-43AB-4576-9468-EBA58CDA179F' AND [Name] = 'CampaignId'

/* Set soft PK for YourMembership.GLCode.GLCodeId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E2A0E2D0-5CEC-4424-83CD-37E2349379DA' AND [Name] = 'GLCodeId'

/* Set soft PK for YourMembership.MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801' AND [Name] = 'ProfileID'

/* Set soft FK for YourMembership.MemberProfile.MemberTypeCode → MemberType.TypeCode */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '94BFEFB5-2E4A-4499-BDED-F9197287D761',
                                    [RelatedEntityFieldName] = 'TypeCode',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801' AND [Name] = 'MemberTypeCode'

/* Set soft PK for YourMembership.PersonID.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E5A144BD-DEF9-41BD-9E58-47DC3B622515' AND [Name] = 'ID'

/* Set soft PK for YourMembership.MemberGroupBulk.WebSiteMemberID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C992FDA2-803A-4320-99D0-CAC85BF3A821' AND [Name] = 'WebSiteMemberID'

/* Set soft PK for YourMembership.MemberGroupBulk.GroupID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C992FDA2-803A-4320-99D0-CAC85BF3A821' AND [Name] = 'GroupID'

/* Set soft FK for YourMembership.MemberGroupBulk.WebSiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C992FDA2-803A-4320-99D0-CAC85BF3A821' AND [Name] = 'WebSiteMemberID'

/* Set soft FK for YourMembership.MemberGroupBulk.GroupID → Group.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '8EE7A6AF-EDDD-41A9-9261-86D75B5E25BC',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C992FDA2-803A-4320-99D0-CAC85BF3A821' AND [Name] = 'GroupID'

/* Set soft PK for YourMembership.FinanceBatch.BatchID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1B5B7CBD-E2A1-49FB-A6D6-785FAB79F01E' AND [Name] = 'BatchID'

/* Set soft PK for YourMembership.FinanceBatchDetail.DetailID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '878586B4-F6B5-4D74-83AA-C445FBAAE84E' AND [Name] = 'DetailID'

/* Set soft FK for YourMembership.FinanceBatchDetail.BatchID → FinanceBatch.BatchID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '1B5B7CBD-E2A1-49FB-A6D6-785FAB79F01E',
                                    [RelatedEntityFieldName] = 'BatchID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '878586B4-F6B5-4D74-83AA-C445FBAAE84E' AND [Name] = 'BatchID'

/* Set soft PK for YourMembership.AllCampaign.CampaignId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '11912C5A-4706-4796-BD77-FB3B5F660B5A' AND [Name] = 'CampaignId'

/* Set soft PK for YourMembership.CampaignEmailList.ListId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1FA3156F-D157-4121-A0CD-A73187DC3E8A' AND [Name] = 'ListId'

/* Set soft PK for YourMembership.EventAttendeeType.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '06CEC46D-E396-4ED2-BC96-0C59F15225B4' AND [Name] = 'Id'

/* Set soft FK for YourMembership.EventAttendeeType.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '06CEC46D-E396-4ED2-BC96-0C59F15225B4' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.EventSessionGroup.SessionGroupId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9B81C81A-A11D-44A1-8CB2-D7FEFA22574B' AND [Name] = 'SessionGroupId'

/* Set soft FK for YourMembership.EventSessionGroup.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '9B81C81A-A11D-44A1-8CB2-D7FEFA22574B' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.EventCEUAward.AwardID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '047536B2-5302-42E6-A0A1-5B1C0AD3469B' AND [Name] = 'AwardID'

/* Set soft FK for YourMembership.EventCEUAward.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '047536B2-5302-42E6-A0A1-5B1C0AD3469B' AND [Name] = 'EventId'

/* Set soft FK for YourMembership.EventCEUAward.CertificationID → Certification.CertificationID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '5F6EC2D0-09D9-435F-9A89-3A03ADEAD39A',
                                    [RelatedEntityFieldName] = 'CertificationID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '047536B2-5302-42E6-A0A1-5B1C0AD3469B' AND [Name] = 'CertificationID'

/* Set soft FK for YourMembership.EventCEUAward.CreditTypeID → CertificationCreditType.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '57038F58-C239-4E6B-AF4B-39961551C126',
                                    [RelatedEntityFieldName] = 'ID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '047536B2-5302-42E6-A0A1-5B1C0AD3469B' AND [Name] = 'CreditTypeID'

/* Set soft PK for YourMembership.EventRegistrationForm.FormId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '704AF929-EB18-41C2-B4D8-FACDDB8F6336' AND [Name] = 'FormId'

/* Set soft PK for YourMembership.EventID.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '880A1545-DA68-4A31-8C80-A5E7117A5F80' AND [Name] = 'EventId'

/* Set soft FK for YourMembership.EventID.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '880A1545-DA68-4A31-8C80-A5E7117A5F80' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.GroupMembershipLog.ItemID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8F90B826-7C47-4A2F-96A2-1233F6EBB718' AND [Name] = 'ItemID'

/* Set soft FK for YourMembership.GroupMembershipLog.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '8F90B826-7C47-4A2F-96A2-1233F6EBB718' AND [Name] = 'ProfileID'

/* Set soft PK for YourMembership.DuesRule.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FCA2DB70-0291-4183-BF86-965DA9A33DDC' AND [Name] = 'ID'

/* Set soft PK for YourMembership.MemberReferral.ReferralId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '863D2F30-9416-4812-9BC7-251F764E9432' AND [Name] = 'ReferralId'

/* Set soft FK for YourMembership.MemberReferral.ReferrerID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '863D2F30-9416-4812-9BC7-251F764E9432' AND [Name] = 'ReferrerID'

/* Set soft FK for YourMembership.MemberReferral.ReferredID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '863D2F30-9416-4812-9BC7-251F764E9432' AND [Name] = 'ReferredID'

/* Set soft PK for YourMembership.MemberSubAccount.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '97454CB7-2D2D-4458-98CA-1420D97556CF' AND [Name] = 'ID'

/* Set soft FK for YourMembership.MemberSubAccount.ID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '97454CB7-2D2D-4458-98CA-1420D97556CF' AND [Name] = 'ID'

/* Set soft FK for YourMembership.MemberSubAccount.ParentID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '97454CB7-2D2D-4458-98CA-1420D97556CF' AND [Name] = 'ParentID'

/* Set soft PK for YourMembership.Country.countryId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A694C1ED-2BE5-4895-8292-E6377412B980' AND [Name] = 'countryId'

/* Set soft PK for YourMembership.Location.locationCode */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'AFB37B76-7291-4F9B-95D7-BB7916749DED' AND [Name] = 'locationCode'

/* Set soft FK for YourMembership.Location.countryId → Country.countryId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'A694C1ED-2BE5-4895-8292-E6377412B980',
                                    [RelatedEntityFieldName] = 'countryId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'AFB37B76-7291-4F9B-95D7-BB7916749DED' AND [Name] = 'countryId'

/* Set soft PK for YourMembership.ShippingMethod.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C212F21F-167E-4CFC-98F3-0D82BE69CFAE' AND [Name] = 'id'

/* Set soft PK for YourMembership.PaymentProcessor.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E0BE164C-FA55-422A-9568-AA1A487A995A' AND [Name] = 'Id'

/* Set soft PK for YourMembership.CustomTaxLocation.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E776E6E7-5EEF-493B-B1C2-BE912B82BDF1' AND [Name] = 'Id'

/* Set soft PK for YourMembership.QBClass.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DB54BB01-FEA4-49CD-82F9-8D0140CD61D3' AND [Name] = 'Id'

/* Set soft PK for YourMembership.MembershipModifier.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '496C9ECD-5B63-4F09-83DE-7C1984DD4A35' AND [Name] = 'ID'

/* Set soft FK for YourMembership.MembershipModifier.MembershipID → Membership.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8B8595D-F148-4DEE-B22B-F3FCD754363A',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '496C9ECD-5B63-4F09-83DE-7C1984DD4A35' AND [Name] = 'MembershipID'

/* Set soft PK for YourMembership.MembershipPromoCode.PromoCodeId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A9F2A9F8-E37A-4524-96ED-1C1D36ADE02B' AND [Name] = 'PromoCodeId'

/* Set soft FK for YourMembership.MembershipPromoCode.MembershipID → Membership.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8B8595D-F148-4DEE-B22B-F3FCD754363A',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'A9F2A9F8-E37A-4524-96ED-1C1D36ADE02B' AND [Name] = 'MembershipID'

/* Set soft PK for YourMembership.Announcement.AnnouncementId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '773EED61-C801-4541-B5CF-1F76AC7F8A94' AND [Name] = 'AnnouncementId'

/* Set soft PK for YourMembership.EmailSuppressionList.Email */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '456577C0-3BD3-4C79-A1D9-F7093FF020C9' AND [Name] = 'Email'

/* Set soft PK for YourMembership.SponsorRotator.RotatorId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D6B41B71-FB71-45FD-AEE9-BA193960CE2F' AND [Name] = 'RotatorId'

/* Set soft PK for YourMembership.MemberNetwork.NetworkId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3DEE5D4B-4A59-45AB-9A66-AC16DEA4D83D' AND [Name] = 'NetworkId'

/* Set soft FK for YourMembership.MemberNetwork.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3DEE5D4B-4A59-45AB-9A66-AC16DEA4D83D' AND [Name] = 'ProfileID'

/* Set soft PK for YourMembership.MemberFavorite.FavoriteId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E7AFC988-7509-4034-BC89-7AD48500EF46' AND [Name] = 'FavoriteId'

/* Set soft FK for YourMembership.MemberFavorite.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'E7AFC988-7509-4034-BC89-7AD48500EF46' AND [Name] = 'ProfileID'

/* Set soft PK for YourMembership.TimeZone.fullName */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6FF0DA58-B2DC-4E68-A981-84493AC4D9E4' AND [Name] = 'fullName'

/* Set soft PK for HubSpot.Contact.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FC68FEEC-0410-48C2-844E-469EBB614A3E' AND [Name] = 'hs_object_id'

/* Set soft FK for HubSpot.Contact.associatedcompanyid → Company.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '41C62BFA-6A14-4FC5-8612-92F2621F2119',
                                    [RelatedEntityFieldName] = 'hs_object_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'FC68FEEC-0410-48C2-844E-469EBB614A3E' AND [Name] = 'associatedcompanyid'

/* Set soft PK for HubSpot.Company.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '41C62BFA-6A14-4FC5-8612-92F2621F2119' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Deal.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C01E4DEF-458D-47AA-AF60-CC46A3ED90E2' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Ticket.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '7312A9B6-291E-4E39-8B96-885DEC5734D6' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Product.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5DE0A4FF-D898-42E6-A79A-4758A7E1E93A' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.LineItem.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F834B20B-683C-479D-A05C-09533ED35B18' AND [Name] = 'hs_object_id'

/* Set soft FK for HubSpot.LineItem.hs_product_id → Product.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '5DE0A4FF-D898-42E6-A79A-4758A7E1E93A',
                                    [RelatedEntityFieldName] = 'hs_object_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F834B20B-683C-479D-A05C-09533ED35B18' AND [Name] = 'hs_product_id'

/* Set soft PK for HubSpot.Quote.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B855C126-D8D2-4EAE-B052-915FFF4C7A5D' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Call.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3810B85B-9182-4779-B361-8A97A5565D04' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Email.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '08C534E4-7B71-4E83-86A9-628106E2C25B' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Note.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BF41E527-79B4-4923-9B7F-23967FC5D7F9' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Task.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '622EFB4D-03AE-404D-8799-F3865ED31218' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Meeting.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BDE08C93-DB12-4D3C-AB73-25BD91842B5B' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.FeedbackSubmission.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '246B6790-F7C2-42E0-99E3-DD548F14E282' AND [Name] = 'hs_object_id'


/* Create Entity Relationship: Shipping Methods -> Store Orders (One To Many via ShippingMethod) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ba815e36-ea7c-46ca-ace4-c3ff1a6625a0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ba815e36-ea7c-46ca-ace4-c3ff1a6625a0', 'C212F21F-167E-4CFC-98F3-0D82BE69CFAE', '4BCFB338-C625-435F-A1B7-4C64B12AA19D', 'ShippingMethod', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Shipping Methods -> Store Order Details (One To Many via ShippingMethod) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '40b99ba7-a360-411b-ba70-2d0c6d7a32b1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('40b99ba7-a360-411b-ba70-2d0c6d7a32b1', 'C212F21F-167E-4CFC-98F3-0D82BE69CFAE', '4C06760F-6564-4BED-B54E-93248DE64F45', 'ShippingMethod', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: GL Codes -> Invoice Items (One To Many via GLCodeItemName) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '35986c3b-7870-4800-94a4-54e7c48f8141'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('35986c3b-7870-4800-94a4-54e7c48f8141', 'E2A0E2D0-5CEC-4424-83CD-37E2349379DA', 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0', 'GLCodeItemName', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Certification Credit Types -> Event CEU Awards (One To Many via CreditTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4f699605-3ed8-4bf2-8add-d75471893e07'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4f699605-3ed8-4bf2-8add-d75471893e07', '57038F58-C239-4E6B-AF4B-39961551C126', '047536B2-5302-42E6-A0A1-5B1C0AD3469B', 'CreditTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Certifications -> Event CEU Awards (One To Many via CertificationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7ab36014-9676-4c16-bbd6-8ce710be606b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7ab36014-9676-4c16-bbd6-8ce710be606b', '5F6EC2D0-09D9-435F-9A89-3A03ADEAD39A', '047536B2-5302-42E6-A0A1-5B1C0AD3469B', 'CertificationID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Group Types -> Member Groups (One To Many via GroupTypeId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b6d17b58-1226-42f0-9d3c-c1d0b746c34b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b6d17b58-1226-42f0-9d3c-c1d0b746c34b', '77038FFA-ABAF-442E-B05D-3B1B1353EEAD', 'F832CD3F-68CF-4F85-9590-A91CCCD6AAB5', 'GroupTypeId', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Group Types -> Groups (One To Many via GroupTypeId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a9ee8fb0-509d-4991-8624-fc2afb17fe24'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a9ee8fb0-509d-4991-8624-fc2afb17fe24', '77038FFA-ABAF-442E-B05D-3B1B1353EEAD', '8EE7A6AF-EDDD-41A9-9261-86D75B5E25BC', 'GroupTypeId', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Products__HubSpot -> Line Items (One To Many via hs_product_id) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '54fcc8a3-6f53-4f90-8acb-34e16e97874d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('54fcc8a3-6f53-4f90-8acb-34e16e97874d', '5DE0A4FF-D898-42E6-A79A-4758A7E1E93A', 'F834B20B-683C-479D-A05C-09533ED35B18', 'hs_product_id', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Store Orders -> Store Order Details (One To Many via OrderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a13965f9-6146-4c74-a39e-d89912a126a9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a13965f9-6146-4c74-a39e-d89912a126a9', '4BCFB338-C625-435F-A1B7-4C64B12AA19D', '4C06760F-6564-4BED-B54E-93248DE64F45', 'OrderID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Store Orders -> Invoice Items (One To Many via InvoiceNo) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '74f7ad09-a4b8-40ad-93c3-380a60165f5a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('74f7ad09-a4b8-40ad-93c3-380a60165f5a', '4BCFB338-C625-435F-A1B7-4C64B12AA19D', 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0', 'InvoiceNo', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Donation Funds -> Donation Transactions (One To Many via FundName) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e7997b99-f917-4ff3-812c-5adda6ac5622'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e7997b99-f917-4ff3-812c-5adda6ac5622', '03CE4713-C5FC-4998-A6B6-57CFD787A21D', '23860586-3034-436F-B629-C4CE071357C1', 'FundName', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Events -> Event Registrations (One To Many via EventId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '404ed770-c646-4561-b815-a1d08eb0922e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('404ed770-c646-4561-b815-a1d08eb0922e', 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2', 'C12729F5-A6CF-4114-BB8D-61FA041E7F09', 'EventId', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Events -> Event Tickets (One To Many via EventId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5c050c00-d29b-4eb5-a004-590d76a14238'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5c050c00-d29b-4eb5-a004-590d76a14238', 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2', '1E432025-5472-427B-A43C-D4B13FAABECF', 'EventId', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Events -> Event IDs (One To Many via EventId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '384a7ab0-cf33-4933-b9b0-2224085563f4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('384a7ab0-cf33-4933-b9b0-2224085563f4', 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2', '880A1545-DA68-4A31-8C80-A5E7117A5F80', 'EventId', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Events -> Event CEU Awards (One To Many via EventId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c56f8441-47b9-4df8-9109-d02499362245'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c56f8441-47b9-4df8-9109-d02499362245', 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2', '047536B2-5302-42E6-A0A1-5B1C0AD3469B', 'EventId', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Events -> Event Sessions (One To Many via EventId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9b9a1a26-e290-4911-ba56-5dcb1f8df084'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9b9a1a26-e290-4911-ba56-5dcb1f8df084', 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2', '465B0B78-02B4-4442-AA66-33796DAB50DA', 'EventId', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Events -> Event Attendee Types (One To Many via EventId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '418102e1-5670-4f99-b78a-da8658cd4314'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('418102e1-5670-4f99-b78a-da8658cd4314', 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2', '06CEC46D-E396-4ED2-BC96-0C59F15225B4', 'EventId', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Events -> Event Session Groups (One To Many via EventId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7c6c8829-7546-4229-83d8-e3529a4c2c36'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7c6c8829-7546-4229-83d8-e3529a4c2c36', 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2', '9B81C81A-A11D-44A1-8CB2-D7FEFA22574B', 'EventId', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Finance Batches -> Finance Batch Details (One To Many via BatchID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1875bb27-e5fe-4454-9b0a-ee7cae694c6c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1875bb27-e5fe-4454-9b0a-ee7cae694c6c', '1B5B7CBD-E2A1-49FB-A6D6-785FAB79F01E', '878586B4-F6B5-4D74-83AA-C445FBAAE84E', 'BatchID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Event Categories -> Event Tickets (One To Many via Category) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5a575b58-9bc0-4243-80fd-6dfa52280a64'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5a575b58-9bc0-4243-80fd-6dfa52280a64', '935E7671-FADE-4AFF-A287-7D305EEA4004', '1E432025-5472-427B-A43C-D4B13FAABECF', 'Category', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Members -> Member Group Bulks (One To Many via WebSiteMemberID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '88587e63-26d1-4a9f-9f64-1e31307f26da'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('88587e63-26d1-4a9f-9f64-1e31307f26da', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', 'C992FDA2-803A-4320-99D0-CAC85BF3A821', 'WebSiteMemberID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Members -> Donation Transactions (One To Many via WebsiteMemberID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'cbfaab7b-8a7e-4e9f-868a-124d1a579618'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('cbfaab7b-8a7e-4e9f-868a-124d1a579618', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', '23860586-3034-436F-B629-C4CE071357C1', 'WebsiteMemberID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Members -> Certification Journals (One To Many via WebsiteMemberID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '853e99c6-49f3-437a-a424-224db652351f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('853e99c6-49f3-437a-a424-224db652351f', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', '2BDB1786-D256-45AC-BFA8-9AA4CF8A0F48', 'WebsiteMemberID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Members -> Store Order Details (One To Many via WebsiteMemberID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7f531c62-97b5-4991-a896-fe288520bd3d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7f531c62-97b5-4991-a896-fe288520bd3d', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', '4C06760F-6564-4BED-B54E-93248DE64F45', 'WebsiteMemberID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Members -> Dues Transactions (One To Many via WebsiteMemberID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a90ca908-462b-48d1-aefb-f485495dc259'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a90ca908-462b-48d1-aefb-f485495dc259', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', '505CB043-3A82-407A-B9A7-7233772AB994', 'WebsiteMemberID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Members -> Member Referrals (One To Many via ReferredID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f3055b1f-d038-4b79-89fc-859252026615'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f3055b1f-d038-4b79-89fc-859252026615', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', '863D2F30-9416-4812-9BC7-251F764E9432', 'ReferredID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Members -> Member Referrals (One To Many via ReferrerID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '77b1efe4-376d-43d3-b27f-b8a2be69ad93'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('77b1efe4-376d-43d3-b27f-b8a2be69ad93', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', '863D2F30-9416-4812-9BC7-251F764E9432', 'ReferrerID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Members -> Member Sub Accounts (One To Many via ID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '949c3198-40eb-4718-bd51-5ed8f3268e9e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('949c3198-40eb-4718-bd51-5ed8f3268e9e', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', '97454CB7-2D2D-4458-98CA-1420D97556CF', 'ID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Members -> Member Sub Accounts (One To Many via ParentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '282e7988-038c-40cd-ac9c-b273ea6ce96f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('282e7988-038c-40cd-ac9c-b273ea6ce96f', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', '97454CB7-2D2D-4458-98CA-1420D97556CF', 'ParentID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Members -> Store Orders (One To Many via WebsiteMemberID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7ea230ad-21cc-4761-bcd7-58bb2b729eb2'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7ea230ad-21cc-4761-bcd7-58bb2b729eb2', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', '4BCFB338-C625-435F-A1B7-4C64B12AA19D', 'WebsiteMemberID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Members -> Invoice Items (One To Many via WebSiteMemberID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '93bc7d3b-568b-4b37-950b-bd381f3eb8de'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('93bc7d3b-568b-4b37-950b-bd381f3eb8de', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0', 'WebSiteMemberID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Groups -> Member Groups (One To Many via GroupId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ecdab10a-39fc-4b22-84d8-c34666b5980b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ecdab10a-39fc-4b22-84d8-c34666b5980b', '8EE7A6AF-EDDD-41A9-9261-86D75B5E25BC', 'F832CD3F-68CF-4F85-9590-A91CCCD6AAB5', 'GroupId', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Groups -> Member Group Bulks (One To Many via GroupID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c6b14beb-0cd2-44e7-ba58-fac3f30d27ce'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c6b14beb-0cd2-44e7-ba58-fac3f30d27ce', '8EE7A6AF-EDDD-41A9-9261-86D75B5E25BC', 'C992FDA2-803A-4320-99D0-CAC85BF3A821', 'GroupID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: QB Classes -> Invoice Items (One To Many via QBClassItemName) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '90a00d3f-9f0f-48d6-87e1-8af52be8ccec'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('90a00d3f-9f0f-48d6-87e1-8af52be8ccec', 'DB54BB01-FEA4-49CD-82F9-8D0140CD61D3', 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0', 'QBClassItemName', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Companies -> Contacts (One To Many via associatedcompanyid) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b3ec0aaf-6a1c-45ba-8f70-6515542bd9a4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b3ec0aaf-6a1c-45ba-8f70-6515542bd9a4', '41C62BFA-6A14-4FC5-8612-92F2621F2119', 'FC68FEEC-0410-48C2-844E-469EBB614A3E', 'associatedcompanyid', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Member Profiles -> Donation Histories (One To Many via ProfileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dbd08b31-3327-4f37-acb5-03031ee88a62'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dbd08b31-3327-4f37-acb5-03031ee88a62', '89BF89AE-396C-44CA-A382-9E2EF46BD801', 'F58F4447-D46F-47D2-B44C-45B238594B12', 'ProfileID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Member Profiles -> Group Membership Logs (One To Many via ProfileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '026620b5-1d99-43ed-90eb-b9d5ef813995'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('026620b5-1d99-43ed-90eb-b9d5ef813995', '89BF89AE-396C-44CA-A382-9E2EF46BD801', '8F90B826-7C47-4A2F-96A2-1233F6EBB718', 'ProfileID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Member Profiles -> Connections (One To Many via ProfileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '395d966d-bd79-433d-9dee-34baec3d541d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('395d966d-bd79-433d-9dee-34baec3d541d', '89BF89AE-396C-44CA-A382-9E2EF46BD801', '14709D82-1EFA-4F7F-9A6F-238D8A910A89', 'ProfileID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Member Profiles -> Member Favorites (One To Many via ProfileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5c40a963-08fc-4ab0-957d-c647f76326ba'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5c40a963-08fc-4ab0-957d-c647f76326ba', '89BF89AE-396C-44CA-A382-9E2EF46BD801', 'E7AFC988-7509-4034-BC89-7AD48500EF46', 'ProfileID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Member Profiles -> Engagement Scores (One To Many via ProfileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6dcc59d1-c397-4bc7-9a85-582a17457bb9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6dcc59d1-c397-4bc7-9a85-582a17457bb9', '89BF89AE-396C-44CA-A382-9E2EF46BD801', 'CCECDA70-5577-4DC0-81A1-D0A35DB81701', 'ProfileID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Member Profiles -> Member Networks (One To Many via ProfileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '42d1a76a-297a-4952-874d-ceed9109c10c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('42d1a76a-297a-4952-874d-ceed9109c10c', '89BF89AE-396C-44CA-A382-9E2EF46BD801', '3DEE5D4B-4A59-45AB-9A66-AC16DEA4D83D', 'ProfileID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Member Profiles -> Member Groups (One To Many via ProfileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '007d746b-d8e3-4310-9277-7ef33303e270'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('007d746b-d8e3-4310-9277-7ef33303e270', '89BF89AE-396C-44CA-A382-9E2EF46BD801', 'F832CD3F-68CF-4F85-9590-A91CCCD6AAB5', 'ProfileID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Donation Transactions -> Donation Histories (One To Many via intDonationId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '48dc1faf-bf2c-45b4-af6f-f6b8bdec3882'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('48dc1faf-bf2c-45b4-af6f-f6b8bdec3882', '23860586-3034-436F-B629-C4CE071357C1', 'F58F4447-D46F-47D2-B44C-45B238594B12', 'intDonationId', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Countries -> Members (One To Many via Country) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '14fdb627-f250-477a-8c68-d6b1c4c036ec'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('14fdb627-f250-477a-8c68-d6b1c4c036ec', 'A694C1ED-2BE5-4895-8292-E6377412B980', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', 'Country', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Countries -> Locations (One To Many via countryId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dad5ad58-3522-4de9-8e71-e89c5e550ad7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dad5ad58-3522-4de9-8e71-e89c5e550ad7', 'A694C1ED-2BE5-4895-8292-E6377412B980', 'AFB37B76-7291-4F9B-95D7-BB7916749DED', 'countryId', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Memberships -> Membership Modifiers (One To Many via MembershipID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2aa85ed7-594b-4402-a24b-ccc3d23d80a0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2aa85ed7-594b-4402-a24b-ccc3d23d80a0', 'C8B8595D-F148-4DEE-B22B-F3FCD754363A', '496C9ECD-5B63-4F09-83DE-7C1984DD4A35', 'MembershipID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: Memberships -> Membership Promo Codes (One To Many via MembershipID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4284653c-fc69-4d71-a698-e6058584994b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4284653c-fc69-4d71-a698-e6058584994b', 'C8B8595D-F148-4DEE-B22B-F3FCD754363A', 'A9F2A9F8-E37A-4524-96ED-1C1D36ADE02B', 'MembershipID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Member Types -> Members (One To Many via MemberTypeCode) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ebfa0d16-7a9c-42f9-ba0e-633a35c55a60'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ebfa0d16-7a9c-42f9-ba0e-633a35c55a60', '94BFEFB5-2E4A-4499-BDED-F9197287D761', 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08', 'MemberTypeCode', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Member Types -> Dues Transactions (One To Many via MemberType) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a814d3c7-d511-485a-8890-db8ea6dc1311'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a814d3c7-d511-485a-8890-db8ea6dc1311', '94BFEFB5-2E4A-4499-BDED-F9197287D761', '505CB043-3A82-407A-B9A7-7233772AB994', 'MemberType', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Member Types -> Member Profiles (One To Many via MemberTypeCode) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5371faaf-bcb2-49c5-ba92-ca56e6b7301a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5371faaf-bcb2-49c5-ba92-ca56e6b7301a', '94BFEFB5-2E4A-4499-BDED-F9197287D761', '89BF89AE-396C-44CA-A382-9E2EF46BD801', 'MemberTypeCode', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for AllCampaign */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: All Campaigns
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Announcement */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Announcements
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Call */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Calls
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for CampaignEmailList */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaign Email Lists
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Campaign */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaigns
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for All Campaigns */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: All Campaigns
-- Item: vwAllCampaigns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      All Campaigns
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  AllCampaign
-----               PRIMARY KEY: CampaignId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwAllCampaigns]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwAllCampaigns];
GO

CREATE VIEW [YourMembership].[vwAllCampaigns]
AS
SELECT
    a.*
FROM
    [YourMembership].[AllCampaign] AS a
GO
GRANT SELECT ON [YourMembership].[vwAllCampaigns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for All Campaigns */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: All Campaigns
-- Item: Permissions for vwAllCampaigns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwAllCampaigns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for All Campaigns */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: All Campaigns
-- Item: spCreateAllCampaign
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AllCampaign
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateAllCampaign]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateAllCampaign];
GO

CREATE PROCEDURE [YourMembership].[spCreateAllCampaign]
    @CampaignId int = NULL,
    @CampaignName nvarchar(200),
    @Subject nvarchar(200),
    @Status nvarchar(200),
    @Category nvarchar(200),
    @Type nvarchar(200),
    @DateScheduled datetimeoffset,
    @DateSent datetimeoffset,
    @ProcessingCount int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[AllCampaign]
        (
            [CampaignId],
                [CampaignName],
                [Subject],
                [Status],
                [Category],
                [Type],
                [DateScheduled],
                [DateSent],
                [ProcessingCount],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @CampaignId,
                @CampaignName,
                @Subject,
                @Status,
                @Category,
                @Type,
                @DateScheduled,
                @DateSent,
                @ProcessingCount,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwAllCampaigns] WHERE [CampaignId] = @CampaignId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateAllCampaign] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for All Campaigns */

GRANT EXECUTE ON [YourMembership].[spCreateAllCampaign] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for All Campaigns */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: All Campaigns
-- Item: spUpdateAllCampaign
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AllCampaign
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateAllCampaign]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateAllCampaign];
GO

CREATE PROCEDURE [YourMembership].[spUpdateAllCampaign]
    @CampaignId int,
    @CampaignName nvarchar(200),
    @Subject nvarchar(200),
    @Status nvarchar(200),
    @Category nvarchar(200),
    @Type nvarchar(200),
    @DateScheduled datetimeoffset,
    @DateSent datetimeoffset,
    @ProcessingCount int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[AllCampaign]
    SET
        [CampaignName] = @CampaignName,
        [Subject] = @Subject,
        [Status] = @Status,
        [Category] = @Category,
        [Type] = @Type,
        [DateScheduled] = @DateScheduled,
        [DateSent] = @DateSent,
        [ProcessingCount] = @ProcessingCount,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [CampaignId] = @CampaignId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwAllCampaigns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwAllCampaigns]
                                    WHERE
                                        [CampaignId] = @CampaignId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateAllCampaign] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AllCampaign table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateAllCampaign]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateAllCampaign];
GO
CREATE TRIGGER [YourMembership].trgUpdateAllCampaign
ON [YourMembership].[AllCampaign]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[AllCampaign]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[AllCampaign] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[CampaignId] = I.[CampaignId];
END;
GO
        

/* spUpdate Permissions for All Campaigns */

GRANT EXECUTE ON [YourMembership].[spUpdateAllCampaign] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Announcements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Announcements
-- Item: vwAnnouncements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Announcements
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  Announcement
-----               PRIMARY KEY: AnnouncementId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwAnnouncements]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwAnnouncements];
GO

CREATE VIEW [YourMembership].[vwAnnouncements]
AS
SELECT
    a.*
FROM
    [YourMembership].[Announcement] AS a
GO
GRANT SELECT ON [YourMembership].[vwAnnouncements] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Announcements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Announcements
-- Item: Permissions for vwAnnouncements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwAnnouncements] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Announcements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Announcements
-- Item: spCreateAnnouncement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Announcement
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateAnnouncement]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateAnnouncement];
GO

CREATE PROCEDURE [YourMembership].[spCreateAnnouncement]
    @AnnouncementId int = NULL,
    @Title nvarchar(200),
    @Text nvarchar(500),
    @StartDate datetimeoffset,
    @EndDate datetimeoffset,
    @Active bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[Announcement]
        (
            [AnnouncementId],
                [Title],
                [Text],
                [StartDate],
                [EndDate],
                [Active],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @AnnouncementId,
                @Title,
                @Text,
                @StartDate,
                @EndDate,
                @Active,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwAnnouncements] WHERE [AnnouncementId] = @AnnouncementId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateAnnouncement] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Announcements */

GRANT EXECUTE ON [YourMembership].[spCreateAnnouncement] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Announcements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Announcements
-- Item: spUpdateAnnouncement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Announcement
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateAnnouncement]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateAnnouncement];
GO

CREATE PROCEDURE [YourMembership].[spUpdateAnnouncement]
    @AnnouncementId int,
    @Title nvarchar(200),
    @Text nvarchar(500),
    @StartDate datetimeoffset,
    @EndDate datetimeoffset,
    @Active bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Announcement]
    SET
        [Title] = @Title,
        [Text] = @Text,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [Active] = @Active,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [AnnouncementId] = @AnnouncementId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwAnnouncements] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwAnnouncements]
                                    WHERE
                                        [AnnouncementId] = @AnnouncementId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateAnnouncement] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Announcement table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateAnnouncement]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateAnnouncement];
GO
CREATE TRIGGER [YourMembership].trgUpdateAnnouncement
ON [YourMembership].[Announcement]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Announcement]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[Announcement] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[AnnouncementId] = I.[AnnouncementId];
END;
GO
        

/* spUpdate Permissions for Announcements */

GRANT EXECUTE ON [YourMembership].[spUpdateAnnouncement] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Calls */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Calls
-- Item: vwCalls
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Calls
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  Call
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwCalls]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwCalls];
GO

CREATE VIEW [HubSpot].[vwCalls]
AS
SELECT
    c.*
FROM
    [HubSpot].[Call] AS c
GO
GRANT SELECT ON [HubSpot].[vwCalls] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Calls */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Calls
-- Item: Permissions for vwCalls
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwCalls] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Calls */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Calls
-- Item: spCreateCall
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Call
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateCall]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateCall];
GO

CREATE PROCEDURE [HubSpot].[spCreateCall]
    @hs_object_id nvarchar(100) = NULL,
    @hs_call_title nvarchar(500),
    @hs_call_body nvarchar(MAX),
    @hs_call_status nvarchar(500),
    @hs_call_direction nvarchar(500),
    @hs_call_duration int,
    @hs_call_from_number nvarchar(500),
    @hs_call_to_number nvarchar(500),
    @hs_call_disposition nvarchar(500),
    @hs_call_recording_url nvarchar(1000),
    @hubspot_owner_id nvarchar(100),
    @hs_timestamp datetimeoffset,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[Call]
        (
            [hs_object_id],
                [hs_call_title],
                [hs_call_body],
                [hs_call_status],
                [hs_call_direction],
                [hs_call_duration],
                [hs_call_from_number],
                [hs_call_to_number],
                [hs_call_disposition],
                [hs_call_recording_url],
                [hubspot_owner_id],
                [hs_timestamp],
                [createdate],
                [hs_lastmodifieddate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @hs_call_title,
                @hs_call_body,
                @hs_call_status,
                @hs_call_direction,
                @hs_call_duration,
                @hs_call_from_number,
                @hs_call_to_number,
                @hs_call_disposition,
                @hs_call_recording_url,
                @hubspot_owner_id,
                @hs_timestamp,
                @createdate,
                @hs_lastmodifieddate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwCalls] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateCall] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Calls */

GRANT EXECUTE ON [HubSpot].[spCreateCall] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Calls */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Calls
-- Item: spUpdateCall
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Call
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateCall]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateCall];
GO

CREATE PROCEDURE [HubSpot].[spUpdateCall]
    @hs_object_id nvarchar(100),
    @hs_call_title nvarchar(500),
    @hs_call_body nvarchar(MAX),
    @hs_call_status nvarchar(500),
    @hs_call_direction nvarchar(500),
    @hs_call_duration int,
    @hs_call_from_number nvarchar(500),
    @hs_call_to_number nvarchar(500),
    @hs_call_disposition nvarchar(500),
    @hs_call_recording_url nvarchar(1000),
    @hubspot_owner_id nvarchar(100),
    @hs_timestamp datetimeoffset,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Call]
    SET
        [hs_call_title] = @hs_call_title,
        [hs_call_body] = @hs_call_body,
        [hs_call_status] = @hs_call_status,
        [hs_call_direction] = @hs_call_direction,
        [hs_call_duration] = @hs_call_duration,
        [hs_call_from_number] = @hs_call_from_number,
        [hs_call_to_number] = @hs_call_to_number,
        [hs_call_disposition] = @hs_call_disposition,
        [hs_call_recording_url] = @hs_call_recording_url,
        [hubspot_owner_id] = @hubspot_owner_id,
        [hs_timestamp] = @hs_timestamp,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwCalls] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwCalls]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateCall] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Call table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateCall]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateCall];
GO
CREATE TRIGGER [HubSpot].trgUpdateCall
ON [HubSpot].[Call]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Call]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[Call] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Calls */

GRANT EXECUTE ON [HubSpot].[spUpdateCall] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Campaign Email Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaign Email Lists
-- Item: vwCampaignEmailLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Campaign Email Lists
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  CampaignEmailList
-----               PRIMARY KEY: ListId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwCampaignEmailLists]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwCampaignEmailLists];
GO

CREATE VIEW [YourMembership].[vwCampaignEmailLists]
AS
SELECT
    c.*
FROM
    [YourMembership].[CampaignEmailList] AS c
GO
GRANT SELECT ON [YourMembership].[vwCampaignEmailLists] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Campaign Email Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaign Email Lists
-- Item: Permissions for vwCampaignEmailLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwCampaignEmailLists] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Campaign Email Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaign Email Lists
-- Item: spCreateCampaignEmailList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CampaignEmailList
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateCampaignEmailList]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateCampaignEmailList];
GO

CREATE PROCEDURE [YourMembership].[spCreateCampaignEmailList]
    @ListId int = NULL,
    @ListType nvarchar(200),
    @ListSize int,
    @ListName nvarchar(200),
    @ListArea nvarchar(200),
    @DateCreated datetimeoffset,
    @DateModified datetimeoffset,
    @DateLastUpdated datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[CampaignEmailList]
        (
            [ListId],
                [ListType],
                [ListSize],
                [ListName],
                [ListArea],
                [DateCreated],
                [DateModified],
                [DateLastUpdated],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ListId,
                @ListType,
                @ListSize,
                @ListName,
                @ListArea,
                @DateCreated,
                @DateModified,
                @DateLastUpdated,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwCampaignEmailLists] WHERE [ListId] = @ListId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateCampaignEmailList] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Campaign Email Lists */

GRANT EXECUTE ON [YourMembership].[spCreateCampaignEmailList] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Campaign Email Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaign Email Lists
-- Item: spUpdateCampaignEmailList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CampaignEmailList
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateCampaignEmailList]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateCampaignEmailList];
GO

CREATE PROCEDURE [YourMembership].[spUpdateCampaignEmailList]
    @ListId int,
    @ListType nvarchar(200),
    @ListSize int,
    @ListName nvarchar(200),
    @ListArea nvarchar(200),
    @DateCreated datetimeoffset,
    @DateModified datetimeoffset,
    @DateLastUpdated datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[CampaignEmailList]
    SET
        [ListType] = @ListType,
        [ListSize] = @ListSize,
        [ListName] = @ListName,
        [ListArea] = @ListArea,
        [DateCreated] = @DateCreated,
        [DateModified] = @DateModified,
        [DateLastUpdated] = @DateLastUpdated,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ListId] = @ListId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwCampaignEmailLists] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwCampaignEmailLists]
                                    WHERE
                                        [ListId] = @ListId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateCampaignEmailList] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CampaignEmailList table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateCampaignEmailList]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateCampaignEmailList];
GO
CREATE TRIGGER [YourMembership].trgUpdateCampaignEmailList
ON [YourMembership].[CampaignEmailList]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[CampaignEmailList]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[CampaignEmailList] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ListId] = I.[ListId];
END;
GO
        

/* spUpdate Permissions for Campaign Email Lists */

GRANT EXECUTE ON [YourMembership].[spUpdateCampaignEmailList] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Campaigns */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaigns
-- Item: vwCampaigns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Campaigns
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  Campaign
-----               PRIMARY KEY: CampaignId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwCampaigns]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwCampaigns];
GO

CREATE VIEW [YourMembership].[vwCampaigns]
AS
SELECT
    c.*
FROM
    [YourMembership].[Campaign] AS c
GO
GRANT SELECT ON [YourMembership].[vwCampaigns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Campaigns */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaigns
-- Item: Permissions for vwCampaigns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwCampaigns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Campaigns */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaigns
-- Item: spCreateCampaign
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Campaign
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateCampaign]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateCampaign];
GO

CREATE PROCEDURE [YourMembership].[spCreateCampaign]
    @CampaignId int = NULL,
    @CampaignName nvarchar(200),
    @Subject nvarchar(200),
    @SenderEmail nvarchar(200),
    @DateScheduled datetimeoffset,
    @DateSent datetimeoffset,
    @Status nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[Campaign]
        (
            [CampaignId],
                [CampaignName],
                [Subject],
                [SenderEmail],
                [DateScheduled],
                [DateSent],
                [Status],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @CampaignId,
                @CampaignName,
                @Subject,
                @SenderEmail,
                @DateScheduled,
                @DateSent,
                @Status,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwCampaigns] WHERE [CampaignId] = @CampaignId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateCampaign] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Campaigns */

GRANT EXECUTE ON [YourMembership].[spCreateCampaign] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Campaigns */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaigns
-- Item: spUpdateCampaign
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Campaign
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateCampaign]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateCampaign];
GO

CREATE PROCEDURE [YourMembership].[spUpdateCampaign]
    @CampaignId int,
    @CampaignName nvarchar(200),
    @Subject nvarchar(200),
    @SenderEmail nvarchar(200),
    @DateScheduled datetimeoffset,
    @DateSent datetimeoffset,
    @Status nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Campaign]
    SET
        [CampaignName] = @CampaignName,
        [Subject] = @Subject,
        [SenderEmail] = @SenderEmail,
        [DateScheduled] = @DateScheduled,
        [DateSent] = @DateSent,
        [Status] = @Status,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [CampaignId] = @CampaignId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwCampaigns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwCampaigns]
                                    WHERE
                                        [CampaignId] = @CampaignId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateCampaign] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Campaign table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateCampaign]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateCampaign];
GO
CREATE TRIGGER [YourMembership].trgUpdateCampaign
ON [YourMembership].[Campaign]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Campaign]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[Campaign] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[CampaignId] = I.[CampaignId];
END;
GO
        

/* spUpdate Permissions for Campaigns */

GRANT EXECUTE ON [YourMembership].[spUpdateCampaign] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for All Campaigns */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: All Campaigns
-- Item: spDeleteAllCampaign
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AllCampaign
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteAllCampaign]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteAllCampaign];
GO

CREATE PROCEDURE [YourMembership].[spDeleteAllCampaign]
    @CampaignId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[AllCampaign]
    WHERE
        [CampaignId] = @CampaignId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [CampaignId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @CampaignId AS [CampaignId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteAllCampaign] TO [cdp_Integration]
    

/* spDelete Permissions for All Campaigns */

GRANT EXECUTE ON [YourMembership].[spDeleteAllCampaign] TO [cdp_Integration]



/* spDelete SQL for Announcements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Announcements
-- Item: spDeleteAnnouncement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Announcement
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteAnnouncement]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteAnnouncement];
GO

CREATE PROCEDURE [YourMembership].[spDeleteAnnouncement]
    @AnnouncementId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[Announcement]
    WHERE
        [AnnouncementId] = @AnnouncementId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [AnnouncementId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @AnnouncementId AS [AnnouncementId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteAnnouncement] TO [cdp_Integration]
    

/* spDelete Permissions for Announcements */

GRANT EXECUTE ON [YourMembership].[spDeleteAnnouncement] TO [cdp_Integration]



/* spDelete SQL for Calls */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Calls
-- Item: spDeleteCall
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Call
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteCall]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteCall];
GO

CREATE PROCEDURE [HubSpot].[spDeleteCall]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[Call]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteCall] TO [cdp_Integration]
    

/* spDelete Permissions for Calls */

GRANT EXECUTE ON [HubSpot].[spDeleteCall] TO [cdp_Integration]



/* spDelete SQL for Campaign Email Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaign Email Lists
-- Item: spDeleteCampaignEmailList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CampaignEmailList
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteCampaignEmailList]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteCampaignEmailList];
GO

CREATE PROCEDURE [YourMembership].[spDeleteCampaignEmailList]
    @ListId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[CampaignEmailList]
    WHERE
        [ListId] = @ListId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ListId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ListId AS [ListId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteCampaignEmailList] TO [cdp_Integration]
    

/* spDelete Permissions for Campaign Email Lists */

GRANT EXECUTE ON [YourMembership].[spDeleteCampaignEmailList] TO [cdp_Integration]



/* spDelete SQL for Campaigns */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Campaigns
-- Item: spDeleteCampaign
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Campaign
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteCampaign]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteCampaign];
GO

CREATE PROCEDURE [YourMembership].[spDeleteCampaign]
    @CampaignId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[Campaign]
    WHERE
        [CampaignId] = @CampaignId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [CampaignId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @CampaignId AS [CampaignId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteCampaign] TO [cdp_Integration]
    

/* spDelete Permissions for Campaigns */

GRANT EXECUTE ON [YourMembership].[spDeleteCampaign] TO [cdp_Integration]



/* Index for Foreign Keys for CareerOpening */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Career Openings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for CertificationCreditType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Credit Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for CertificationJournal */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Journals
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key WebsiteMemberID in table CertificationJournal
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CertificationJournal_WebsiteMemberID' 
    AND object_id = OBJECT_ID('[YourMembership].[CertificationJournal]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CertificationJournal_WebsiteMemberID ON [YourMembership].[CertificationJournal] ([WebsiteMemberID]);

/* Index for Foreign Keys for Certification */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Company */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Companies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Career Openings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Career Openings
-- Item: vwCareerOpenings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Career Openings
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  CareerOpening
-----               PRIMARY KEY: CareerOpeningID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwCareerOpenings]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwCareerOpenings];
GO

CREATE VIEW [YourMembership].[vwCareerOpenings]
AS
SELECT
    c.*
FROM
    [YourMembership].[CareerOpening] AS c
GO
GRANT SELECT ON [YourMembership].[vwCareerOpenings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Career Openings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Career Openings
-- Item: Permissions for vwCareerOpenings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwCareerOpenings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Career Openings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Career Openings
-- Item: spCreateCareerOpening
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CareerOpening
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateCareerOpening]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateCareerOpening];
GO

CREATE PROCEDURE [YourMembership].[spCreateCareerOpening]
    @CareerOpeningID int = NULL,
    @Position nvarchar(200),
    @Organization nvarchar(200),
    @City nvarchar(200),
    @State nvarchar(200),
    @Salary nvarchar(200),
    @DatePosted datetimeoffset,
    @Description nvarchar(500),
    @ContactEmail nvarchar(500),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[CareerOpening]
        (
            [CareerOpeningID],
                [Position],
                [Organization],
                [City],
                [State],
                [Salary],
                [DatePosted],
                [Description],
                [ContactEmail],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @CareerOpeningID,
                @Position,
                @Organization,
                @City,
                @State,
                @Salary,
                @DatePosted,
                @Description,
                @ContactEmail,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwCareerOpenings] WHERE [CareerOpeningID] = @CareerOpeningID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateCareerOpening] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Career Openings */

GRANT EXECUTE ON [YourMembership].[spCreateCareerOpening] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Career Openings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Career Openings
-- Item: spUpdateCareerOpening
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CareerOpening
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateCareerOpening]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateCareerOpening];
GO

CREATE PROCEDURE [YourMembership].[spUpdateCareerOpening]
    @CareerOpeningID int,
    @Position nvarchar(200),
    @Organization nvarchar(200),
    @City nvarchar(200),
    @State nvarchar(200),
    @Salary nvarchar(200),
    @DatePosted datetimeoffset,
    @Description nvarchar(500),
    @ContactEmail nvarchar(500),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[CareerOpening]
    SET
        [Position] = @Position,
        [Organization] = @Organization,
        [City] = @City,
        [State] = @State,
        [Salary] = @Salary,
        [DatePosted] = @DatePosted,
        [Description] = @Description,
        [ContactEmail] = @ContactEmail,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [CareerOpeningID] = @CareerOpeningID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwCareerOpenings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwCareerOpenings]
                                    WHERE
                                        [CareerOpeningID] = @CareerOpeningID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateCareerOpening] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CareerOpening table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateCareerOpening]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateCareerOpening];
GO
CREATE TRIGGER [YourMembership].trgUpdateCareerOpening
ON [YourMembership].[CareerOpening]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[CareerOpening]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[CareerOpening] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[CareerOpeningID] = I.[CareerOpeningID];
END;
GO
        

/* spUpdate Permissions for Career Openings */

GRANT EXECUTE ON [YourMembership].[spUpdateCareerOpening] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Certification Credit Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Credit Types
-- Item: vwCertificationCreditTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Certification Credit Types
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  CertificationCreditType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwCertificationCreditTypes]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwCertificationCreditTypes];
GO

CREATE VIEW [YourMembership].[vwCertificationCreditTypes]
AS
SELECT
    c.*
FROM
    [YourMembership].[CertificationCreditType] AS c
GO
GRANT SELECT ON [YourMembership].[vwCertificationCreditTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Certification Credit Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Credit Types
-- Item: Permissions for vwCertificationCreditTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwCertificationCreditTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Certification Credit Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Credit Types
-- Item: spCreateCertificationCreditType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CertificationCreditType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateCertificationCreditType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateCertificationCreditType];
GO

CREATE PROCEDURE [YourMembership].[spCreateCertificationCreditType]
    @ID int = NULL,
    @Code nvarchar(200),
    @Name nvarchar(200),
    @Description nvarchar(500),
    @IsDefault bit,
    @CreditsExpire bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[CertificationCreditType]
        (
            [ID],
                [Code],
                [Name],
                [Description],
                [IsDefault],
                [CreditsExpire],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ID,
                @Code,
                @Name,
                @Description,
                @IsDefault,
                @CreditsExpire,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwCertificationCreditTypes] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateCertificationCreditType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Certification Credit Types */

GRANT EXECUTE ON [YourMembership].[spCreateCertificationCreditType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Certification Credit Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Credit Types
-- Item: spUpdateCertificationCreditType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CertificationCreditType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateCertificationCreditType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateCertificationCreditType];
GO

CREATE PROCEDURE [YourMembership].[spUpdateCertificationCreditType]
    @ID int,
    @Code nvarchar(200),
    @Name nvarchar(200),
    @Description nvarchar(500),
    @IsDefault bit,
    @CreditsExpire bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[CertificationCreditType]
    SET
        [Code] = @Code,
        [Name] = @Name,
        [Description] = @Description,
        [IsDefault] = @IsDefault,
        [CreditsExpire] = @CreditsExpire,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwCertificationCreditTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwCertificationCreditTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateCertificationCreditType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CertificationCreditType table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateCertificationCreditType]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateCertificationCreditType];
GO
CREATE TRIGGER [YourMembership].trgUpdateCertificationCreditType
ON [YourMembership].[CertificationCreditType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[CertificationCreditType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[CertificationCreditType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Certification Credit Types */

GRANT EXECUTE ON [YourMembership].[spUpdateCertificationCreditType] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Certification Journals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Journals
-- Item: vwCertificationJournals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Certification Journals
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  CertificationJournal
-----               PRIMARY KEY: EntryID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwCertificationJournals]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwCertificationJournals];
GO

CREATE VIEW [YourMembership].[vwCertificationJournals]
AS
SELECT
    c.*
FROM
    [YourMembership].[CertificationJournal] AS c
GO
GRANT SELECT ON [YourMembership].[vwCertificationJournals] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Certification Journals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Journals
-- Item: Permissions for vwCertificationJournals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwCertificationJournals] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Certification Journals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Journals
-- Item: spCreateCertificationJournal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CertificationJournal
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateCertificationJournal]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateCertificationJournal];
GO

CREATE PROCEDURE [YourMembership].[spCreateCertificationJournal]
    @EntryID int = NULL,
    @CertificationName nvarchar(200),
    @CEUsEarned decimal(18, 2),
    @EntryDate datetimeoffset,
    @Status nvarchar(200),
    @Description nvarchar(500),
    @WebsiteMemberID int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[CertificationJournal]
        (
            [EntryID],
                [CertificationName],
                [CEUsEarned],
                [EntryDate],
                [Status],
                [Description],
                [WebsiteMemberID],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @EntryID,
                @CertificationName,
                @CEUsEarned,
                @EntryDate,
                @Status,
                @Description,
                @WebsiteMemberID,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwCertificationJournals] WHERE [EntryID] = @EntryID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateCertificationJournal] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Certification Journals */

GRANT EXECUTE ON [YourMembership].[spCreateCertificationJournal] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Certification Journals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Journals
-- Item: spUpdateCertificationJournal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CertificationJournal
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateCertificationJournal]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateCertificationJournal];
GO

CREATE PROCEDURE [YourMembership].[spUpdateCertificationJournal]
    @EntryID int,
    @CertificationName nvarchar(200),
    @CEUsEarned decimal(18, 2),
    @EntryDate datetimeoffset,
    @Status nvarchar(200),
    @Description nvarchar(500),
    @WebsiteMemberID int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[CertificationJournal]
    SET
        [CertificationName] = @CertificationName,
        [CEUsEarned] = @CEUsEarned,
        [EntryDate] = @EntryDate,
        [Status] = @Status,
        [Description] = @Description,
        [WebsiteMemberID] = @WebsiteMemberID,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [EntryID] = @EntryID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwCertificationJournals] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwCertificationJournals]
                                    WHERE
                                        [EntryID] = @EntryID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateCertificationJournal] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CertificationJournal table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateCertificationJournal]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateCertificationJournal];
GO
CREATE TRIGGER [YourMembership].trgUpdateCertificationJournal
ON [YourMembership].[CertificationJournal]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[CertificationJournal]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[CertificationJournal] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[EntryID] = I.[EntryID];
END;
GO
        

/* spUpdate Permissions for Certification Journals */

GRANT EXECUTE ON [YourMembership].[spUpdateCertificationJournal] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: vwCertifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Certifications
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  Certification
-----               PRIMARY KEY: CertificationID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwCertifications]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwCertifications];
GO

CREATE VIEW [YourMembership].[vwCertifications]
AS
SELECT
    c.*
FROM
    [YourMembership].[Certification] AS c
GO
GRANT SELECT ON [YourMembership].[vwCertifications] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: Permissions for vwCertifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwCertifications] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: spCreateCertification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Certification
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateCertification]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateCertification];
GO

CREATE PROCEDURE [YourMembership].[spCreateCertification]
    @CertificationID nvarchar(200) = NULL,
    @ID nvarchar(200),
    @Name nvarchar(200),
    @IsActive bit,
    @CEUsRequired int,
    @Code nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[Certification]
        (
            [CertificationID],
                [ID],
                [Name],
                [IsActive],
                [CEUsRequired],
                [Code],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @CertificationID,
                @ID,
                @Name,
                @IsActive,
                @CEUsRequired,
                @Code,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwCertifications] WHERE [CertificationID] = @CertificationID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateCertification] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Certifications */

GRANT EXECUTE ON [YourMembership].[spCreateCertification] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: spUpdateCertification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Certification
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateCertification]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateCertification];
GO

CREATE PROCEDURE [YourMembership].[spUpdateCertification]
    @CertificationID nvarchar(200),
    @ID nvarchar(200),
    @Name nvarchar(200),
    @IsActive bit,
    @CEUsRequired int,
    @Code nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Certification]
    SET
        [ID] = @ID,
        [Name] = @Name,
        [IsActive] = @IsActive,
        [CEUsRequired] = @CEUsRequired,
        [Code] = @Code,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [CertificationID] = @CertificationID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwCertifications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwCertifications]
                                    WHERE
                                        [CertificationID] = @CertificationID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateCertification] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Certification table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateCertification]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateCertification];
GO
CREATE TRIGGER [YourMembership].trgUpdateCertification
ON [YourMembership].[Certification]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Certification]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[Certification] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[CertificationID] = I.[CertificationID];
END;
GO
        

/* spUpdate Permissions for Certifications */

GRANT EXECUTE ON [YourMembership].[spUpdateCertification] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Companies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Companies
-- Item: vwCompanies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Companies
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  Company
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwCompanies]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwCompanies];
GO

CREATE VIEW [HubSpot].[vwCompanies]
AS
SELECT
    c.*
FROM
    [HubSpot].[Company] AS c
GO
GRANT SELECT ON [HubSpot].[vwCompanies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Companies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Companies
-- Item: Permissions for vwCompanies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwCompanies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Companies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Companies
-- Item: spCreateCompany
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Company
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateCompany]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateCompany];
GO

CREATE PROCEDURE [HubSpot].[spCreateCompany]
    @hs_object_id nvarchar(100) = NULL,
    @name nvarchar(500),
    @domain nvarchar(500),
    @industry nvarchar(500),
    @phone nvarchar(500),
    @address nvarchar(500),
    @address2 nvarchar(500),
    @city nvarchar(500),
    @state nvarchar(500),
    @zip nvarchar(500),
    @country nvarchar(500),
    @website nvarchar(1000),
    @description nvarchar(MAX),
    @numberofemployees int,
    @annualrevenue decimal(18, 2),
    @lifecyclestage nvarchar(500),
    @type nvarchar(500),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @founded_year nvarchar(500),
    @is_public bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[Company]
        (
            [hs_object_id],
                [name],
                [domain],
                [industry],
                [phone],
                [address],
                [address2],
                [city],
                [state],
                [zip],
                [country],
                [website],
                [description],
                [numberofemployees],
                [annualrevenue],
                [lifecyclestage],
                [type],
                [createdate],
                [hs_lastmodifieddate],
                [founded_year],
                [is_public],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @name,
                @domain,
                @industry,
                @phone,
                @address,
                @address2,
                @city,
                @state,
                @zip,
                @country,
                @website,
                @description,
                @numberofemployees,
                @annualrevenue,
                @lifecyclestage,
                @type,
                @createdate,
                @hs_lastmodifieddate,
                @founded_year,
                @is_public,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwCompanies] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateCompany] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Companies */

GRANT EXECUTE ON [HubSpot].[spCreateCompany] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Companies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Companies
-- Item: spUpdateCompany
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Company
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateCompany]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateCompany];
GO

CREATE PROCEDURE [HubSpot].[spUpdateCompany]
    @hs_object_id nvarchar(100),
    @name nvarchar(500),
    @domain nvarchar(500),
    @industry nvarchar(500),
    @phone nvarchar(500),
    @address nvarchar(500),
    @address2 nvarchar(500),
    @city nvarchar(500),
    @state nvarchar(500),
    @zip nvarchar(500),
    @country nvarchar(500),
    @website nvarchar(1000),
    @description nvarchar(MAX),
    @numberofemployees int,
    @annualrevenue decimal(18, 2),
    @lifecyclestage nvarchar(500),
    @type nvarchar(500),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @founded_year nvarchar(500),
    @is_public bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Company]
    SET
        [name] = @name,
        [domain] = @domain,
        [industry] = @industry,
        [phone] = @phone,
        [address] = @address,
        [address2] = @address2,
        [city] = @city,
        [state] = @state,
        [zip] = @zip,
        [country] = @country,
        [website] = @website,
        [description] = @description,
        [numberofemployees] = @numberofemployees,
        [annualrevenue] = @annualrevenue,
        [lifecyclestage] = @lifecyclestage,
        [type] = @type,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [founded_year] = @founded_year,
        [is_public] = @is_public,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwCompanies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwCompanies]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateCompany] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Company table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateCompany]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateCompany];
GO
CREATE TRIGGER [HubSpot].trgUpdateCompany
ON [HubSpot].[Company]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Company]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[Company] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Companies */

GRANT EXECUTE ON [HubSpot].[spUpdateCompany] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Career Openings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Career Openings
-- Item: spDeleteCareerOpening
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CareerOpening
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteCareerOpening]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteCareerOpening];
GO

CREATE PROCEDURE [YourMembership].[spDeleteCareerOpening]
    @CareerOpeningID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[CareerOpening]
    WHERE
        [CareerOpeningID] = @CareerOpeningID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [CareerOpeningID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @CareerOpeningID AS [CareerOpeningID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteCareerOpening] TO [cdp_Integration]
    

/* spDelete Permissions for Career Openings */

GRANT EXECUTE ON [YourMembership].[spDeleteCareerOpening] TO [cdp_Integration]



/* spDelete SQL for Certification Credit Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Credit Types
-- Item: spDeleteCertificationCreditType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CertificationCreditType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteCertificationCreditType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteCertificationCreditType];
GO

CREATE PROCEDURE [YourMembership].[spDeleteCertificationCreditType]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[CertificationCreditType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteCertificationCreditType] TO [cdp_Integration]
    

/* spDelete Permissions for Certification Credit Types */

GRANT EXECUTE ON [YourMembership].[spDeleteCertificationCreditType] TO [cdp_Integration]



/* spDelete SQL for Certification Journals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certification Journals
-- Item: spDeleteCertificationJournal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CertificationJournal
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteCertificationJournal]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteCertificationJournal];
GO

CREATE PROCEDURE [YourMembership].[spDeleteCertificationJournal]
    @EntryID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[CertificationJournal]
    WHERE
        [EntryID] = @EntryID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [EntryID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @EntryID AS [EntryID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteCertificationJournal] TO [cdp_Integration]
    

/* spDelete Permissions for Certification Journals */

GRANT EXECUTE ON [YourMembership].[spDeleteCertificationJournal] TO [cdp_Integration]



/* spDelete SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: spDeleteCertification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Certification
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteCertification]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteCertification];
GO

CREATE PROCEDURE [YourMembership].[spDeleteCertification]
    @CertificationID nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[Certification]
    WHERE
        [CertificationID] = @CertificationID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [CertificationID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @CertificationID AS [CertificationID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteCertification] TO [cdp_Integration]
    

/* spDelete Permissions for Certifications */

GRANT EXECUTE ON [YourMembership].[spDeleteCertification] TO [cdp_Integration]



/* spDelete SQL for Companies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Companies
-- Item: spDeleteCompany
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Company
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteCompany]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteCompany];
GO

CREATE PROCEDURE [HubSpot].[spDeleteCompany]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[Company]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteCompany] TO [cdp_Integration]
    

/* spDelete Permissions for Companies */

GRANT EXECUTE ON [HubSpot].[spDeleteCompany] TO [cdp_Integration]



/* Index for Foreign Keys for Connection */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Connections
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProfileID in table Connection
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Connection_ProfileID' 
    AND object_id = OBJECT_ID('[YourMembership].[Connection]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Connection_ProfileID ON [YourMembership].[Connection] ([ProfileID]);

/* Index for Foreign Keys for Contact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key associatedcompanyid in table Contact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Contact_associatedcompanyid' 
    AND object_id = OBJECT_ID('[HubSpot].[Contact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Contact_associatedcompanyid ON [HubSpot].[Contact] ([associatedcompanyid]);

/* Index for Foreign Keys for Country */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for CustomTaxLocation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Tax Locations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Deal */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Connections
-- Item: vwConnections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Connections
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  Connection
-----               PRIMARY KEY: ConnectionId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwConnections]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwConnections];
GO

CREATE VIEW [YourMembership].[vwConnections]
AS
SELECT
    c.*
FROM
    [YourMembership].[Connection] AS c
GO
GRANT SELECT ON [YourMembership].[vwConnections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Connections
-- Item: Permissions for vwConnections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwConnections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Connections
-- Item: spCreateConnection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Connection
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateConnection]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateConnection];
GO

CREATE PROCEDURE [YourMembership].[spCreateConnection]
    @ConnectionId int = NULL,
    @ProfileID int,
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @Organization nvarchar(200),
    @WorkTitle nvarchar(200),
    @City nvarchar(200),
    @State nvarchar(200),
    @Email nvarchar(200),
    @Status nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[Connection]
        (
            [ConnectionId],
                [ProfileID],
                [FirstName],
                [LastName],
                [Organization],
                [WorkTitle],
                [City],
                [State],
                [Email],
                [Status],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ConnectionId,
                @ProfileID,
                @FirstName,
                @LastName,
                @Organization,
                @WorkTitle,
                @City,
                @State,
                @Email,
                @Status,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwConnections] WHERE [ConnectionId] = @ConnectionId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateConnection] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Connections */

GRANT EXECUTE ON [YourMembership].[spCreateConnection] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Connections
-- Item: spUpdateConnection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Connection
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateConnection]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateConnection];
GO

CREATE PROCEDURE [YourMembership].[spUpdateConnection]
    @ConnectionId int,
    @ProfileID int,
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @Organization nvarchar(200),
    @WorkTitle nvarchar(200),
    @City nvarchar(200),
    @State nvarchar(200),
    @Email nvarchar(200),
    @Status nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Connection]
    SET
        [ProfileID] = @ProfileID,
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Organization] = @Organization,
        [WorkTitle] = @WorkTitle,
        [City] = @City,
        [State] = @State,
        [Email] = @Email,
        [Status] = @Status,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ConnectionId] = @ConnectionId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwConnections] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwConnections]
                                    WHERE
                                        [ConnectionId] = @ConnectionId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateConnection] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Connection table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateConnection]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateConnection];
GO
CREATE TRIGGER [YourMembership].trgUpdateConnection
ON [YourMembership].[Connection]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Connection]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[Connection] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ConnectionId] = I.[ConnectionId];
END;
GO
        

/* spUpdate Permissions for Connections */

GRANT EXECUTE ON [YourMembership].[spUpdateConnection] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: vwContacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contacts
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  Contact
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwContacts]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwContacts];
GO

CREATE VIEW [HubSpot].[vwContacts]
AS
SELECT
    c.*
FROM
    [HubSpot].[Contact] AS c
GO
GRANT SELECT ON [HubSpot].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Permissions for vwContacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spCreateContact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateContact]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateContact];
GO

CREATE PROCEDURE [HubSpot].[spCreateContact]
    @hs_object_id nvarchar(100) = NULL,
    @email nvarchar(500),
    @firstname nvarchar(500),
    @lastname nvarchar(500),
    @phone nvarchar(500),
    @mobilephone nvarchar(500),
    @company nvarchar(500),
    @jobtitle nvarchar(500),
    @lifecyclestage nvarchar(500),
    @hs_lead_status nvarchar(500),
    @address nvarchar(500),
    @city nvarchar(500),
    @state nvarchar(500),
    @zip nvarchar(500),
    @country nvarchar(500),
    @website nvarchar(1000),
    @industry nvarchar(500),
    @annualrevenue decimal(18, 2),
    @numberofemployees int,
    @createdate datetimeoffset,
    @lastmodifieddate datetimeoffset,
    @associatedcompanyid nvarchar(100),
    @notes_last_contacted nvarchar(255),
    @notes_last_updated nvarchar(255),
    @hs_email_optout bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[Contact]
        (
            [hs_object_id],
                [email],
                [firstname],
                [lastname],
                [phone],
                [mobilephone],
                [company],
                [jobtitle],
                [lifecyclestage],
                [hs_lead_status],
                [address],
                [city],
                [state],
                [zip],
                [country],
                [website],
                [industry],
                [annualrevenue],
                [numberofemployees],
                [createdate],
                [lastmodifieddate],
                [associatedcompanyid],
                [notes_last_contacted],
                [notes_last_updated],
                [hs_email_optout],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @email,
                @firstname,
                @lastname,
                @phone,
                @mobilephone,
                @company,
                @jobtitle,
                @lifecyclestage,
                @hs_lead_status,
                @address,
                @city,
                @state,
                @zip,
                @country,
                @website,
                @industry,
                @annualrevenue,
                @numberofemployees,
                @createdate,
                @lastmodifieddate,
                @associatedcompanyid,
                @notes_last_contacted,
                @notes_last_updated,
                @hs_email_optout,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwContacts] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateContact] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Contacts */

GRANT EXECUTE ON [HubSpot].[spCreateContact] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spUpdateContact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateContact]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateContact];
GO

CREATE PROCEDURE [HubSpot].[spUpdateContact]
    @hs_object_id nvarchar(100),
    @email nvarchar(500),
    @firstname nvarchar(500),
    @lastname nvarchar(500),
    @phone nvarchar(500),
    @mobilephone nvarchar(500),
    @company nvarchar(500),
    @jobtitle nvarchar(500),
    @lifecyclestage nvarchar(500),
    @hs_lead_status nvarchar(500),
    @address nvarchar(500),
    @city nvarchar(500),
    @state nvarchar(500),
    @zip nvarchar(500),
    @country nvarchar(500),
    @website nvarchar(1000),
    @industry nvarchar(500),
    @annualrevenue decimal(18, 2),
    @numberofemployees int,
    @createdate datetimeoffset,
    @lastmodifieddate datetimeoffset,
    @associatedcompanyid nvarchar(100),
    @notes_last_contacted nvarchar(255),
    @notes_last_updated nvarchar(255),
    @hs_email_optout bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Contact]
    SET
        [email] = @email,
        [firstname] = @firstname,
        [lastname] = @lastname,
        [phone] = @phone,
        [mobilephone] = @mobilephone,
        [company] = @company,
        [jobtitle] = @jobtitle,
        [lifecyclestage] = @lifecyclestage,
        [hs_lead_status] = @hs_lead_status,
        [address] = @address,
        [city] = @city,
        [state] = @state,
        [zip] = @zip,
        [country] = @country,
        [website] = @website,
        [industry] = @industry,
        [annualrevenue] = @annualrevenue,
        [numberofemployees] = @numberofemployees,
        [createdate] = @createdate,
        [lastmodifieddate] = @lastmodifieddate,
        [associatedcompanyid] = @associatedcompanyid,
        [notes_last_contacted] = @notes_last_contacted,
        [notes_last_updated] = @notes_last_updated,
        [hs_email_optout] = @hs_email_optout,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwContacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwContacts]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateContact] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Contact table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateContact]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateContact];
GO
CREATE TRIGGER [HubSpot].trgUpdateContact
ON [HubSpot].[Contact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Contact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[Contact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Contacts */

GRANT EXECUTE ON [HubSpot].[spUpdateContact] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: vwCountries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Countries
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  Country
-----               PRIMARY KEY: countryId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwCountries]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwCountries];
GO

CREATE VIEW [YourMembership].[vwCountries]
AS
SELECT
    c.*
FROM
    [YourMembership].[Country] AS c
GO
GRANT SELECT ON [YourMembership].[vwCountries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: Permissions for vwCountries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwCountries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: spCreateCountry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Country
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateCountry]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateCountry];
GO

CREATE PROCEDURE [YourMembership].[spCreateCountry]
    @countryId nvarchar(200) = NULL,
    @countryName nvarchar(200),
    @countryCode nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[Country]
        (
            [countryId],
                [countryName],
                [countryCode],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @countryId,
                @countryName,
                @countryCode,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwCountries] WHERE [countryId] = @countryId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateCountry] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Countries */

GRANT EXECUTE ON [YourMembership].[spCreateCountry] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: spUpdateCountry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Country
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateCountry]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateCountry];
GO

CREATE PROCEDURE [YourMembership].[spUpdateCountry]
    @countryId nvarchar(200),
    @countryName nvarchar(200),
    @countryCode nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Country]
    SET
        [countryName] = @countryName,
        [countryCode] = @countryCode,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [countryId] = @countryId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwCountries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwCountries]
                                    WHERE
                                        [countryId] = @countryId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateCountry] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Country table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateCountry]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateCountry];
GO
CREATE TRIGGER [YourMembership].trgUpdateCountry
ON [YourMembership].[Country]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Country]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[Country] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[countryId] = I.[countryId];
END;
GO
        

/* spUpdate Permissions for Countries */

GRANT EXECUTE ON [YourMembership].[spUpdateCountry] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Custom Tax Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Tax Locations
-- Item: vwCustomTaxLocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Custom Tax Locations
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  CustomTaxLocation
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwCustomTaxLocations]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwCustomTaxLocations];
GO

CREATE VIEW [YourMembership].[vwCustomTaxLocations]
AS
SELECT
    c.*
FROM
    [YourMembership].[CustomTaxLocation] AS c
GO
GRANT SELECT ON [YourMembership].[vwCustomTaxLocations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Custom Tax Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Tax Locations
-- Item: Permissions for vwCustomTaxLocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwCustomTaxLocations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Custom Tax Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Tax Locations
-- Item: spCreateCustomTaxLocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CustomTaxLocation
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateCustomTaxLocation]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateCustomTaxLocation];
GO

CREATE PROCEDURE [YourMembership].[spCreateCustomTaxLocation]
    @Id int = NULL,
    @CountryLabel nvarchar(200),
    @Location nvarchar(200),
    @TaxRate decimal(18, 2),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[CustomTaxLocation]
        (
            [Id],
                [CountryLabel],
                [Location],
                [TaxRate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @Id,
                @CountryLabel,
                @Location,
                @TaxRate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwCustomTaxLocations] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateCustomTaxLocation] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Custom Tax Locations */

GRANT EXECUTE ON [YourMembership].[spCreateCustomTaxLocation] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Custom Tax Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Tax Locations
-- Item: spUpdateCustomTaxLocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomTaxLocation
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateCustomTaxLocation]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateCustomTaxLocation];
GO

CREATE PROCEDURE [YourMembership].[spUpdateCustomTaxLocation]
    @Id int,
    @CountryLabel nvarchar(200),
    @Location nvarchar(200),
    @TaxRate decimal(18, 2),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[CustomTaxLocation]
    SET
        [CountryLabel] = @CountryLabel,
        [Location] = @Location,
        [TaxRate] = @TaxRate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwCustomTaxLocations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwCustomTaxLocations]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateCustomTaxLocation] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomTaxLocation table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateCustomTaxLocation]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateCustomTaxLocation];
GO
CREATE TRIGGER [YourMembership].trgUpdateCustomTaxLocation
ON [YourMembership].[CustomTaxLocation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[CustomTaxLocation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[CustomTaxLocation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO
        

/* spUpdate Permissions for Custom Tax Locations */

GRANT EXECUTE ON [YourMembership].[spUpdateCustomTaxLocation] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Deals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: vwDeals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Deals
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  Deal
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwDeals]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwDeals];
GO

CREATE VIEW [HubSpot].[vwDeals]
AS
SELECT
    d.*
FROM
    [HubSpot].[Deal] AS d
GO
GRANT SELECT ON [HubSpot].[vwDeals] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Deals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: Permissions for vwDeals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwDeals] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Deals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: spCreateDeal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Deal
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateDeal]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateDeal];
GO

CREATE PROCEDURE [HubSpot].[spCreateDeal]
    @hs_object_id nvarchar(100) = NULL,
    @dealname nvarchar(500),
    @amount decimal(18, 2),
    @dealstage nvarchar(500),
    @pipeline nvarchar(500),
    @closedate datetimeoffset,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @dealtype nvarchar(500),
    @description nvarchar(MAX),
    @hs_deal_stage_probability decimal(18, 2),
    @hs_projected_amount decimal(18, 2),
    @hs_priority nvarchar(500),
    @hubspot_owner_id nvarchar(100),
    @notes_last_contacted nvarchar(255),
    @num_associated_contacts int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[Deal]
        (
            [hs_object_id],
                [dealname],
                [amount],
                [dealstage],
                [pipeline],
                [closedate],
                [createdate],
                [hs_lastmodifieddate],
                [dealtype],
                [description],
                [hs_deal_stage_probability],
                [hs_projected_amount],
                [hs_priority],
                [hubspot_owner_id],
                [notes_last_contacted],
                [num_associated_contacts],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @dealname,
                @amount,
                @dealstage,
                @pipeline,
                @closedate,
                @createdate,
                @hs_lastmodifieddate,
                @dealtype,
                @description,
                @hs_deal_stage_probability,
                @hs_projected_amount,
                @hs_priority,
                @hubspot_owner_id,
                @notes_last_contacted,
                @num_associated_contacts,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwDeals] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateDeal] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Deals */

GRANT EXECUTE ON [HubSpot].[spCreateDeal] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Deals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: spUpdateDeal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Deal
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateDeal]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateDeal];
GO

CREATE PROCEDURE [HubSpot].[spUpdateDeal]
    @hs_object_id nvarchar(100),
    @dealname nvarchar(500),
    @amount decimal(18, 2),
    @dealstage nvarchar(500),
    @pipeline nvarchar(500),
    @closedate datetimeoffset,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @dealtype nvarchar(500),
    @description nvarchar(MAX),
    @hs_deal_stage_probability decimal(18, 2),
    @hs_projected_amount decimal(18, 2),
    @hs_priority nvarchar(500),
    @hubspot_owner_id nvarchar(100),
    @notes_last_contacted nvarchar(255),
    @num_associated_contacts int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Deal]
    SET
        [dealname] = @dealname,
        [amount] = @amount,
        [dealstage] = @dealstage,
        [pipeline] = @pipeline,
        [closedate] = @closedate,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [dealtype] = @dealtype,
        [description] = @description,
        [hs_deal_stage_probability] = @hs_deal_stage_probability,
        [hs_projected_amount] = @hs_projected_amount,
        [hs_priority] = @hs_priority,
        [hubspot_owner_id] = @hubspot_owner_id,
        [notes_last_contacted] = @notes_last_contacted,
        [num_associated_contacts] = @num_associated_contacts,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwDeals] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwDeals]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateDeal] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Deal table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateDeal]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateDeal];
GO
CREATE TRIGGER [HubSpot].trgUpdateDeal
ON [HubSpot].[Deal]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Deal]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[Deal] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Deals */

GRANT EXECUTE ON [HubSpot].[spUpdateDeal] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Connections
-- Item: spDeleteConnection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Connection
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteConnection]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteConnection];
GO

CREATE PROCEDURE [YourMembership].[spDeleteConnection]
    @ConnectionId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[Connection]
    WHERE
        [ConnectionId] = @ConnectionId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ConnectionId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ConnectionId AS [ConnectionId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteConnection] TO [cdp_Integration]
    

/* spDelete Permissions for Connections */

GRANT EXECUTE ON [YourMembership].[spDeleteConnection] TO [cdp_Integration]



/* spDelete SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spDeleteContact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteContact]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteContact];
GO

CREATE PROCEDURE [HubSpot].[spDeleteContact]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[Contact]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteContact] TO [cdp_Integration]
    

/* spDelete Permissions for Contacts */

GRANT EXECUTE ON [HubSpot].[spDeleteContact] TO [cdp_Integration]



/* spDelete SQL for Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: spDeleteCountry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Country
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteCountry]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteCountry];
GO

CREATE PROCEDURE [YourMembership].[spDeleteCountry]
    @countryId nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[Country]
    WHERE
        [countryId] = @countryId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [countryId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @countryId AS [countryId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteCountry] TO [cdp_Integration]
    

/* spDelete Permissions for Countries */

GRANT EXECUTE ON [YourMembership].[spDeleteCountry] TO [cdp_Integration]



/* spDelete SQL for Custom Tax Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Tax Locations
-- Item: spDeleteCustomTaxLocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CustomTaxLocation
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteCustomTaxLocation]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteCustomTaxLocation];
GO

CREATE PROCEDURE [YourMembership].[spDeleteCustomTaxLocation]
    @Id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[CustomTaxLocation]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteCustomTaxLocation] TO [cdp_Integration]
    

/* spDelete Permissions for Custom Tax Locations */

GRANT EXECUTE ON [YourMembership].[spDeleteCustomTaxLocation] TO [cdp_Integration]



/* spDelete SQL for Deals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: spDeleteDeal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Deal
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteDeal]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteDeal];
GO

CREATE PROCEDURE [HubSpot].[spDeleteDeal]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[Deal]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteDeal] TO [cdp_Integration]
    

/* spDelete Permissions for Deals */

GRANT EXECUTE ON [HubSpot].[spDeleteDeal] TO [cdp_Integration]



/* Index for Foreign Keys for DonationFund */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Funds
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for DonationHistory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Histories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key intDonationId in table DonationHistory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DonationHistory_intDonationId' 
    AND object_id = OBJECT_ID('[YourMembership].[DonationHistory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DonationHistory_intDonationId ON [YourMembership].[DonationHistory] ([intDonationId]);

-- Index for foreign key ProfileID in table DonationHistory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DonationHistory_ProfileID' 
    AND object_id = OBJECT_ID('[YourMembership].[DonationHistory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DonationHistory_ProfileID ON [YourMembership].[DonationHistory] ([ProfileID]);

/* Index for Foreign Keys for DonationTransaction */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Transactions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key WebsiteMemberID in table DonationTransaction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DonationTransaction_WebsiteMemberID' 
    AND object_id = OBJECT_ID('[YourMembership].[DonationTransaction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DonationTransaction_WebsiteMemberID ON [YourMembership].[DonationTransaction] ([WebsiteMemberID]);

-- Index for foreign key FundName in table DonationTransaction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DonationTransaction_FundName' 
    AND object_id = OBJECT_ID('[YourMembership].[DonationTransaction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DonationTransaction_FundName ON [YourMembership].[DonationTransaction] ([FundName]);

/* Index for Foreign Keys for DuesRule */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Rules
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for DuesTransaction */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Transactions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key WebsiteMemberID in table DuesTransaction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuesTransaction_WebsiteMemberID' 
    AND object_id = OBJECT_ID('[YourMembership].[DuesTransaction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuesTransaction_WebsiteMemberID ON [YourMembership].[DuesTransaction] ([WebsiteMemberID]);

-- Index for foreign key MemberType in table DuesTransaction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuesTransaction_MemberType' 
    AND object_id = OBJECT_ID('[YourMembership].[DuesTransaction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuesTransaction_MemberType ON [YourMembership].[DuesTransaction] ([MemberType]);

/* Base View SQL for Donation Funds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Funds
-- Item: vwDonationFunds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Donation Funds
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  DonationFund
-----               PRIMARY KEY: fundId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwDonationFunds]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwDonationFunds];
GO

CREATE VIEW [YourMembership].[vwDonationFunds]
AS
SELECT
    d.*
FROM
    [YourMembership].[DonationFund] AS d
GO
GRANT SELECT ON [YourMembership].[vwDonationFunds] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Donation Funds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Funds
-- Item: Permissions for vwDonationFunds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwDonationFunds] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Donation Funds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Funds
-- Item: spCreateDonationFund
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DonationFund
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateDonationFund]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateDonationFund];
GO

CREATE PROCEDURE [YourMembership].[spCreateDonationFund]
    @fundId int = NULL,
    @fundName nvarchar(200),
    @fundOptionsCount int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[DonationFund]
        (
            [fundId],
                [fundName],
                [fundOptionsCount],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @fundId,
                @fundName,
                @fundOptionsCount,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwDonationFunds] WHERE [fundId] = @fundId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateDonationFund] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Donation Funds */

GRANT EXECUTE ON [YourMembership].[spCreateDonationFund] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Donation Funds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Funds
-- Item: spUpdateDonationFund
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DonationFund
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateDonationFund]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateDonationFund];
GO

CREATE PROCEDURE [YourMembership].[spUpdateDonationFund]
    @fundId int,
    @fundName nvarchar(200),
    @fundOptionsCount int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[DonationFund]
    SET
        [fundName] = @fundName,
        [fundOptionsCount] = @fundOptionsCount,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [fundId] = @fundId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwDonationFunds] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwDonationFunds]
                                    WHERE
                                        [fundId] = @fundId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateDonationFund] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DonationFund table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateDonationFund]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateDonationFund];
GO
CREATE TRIGGER [YourMembership].trgUpdateDonationFund
ON [YourMembership].[DonationFund]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[DonationFund]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[DonationFund] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[fundId] = I.[fundId];
END;
GO
        

/* spUpdate Permissions for Donation Funds */

GRANT EXECUTE ON [YourMembership].[spUpdateDonationFund] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Donation Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Histories
-- Item: vwDonationHistories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Donation Histories
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  DonationHistory
-----               PRIMARY KEY: intDonationId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwDonationHistories]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwDonationHistories];
GO

CREATE VIEW [YourMembership].[vwDonationHistories]
AS
SELECT
    d.*
FROM
    [YourMembership].[DonationHistory] AS d
GO
GRANT SELECT ON [YourMembership].[vwDonationHistories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Donation Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Histories
-- Item: Permissions for vwDonationHistories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwDonationHistories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Donation Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Histories
-- Item: spCreateDonationHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DonationHistory
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateDonationHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateDonationHistory];
GO

CREATE PROCEDURE [YourMembership].[spCreateDonationHistory]
    @intDonationId int = NULL,
    @ProfileID int,
    @DatDonation datetimeoffset,
    @dblDonation decimal(18, 2),
    @strStatus nvarchar(200),
    @strFundName nvarchar(200),
    @strDonorName nvarchar(200),
    @strPaymentMethod nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[DonationHistory]
        (
            [intDonationId],
                [ProfileID],
                [DatDonation],
                [dblDonation],
                [strStatus],
                [strFundName],
                [strDonorName],
                [strPaymentMethod],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @intDonationId,
                @ProfileID,
                @DatDonation,
                @dblDonation,
                @strStatus,
                @strFundName,
                @strDonorName,
                @strPaymentMethod,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwDonationHistories] WHERE [intDonationId] = @intDonationId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateDonationHistory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Donation Histories */

GRANT EXECUTE ON [YourMembership].[spCreateDonationHistory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Donation Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Histories
-- Item: spUpdateDonationHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DonationHistory
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateDonationHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateDonationHistory];
GO

CREATE PROCEDURE [YourMembership].[spUpdateDonationHistory]
    @intDonationId int,
    @ProfileID int,
    @DatDonation datetimeoffset,
    @dblDonation decimal(18, 2),
    @strStatus nvarchar(200),
    @strFundName nvarchar(200),
    @strDonorName nvarchar(200),
    @strPaymentMethod nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[DonationHistory]
    SET
        [ProfileID] = @ProfileID,
        [DatDonation] = @DatDonation,
        [dblDonation] = @dblDonation,
        [strStatus] = @strStatus,
        [strFundName] = @strFundName,
        [strDonorName] = @strDonorName,
        [strPaymentMethod] = @strPaymentMethod,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [intDonationId] = @intDonationId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwDonationHistories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwDonationHistories]
                                    WHERE
                                        [intDonationId] = @intDonationId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateDonationHistory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DonationHistory table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateDonationHistory]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateDonationHistory];
GO
CREATE TRIGGER [YourMembership].trgUpdateDonationHistory
ON [YourMembership].[DonationHistory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[DonationHistory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[DonationHistory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[intDonationId] = I.[intDonationId];
END;
GO
        

/* spUpdate Permissions for Donation Histories */

GRANT EXECUTE ON [YourMembership].[spUpdateDonationHistory] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Donation Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Transactions
-- Item: vwDonationTransactions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Donation Transactions
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  DonationTransaction
-----               PRIMARY KEY: TransactionID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwDonationTransactions]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwDonationTransactions];
GO

CREATE VIEW [YourMembership].[vwDonationTransactions]
AS
SELECT
    d.*
FROM
    [YourMembership].[DonationTransaction] AS d
GO
GRANT SELECT ON [YourMembership].[vwDonationTransactions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Donation Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Transactions
-- Item: Permissions for vwDonationTransactions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwDonationTransactions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Donation Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Transactions
-- Item: spCreateDonationTransaction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DonationTransaction
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateDonationTransaction]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateDonationTransaction];
GO

CREATE PROCEDURE [YourMembership].[spCreateDonationTransaction]
    @TransactionID int = NULL,
    @WebsiteMemberID int,
    @ConstituentID nvarchar(200),
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @Amount decimal(18, 2),
    @FundName nvarchar(200),
    @DateSubmitted datetimeoffset,
    @Status nvarchar(200),
    @PaymentType nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[DonationTransaction]
        (
            [TransactionID],
                [WebsiteMemberID],
                [ConstituentID],
                [FirstName],
                [LastName],
                [Amount],
                [FundName],
                [DateSubmitted],
                [Status],
                [PaymentType],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @TransactionID,
                @WebsiteMemberID,
                @ConstituentID,
                @FirstName,
                @LastName,
                @Amount,
                @FundName,
                @DateSubmitted,
                @Status,
                @PaymentType,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwDonationTransactions] WHERE [TransactionID] = @TransactionID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateDonationTransaction] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Donation Transactions */

GRANT EXECUTE ON [YourMembership].[spCreateDonationTransaction] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Donation Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Transactions
-- Item: spUpdateDonationTransaction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DonationTransaction
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateDonationTransaction]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateDonationTransaction];
GO

CREATE PROCEDURE [YourMembership].[spUpdateDonationTransaction]
    @TransactionID int,
    @WebsiteMemberID int,
    @ConstituentID nvarchar(200),
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @Amount decimal(18, 2),
    @FundName nvarchar(200),
    @DateSubmitted datetimeoffset,
    @Status nvarchar(200),
    @PaymentType nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[DonationTransaction]
    SET
        [WebsiteMemberID] = @WebsiteMemberID,
        [ConstituentID] = @ConstituentID,
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Amount] = @Amount,
        [FundName] = @FundName,
        [DateSubmitted] = @DateSubmitted,
        [Status] = @Status,
        [PaymentType] = @PaymentType,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [TransactionID] = @TransactionID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwDonationTransactions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwDonationTransactions]
                                    WHERE
                                        [TransactionID] = @TransactionID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateDonationTransaction] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DonationTransaction table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateDonationTransaction]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateDonationTransaction];
GO
CREATE TRIGGER [YourMembership].trgUpdateDonationTransaction
ON [YourMembership].[DonationTransaction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[DonationTransaction]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[DonationTransaction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[TransactionID] = I.[TransactionID];
END;
GO
        

/* spUpdate Permissions for Donation Transactions */

GRANT EXECUTE ON [YourMembership].[spUpdateDonationTransaction] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Dues Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Rules
-- Item: vwDuesRules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Dues Rules
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  DuesRule
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwDuesRules]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwDuesRules];
GO

CREATE VIEW [YourMembership].[vwDuesRules]
AS
SELECT
    d.*
FROM
    [YourMembership].[DuesRule] AS d
GO
GRANT SELECT ON [YourMembership].[vwDuesRules] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Dues Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Rules
-- Item: Permissions for vwDuesRules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwDuesRules] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Dues Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Rules
-- Item: spCreateDuesRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuesRule
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateDuesRule]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateDuesRule];
GO

CREATE PROCEDURE [YourMembership].[spCreateDuesRule]
    @ID int = NULL,
    @Name nvarchar(200),
    @Description nvarchar(500),
    @Amount decimal(18, 2),
    @Selected bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[DuesRule]
        (
            [ID],
                [Name],
                [Description],
                [Amount],
                [Selected],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ID,
                @Name,
                @Description,
                @Amount,
                @Selected,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwDuesRules] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateDuesRule] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Dues Rules */

GRANT EXECUTE ON [YourMembership].[spCreateDuesRule] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Dues Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Rules
-- Item: spUpdateDuesRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuesRule
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateDuesRule]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateDuesRule];
GO

CREATE PROCEDURE [YourMembership].[spUpdateDuesRule]
    @ID int,
    @Name nvarchar(200),
    @Description nvarchar(500),
    @Amount decimal(18, 2),
    @Selected bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[DuesRule]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Amount] = @Amount,
        [Selected] = @Selected,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwDuesRules] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwDuesRules]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateDuesRule] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuesRule table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateDuesRule]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateDuesRule];
GO
CREATE TRIGGER [YourMembership].trgUpdateDuesRule
ON [YourMembership].[DuesRule]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[DuesRule]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[DuesRule] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Dues Rules */

GRANT EXECUTE ON [YourMembership].[spUpdateDuesRule] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Dues Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Transactions
-- Item: vwDuesTransactions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Dues Transactions
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  DuesTransaction
-----               PRIMARY KEY: TransactionID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwDuesTransactions]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwDuesTransactions];
GO

CREATE VIEW [YourMembership].[vwDuesTransactions]
AS
SELECT
    d.*
FROM
    [YourMembership].[DuesTransaction] AS d
GO
GRANT SELECT ON [YourMembership].[vwDuesTransactions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Dues Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Transactions
-- Item: Permissions for vwDuesTransactions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwDuesTransactions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Dues Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Transactions
-- Item: spCreateDuesTransaction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuesTransaction
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateDuesTransaction]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateDuesTransaction];
GO

CREATE PROCEDURE [YourMembership].[spCreateDuesTransaction]
    @TransactionID int = NULL,
    @InvoiceNumber int,
    @Status nvarchar(200),
    @WebsiteMemberID int,
    @ConstituentID nvarchar(200),
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @Email nvarchar(200),
    @Organization nvarchar(200),
    @Amount decimal(18, 2),
    @BalanceDue decimal(18, 2),
    @PaymentType nvarchar(200),
    @DateSubmitted datetimeoffset,
    @DateProcessed datetimeoffset,
    @MembershipRequested nvarchar(200),
    @CurrentMembership nvarchar(200),
    @CurrentMembershipExpDate datetimeoffset,
    @MemberType nvarchar(200),
    @DateMemberSignup datetimeoffset,
    @InvoiceDate datetimeoffset,
    @ClosedBy nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[DuesTransaction]
        (
            [TransactionID],
                [InvoiceNumber],
                [Status],
                [WebsiteMemberID],
                [ConstituentID],
                [FirstName],
                [LastName],
                [Email],
                [Organization],
                [Amount],
                [BalanceDue],
                [PaymentType],
                [DateSubmitted],
                [DateProcessed],
                [MembershipRequested],
                [CurrentMembership],
                [CurrentMembershipExpDate],
                [MemberType],
                [DateMemberSignup],
                [InvoiceDate],
                [ClosedBy],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @TransactionID,
                @InvoiceNumber,
                @Status,
                @WebsiteMemberID,
                @ConstituentID,
                @FirstName,
                @LastName,
                @Email,
                @Organization,
                @Amount,
                @BalanceDue,
                @PaymentType,
                @DateSubmitted,
                @DateProcessed,
                @MembershipRequested,
                @CurrentMembership,
                @CurrentMembershipExpDate,
                @MemberType,
                @DateMemberSignup,
                @InvoiceDate,
                @ClosedBy,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwDuesTransactions] WHERE [TransactionID] = @TransactionID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateDuesTransaction] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Dues Transactions */

GRANT EXECUTE ON [YourMembership].[spCreateDuesTransaction] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Dues Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Transactions
-- Item: spUpdateDuesTransaction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuesTransaction
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateDuesTransaction]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateDuesTransaction];
GO

CREATE PROCEDURE [YourMembership].[spUpdateDuesTransaction]
    @TransactionID int,
    @InvoiceNumber int,
    @Status nvarchar(200),
    @WebsiteMemberID int,
    @ConstituentID nvarchar(200),
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @Email nvarchar(200),
    @Organization nvarchar(200),
    @Amount decimal(18, 2),
    @BalanceDue decimal(18, 2),
    @PaymentType nvarchar(200),
    @DateSubmitted datetimeoffset,
    @DateProcessed datetimeoffset,
    @MembershipRequested nvarchar(200),
    @CurrentMembership nvarchar(200),
    @CurrentMembershipExpDate datetimeoffset,
    @MemberType nvarchar(200),
    @DateMemberSignup datetimeoffset,
    @InvoiceDate datetimeoffset,
    @ClosedBy nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[DuesTransaction]
    SET
        [InvoiceNumber] = @InvoiceNumber,
        [Status] = @Status,
        [WebsiteMemberID] = @WebsiteMemberID,
        [ConstituentID] = @ConstituentID,
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Email] = @Email,
        [Organization] = @Organization,
        [Amount] = @Amount,
        [BalanceDue] = @BalanceDue,
        [PaymentType] = @PaymentType,
        [DateSubmitted] = @DateSubmitted,
        [DateProcessed] = @DateProcessed,
        [MembershipRequested] = @MembershipRequested,
        [CurrentMembership] = @CurrentMembership,
        [CurrentMembershipExpDate] = @CurrentMembershipExpDate,
        [MemberType] = @MemberType,
        [DateMemberSignup] = @DateMemberSignup,
        [InvoiceDate] = @InvoiceDate,
        [ClosedBy] = @ClosedBy,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [TransactionID] = @TransactionID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwDuesTransactions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwDuesTransactions]
                                    WHERE
                                        [TransactionID] = @TransactionID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateDuesTransaction] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuesTransaction table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateDuesTransaction]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateDuesTransaction];
GO
CREATE TRIGGER [YourMembership].trgUpdateDuesTransaction
ON [YourMembership].[DuesTransaction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[DuesTransaction]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[DuesTransaction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[TransactionID] = I.[TransactionID];
END;
GO
        

/* spUpdate Permissions for Dues Transactions */

GRANT EXECUTE ON [YourMembership].[spUpdateDuesTransaction] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Donation Funds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Funds
-- Item: spDeleteDonationFund
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DonationFund
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteDonationFund]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteDonationFund];
GO

CREATE PROCEDURE [YourMembership].[spDeleteDonationFund]
    @fundId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[DonationFund]
    WHERE
        [fundId] = @fundId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [fundId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @fundId AS [fundId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteDonationFund] TO [cdp_Integration]
    

/* spDelete Permissions for Donation Funds */

GRANT EXECUTE ON [YourMembership].[spDeleteDonationFund] TO [cdp_Integration]



/* spDelete SQL for Donation Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Histories
-- Item: spDeleteDonationHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DonationHistory
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteDonationHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteDonationHistory];
GO

CREATE PROCEDURE [YourMembership].[spDeleteDonationHistory]
    @intDonationId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[DonationHistory]
    WHERE
        [intDonationId] = @intDonationId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [intDonationId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @intDonationId AS [intDonationId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteDonationHistory] TO [cdp_Integration]
    

/* spDelete Permissions for Donation Histories */

GRANT EXECUTE ON [YourMembership].[spDeleteDonationHistory] TO [cdp_Integration]



/* spDelete SQL for Donation Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Donation Transactions
-- Item: spDeleteDonationTransaction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DonationTransaction
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteDonationTransaction]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteDonationTransaction];
GO

CREATE PROCEDURE [YourMembership].[spDeleteDonationTransaction]
    @TransactionID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[DonationTransaction]
    WHERE
        [TransactionID] = @TransactionID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [TransactionID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @TransactionID AS [TransactionID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteDonationTransaction] TO [cdp_Integration]
    

/* spDelete Permissions for Donation Transactions */

GRANT EXECUTE ON [YourMembership].[spDeleteDonationTransaction] TO [cdp_Integration]



/* spDelete SQL for Dues Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Rules
-- Item: spDeleteDuesRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuesRule
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteDuesRule]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteDuesRule];
GO

CREATE PROCEDURE [YourMembership].[spDeleteDuesRule]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[DuesRule]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteDuesRule] TO [cdp_Integration]
    

/* spDelete Permissions for Dues Rules */

GRANT EXECUTE ON [YourMembership].[spDeleteDuesRule] TO [cdp_Integration]



/* spDelete SQL for Dues Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dues Transactions
-- Item: spDeleteDuesTransaction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuesTransaction
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteDuesTransaction]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteDuesTransaction];
GO

CREATE PROCEDURE [YourMembership].[spDeleteDuesTransaction]
    @TransactionID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[DuesTransaction]
    WHERE
        [TransactionID] = @TransactionID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [TransactionID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @TransactionID AS [TransactionID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteDuesTransaction] TO [cdp_Integration]
    

/* spDelete Permissions for Dues Transactions */

GRANT EXECUTE ON [YourMembership].[spDeleteDuesTransaction] TO [cdp_Integration]



/* Index for Foreign Keys for EmailSuppressionList */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Suppression Lists
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Email */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for EngagementScore */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Engagement Scores
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProfileID in table EngagementScore
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EngagementScore_ProfileID' 
    AND object_id = OBJECT_ID('[YourMembership].[EngagementScore]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EngagementScore_ProfileID ON [YourMembership].[EngagementScore] ([ProfileID]);

/* Index for Foreign Keys for EventAttendeeType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Attendee Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EventId in table EventAttendeeType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventAttendeeType_EventId' 
    AND object_id = OBJECT_ID('[YourMembership].[EventAttendeeType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventAttendeeType_EventId ON [YourMembership].[EventAttendeeType] ([EventId]);

/* Index for Foreign Keys for EventCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Email Suppression Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Suppression Lists
-- Item: vwEmailSuppressionLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Email Suppression Lists
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  EmailSuppressionList
-----               PRIMARY KEY: Email
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEmailSuppressionLists]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEmailSuppressionLists];
GO

CREATE VIEW [YourMembership].[vwEmailSuppressionLists]
AS
SELECT
    e.*
FROM
    [YourMembership].[EmailSuppressionList] AS e
GO
GRANT SELECT ON [YourMembership].[vwEmailSuppressionLists] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Email Suppression Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Suppression Lists
-- Item: Permissions for vwEmailSuppressionLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEmailSuppressionLists] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Email Suppression Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Suppression Lists
-- Item: spCreateEmailSuppressionList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EmailSuppressionList
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEmailSuppressionList]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEmailSuppressionList];
GO

CREATE PROCEDURE [YourMembership].[spCreateEmailSuppressionList]
    @Email nvarchar(200) = NULL,
    @SuppressionType nvarchar(200),
    @BounceCount int,
    @HealthRate decimal(18, 2),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[EmailSuppressionList]
        (
            [Email],
                [SuppressionType],
                [BounceCount],
                [HealthRate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @Email,
                @SuppressionType,
                @BounceCount,
                @HealthRate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEmailSuppressionLists] WHERE [Email] = @Email
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEmailSuppressionList] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Email Suppression Lists */

GRANT EXECUTE ON [YourMembership].[spCreateEmailSuppressionList] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Email Suppression Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Suppression Lists
-- Item: spUpdateEmailSuppressionList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EmailSuppressionList
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEmailSuppressionList]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEmailSuppressionList];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEmailSuppressionList]
    @Email nvarchar(200),
    @SuppressionType nvarchar(200),
    @BounceCount int,
    @HealthRate decimal(18, 2),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EmailSuppressionList]
    SET
        [SuppressionType] = @SuppressionType,
        [BounceCount] = @BounceCount,
        [HealthRate] = @HealthRate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [Email] = @Email

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEmailSuppressionLists] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEmailSuppressionLists]
                                    WHERE
                                        [Email] = @Email
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEmailSuppressionList] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EmailSuppressionList table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEmailSuppressionList]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEmailSuppressionList];
GO
CREATE TRIGGER [YourMembership].trgUpdateEmailSuppressionList
ON [YourMembership].[EmailSuppressionList]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EmailSuppressionList]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[EmailSuppressionList] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Email] = I.[Email];
END;
GO
        

/* spUpdate Permissions for Email Suppression Lists */

GRANT EXECUTE ON [YourMembership].[spUpdateEmailSuppressionList] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: vwEmails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Emails
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  Email
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwEmails]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwEmails];
GO

CREATE VIEW [HubSpot].[vwEmails]
AS
SELECT
    e.*
FROM
    [HubSpot].[Email] AS e
GO
GRANT SELECT ON [HubSpot].[vwEmails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: Permissions for vwEmails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwEmails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spCreateEmail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Email
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateEmail]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateEmail];
GO

CREATE PROCEDURE [HubSpot].[spCreateEmail]
    @hs_object_id nvarchar(100) = NULL,
    @hs_email_subject nvarchar(500),
    @hs_email_text nvarchar(MAX),
    @hs_email_html nvarchar(255),
    @hs_email_status nvarchar(500),
    @hs_email_direction nvarchar(500),
    @hs_email_sender_email nvarchar(500),
    @hs_email_sender_firstname nvarchar(500),
    @hs_email_sender_lastname nvarchar(500),
    @hs_email_to_email nvarchar(500),
    @hubspot_owner_id nvarchar(100),
    @hs_timestamp datetimeoffset,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[Email]
        (
            [hs_object_id],
                [hs_email_subject],
                [hs_email_text],
                [hs_email_html],
                [hs_email_status],
                [hs_email_direction],
                [hs_email_sender_email],
                [hs_email_sender_firstname],
                [hs_email_sender_lastname],
                [hs_email_to_email],
                [hubspot_owner_id],
                [hs_timestamp],
                [createdate],
                [hs_lastmodifieddate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @hs_email_subject,
                @hs_email_text,
                @hs_email_html,
                @hs_email_status,
                @hs_email_direction,
                @hs_email_sender_email,
                @hs_email_sender_firstname,
                @hs_email_sender_lastname,
                @hs_email_to_email,
                @hubspot_owner_id,
                @hs_timestamp,
                @createdate,
                @hs_lastmodifieddate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwEmails] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateEmail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Emails */

GRANT EXECUTE ON [HubSpot].[spCreateEmail] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spUpdateEmail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Email
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateEmail]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateEmail];
GO

CREATE PROCEDURE [HubSpot].[spUpdateEmail]
    @hs_object_id nvarchar(100),
    @hs_email_subject nvarchar(500),
    @hs_email_text nvarchar(MAX),
    @hs_email_html nvarchar(255),
    @hs_email_status nvarchar(500),
    @hs_email_direction nvarchar(500),
    @hs_email_sender_email nvarchar(500),
    @hs_email_sender_firstname nvarchar(500),
    @hs_email_sender_lastname nvarchar(500),
    @hs_email_to_email nvarchar(500),
    @hubspot_owner_id nvarchar(100),
    @hs_timestamp datetimeoffset,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Email]
    SET
        [hs_email_subject] = @hs_email_subject,
        [hs_email_text] = @hs_email_text,
        [hs_email_html] = @hs_email_html,
        [hs_email_status] = @hs_email_status,
        [hs_email_direction] = @hs_email_direction,
        [hs_email_sender_email] = @hs_email_sender_email,
        [hs_email_sender_firstname] = @hs_email_sender_firstname,
        [hs_email_sender_lastname] = @hs_email_sender_lastname,
        [hs_email_to_email] = @hs_email_to_email,
        [hubspot_owner_id] = @hubspot_owner_id,
        [hs_timestamp] = @hs_timestamp,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwEmails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwEmails]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateEmail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Email table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateEmail]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateEmail];
GO
CREATE TRIGGER [HubSpot].trgUpdateEmail
ON [HubSpot].[Email]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Email]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[Email] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Emails */

GRANT EXECUTE ON [HubSpot].[spUpdateEmail] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Engagement Scores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Engagement Scores
-- Item: vwEngagementScores
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Engagement Scores
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  EngagementScore
-----               PRIMARY KEY: ProfileID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEngagementScores]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEngagementScores];
GO

CREATE VIEW [YourMembership].[vwEngagementScores]
AS
SELECT
    e.*
FROM
    [YourMembership].[EngagementScore] AS e
GO
GRANT SELECT ON [YourMembership].[vwEngagementScores] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Engagement Scores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Engagement Scores
-- Item: Permissions for vwEngagementScores
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEngagementScores] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Engagement Scores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Engagement Scores
-- Item: spCreateEngagementScore
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EngagementScore
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEngagementScore]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEngagementScore];
GO

CREATE PROCEDURE [YourMembership].[spCreateEngagementScore]
    @ProfileID int = NULL,
    @EngagementScore decimal(18, 2),
    @LastUpdated datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[EngagementScore]
        (
            [ProfileID],
                [EngagementScore],
                [LastUpdated],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ProfileID,
                @EngagementScore,
                @LastUpdated,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEngagementScores] WHERE [ProfileID] = @ProfileID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEngagementScore] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Engagement Scores */

GRANT EXECUTE ON [YourMembership].[spCreateEngagementScore] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Engagement Scores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Engagement Scores
-- Item: spUpdateEngagementScore
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EngagementScore
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEngagementScore]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEngagementScore];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEngagementScore]
    @ProfileID int,
    @EngagementScore decimal(18, 2),
    @LastUpdated datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EngagementScore]
    SET
        [EngagementScore] = @EngagementScore,
        [LastUpdated] = @LastUpdated,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ProfileID] = @ProfileID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEngagementScores] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEngagementScores]
                                    WHERE
                                        [ProfileID] = @ProfileID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEngagementScore] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EngagementScore table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEngagementScore]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEngagementScore];
GO
CREATE TRIGGER [YourMembership].trgUpdateEngagementScore
ON [YourMembership].[EngagementScore]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EngagementScore]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[EngagementScore] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ProfileID] = I.[ProfileID];
END;
GO
        

/* spUpdate Permissions for Engagement Scores */

GRANT EXECUTE ON [YourMembership].[spUpdateEngagementScore] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Event Attendee Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Attendee Types
-- Item: vwEventAttendeeTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Attendee Types
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  EventAttendeeType
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEventAttendeeTypes]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEventAttendeeTypes];
GO

CREATE VIEW [YourMembership].[vwEventAttendeeTypes]
AS
SELECT
    e.*
FROM
    [YourMembership].[EventAttendeeType] AS e
GO
GRANT SELECT ON [YourMembership].[vwEventAttendeeTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Event Attendee Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Attendee Types
-- Item: Permissions for vwEventAttendeeTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEventAttendeeTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Event Attendee Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Attendee Types
-- Item: spCreateEventAttendeeType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventAttendeeType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEventAttendeeType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEventAttendeeType];
GO

CREATE PROCEDURE [YourMembership].[spCreateEventAttendeeType]
    @Id int = NULL,
    @EventId int,
    @Name nvarchar(200),
    @Description nvarchar(500),
    @Active bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[EventAttendeeType]
        (
            [Id],
                [EventId],
                [Name],
                [Description],
                [Active],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @Id,
                @EventId,
                @Name,
                @Description,
                @Active,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEventAttendeeTypes] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEventAttendeeType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Event Attendee Types */

GRANT EXECUTE ON [YourMembership].[spCreateEventAttendeeType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Event Attendee Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Attendee Types
-- Item: spUpdateEventAttendeeType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventAttendeeType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEventAttendeeType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEventAttendeeType];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEventAttendeeType]
    @Id int,
    @EventId int,
    @Name nvarchar(200),
    @Description nvarchar(500),
    @Active bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventAttendeeType]
    SET
        [EventId] = @EventId,
        [Name] = @Name,
        [Description] = @Description,
        [Active] = @Active,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEventAttendeeTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEventAttendeeTypes]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEventAttendeeType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventAttendeeType table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEventAttendeeType]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEventAttendeeType];
GO
CREATE TRIGGER [YourMembership].trgUpdateEventAttendeeType
ON [YourMembership].[EventAttendeeType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventAttendeeType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[EventAttendeeType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO
        

/* spUpdate Permissions for Event Attendee Types */

GRANT EXECUTE ON [YourMembership].[spUpdateEventAttendeeType] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Event Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Categories
-- Item: vwEventCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Categories
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  EventCategory
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEventCategories]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEventCategories];
GO

CREATE VIEW [YourMembership].[vwEventCategories]
AS
SELECT
    e.*
FROM
    [YourMembership].[EventCategory] AS e
GO
GRANT SELECT ON [YourMembership].[vwEventCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Event Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Categories
-- Item: Permissions for vwEventCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEventCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Event Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Categories
-- Item: spCreateEventCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventCategory
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEventCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEventCategory];
GO

CREATE PROCEDURE [YourMembership].[spCreateEventCategory]
    @Id int = NULL,
    @Name nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[EventCategory]
        (
            [Id],
                [Name],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @Id,
                @Name,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEventCategories] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEventCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Event Categories */

GRANT EXECUTE ON [YourMembership].[spCreateEventCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Event Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Categories
-- Item: spUpdateEventCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventCategory
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEventCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEventCategory];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEventCategory]
    @Id int,
    @Name nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventCategory]
    SET
        [Name] = @Name,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEventCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEventCategories]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEventCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventCategory table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEventCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEventCategory];
GO
CREATE TRIGGER [YourMembership].trgUpdateEventCategory
ON [YourMembership].[EventCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[EventCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO
        

/* spUpdate Permissions for Event Categories */

GRANT EXECUTE ON [YourMembership].[spUpdateEventCategory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Email Suppression Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Suppression Lists
-- Item: spDeleteEmailSuppressionList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EmailSuppressionList
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEmailSuppressionList]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEmailSuppressionList];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEmailSuppressionList]
    @Email nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[EmailSuppressionList]
    WHERE
        [Email] = @Email


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Email] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Email AS [Email] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEmailSuppressionList] TO [cdp_Integration]
    

/* spDelete Permissions for Email Suppression Lists */

GRANT EXECUTE ON [YourMembership].[spDeleteEmailSuppressionList] TO [cdp_Integration]



/* spDelete SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spDeleteEmail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Email
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteEmail]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteEmail];
GO

CREATE PROCEDURE [HubSpot].[spDeleteEmail]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[Email]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteEmail] TO [cdp_Integration]
    

/* spDelete Permissions for Emails */

GRANT EXECUTE ON [HubSpot].[spDeleteEmail] TO [cdp_Integration]



/* spDelete SQL for Engagement Scores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Engagement Scores
-- Item: spDeleteEngagementScore
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EngagementScore
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEngagementScore]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEngagementScore];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEngagementScore]
    @ProfileID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[EngagementScore]
    WHERE
        [ProfileID] = @ProfileID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ProfileID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ProfileID AS [ProfileID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEngagementScore] TO [cdp_Integration]
    

/* spDelete Permissions for Engagement Scores */

GRANT EXECUTE ON [YourMembership].[spDeleteEngagementScore] TO [cdp_Integration]



/* spDelete SQL for Event Attendee Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Attendee Types
-- Item: spDeleteEventAttendeeType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventAttendeeType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEventAttendeeType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEventAttendeeType];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEventAttendeeType]
    @Id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[EventAttendeeType]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEventAttendeeType] TO [cdp_Integration]
    

/* spDelete Permissions for Event Attendee Types */

GRANT EXECUTE ON [YourMembership].[spDeleteEventAttendeeType] TO [cdp_Integration]



/* spDelete SQL for Event Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Categories
-- Item: spDeleteEventCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventCategory
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEventCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEventCategory];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEventCategory]
    @Id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[EventCategory]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEventCategory] TO [cdp_Integration]
    

/* spDelete Permissions for Event Categories */

GRANT EXECUTE ON [YourMembership].[spDeleteEventCategory] TO [cdp_Integration]



/* Index for Foreign Keys for EventCEUAward */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event CEU Awards
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EventId in table EventCEUAward
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventCEUAward_EventId' 
    AND object_id = OBJECT_ID('[YourMembership].[EventCEUAward]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventCEUAward_EventId ON [YourMembership].[EventCEUAward] ([EventId]);

-- Index for foreign key CertificationID in table EventCEUAward
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventCEUAward_CertificationID' 
    AND object_id = OBJECT_ID('[YourMembership].[EventCEUAward]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventCEUAward_CertificationID ON [YourMembership].[EventCEUAward] ([CertificationID]);

-- Index for foreign key CreditTypeID in table EventCEUAward
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventCEUAward_CreditTypeID' 
    AND object_id = OBJECT_ID('[YourMembership].[EventCEUAward]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventCEUAward_CreditTypeID ON [YourMembership].[EventCEUAward] ([CreditTypeID]);

/* Index for Foreign Keys for EventID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event IDs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EventId in table EventID
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventID_EventId' 
    AND object_id = OBJECT_ID('[YourMembership].[EventID]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventID_EventId ON [YourMembership].[EventID] ([EventId]);

/* Index for Foreign Keys for EventRegistrationForm */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Forms
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for EventRegistration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EventId in table EventRegistration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventRegistration_EventId' 
    AND object_id = OBJECT_ID('[YourMembership].[EventRegistration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventRegistration_EventId ON [YourMembership].[EventRegistration] ([EventId]);

/* Index for Foreign Keys for EventSessionGroup */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Session Groups
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EventId in table EventSessionGroup
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventSessionGroup_EventId' 
    AND object_id = OBJECT_ID('[YourMembership].[EventSessionGroup]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventSessionGroup_EventId ON [YourMembership].[EventSessionGroup] ([EventId]);

/* Base View SQL for Event CEU Awards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event CEU Awards
-- Item: vwEventCEUAwards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event CEU Awards
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  EventCEUAward
-----               PRIMARY KEY: AwardID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEventCEUAwards]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEventCEUAwards];
GO

CREATE VIEW [YourMembership].[vwEventCEUAwards]
AS
SELECT
    e.*
FROM
    [YourMembership].[EventCEUAward] AS e
GO
GRANT SELECT ON [YourMembership].[vwEventCEUAwards] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Event CEU Awards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event CEU Awards
-- Item: Permissions for vwEventCEUAwards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEventCEUAwards] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Event CEU Awards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event CEU Awards
-- Item: spCreateEventCEUAward
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventCEUAward
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEventCEUAward]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEventCEUAward];
GO

CREATE PROCEDURE [YourMembership].[spCreateEventCEUAward]
    @AwardID int = NULL,
    @EventId int,
    @CertificationID nvarchar(200),
    @CreditTypeID int,
    @Credits decimal(18, 2),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[EventCEUAward]
        (
            [AwardID],
                [EventId],
                [CertificationID],
                [CreditTypeID],
                [Credits],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @AwardID,
                @EventId,
                @CertificationID,
                @CreditTypeID,
                @Credits,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEventCEUAwards] WHERE [AwardID] = @AwardID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEventCEUAward] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Event CEU Awards */

GRANT EXECUTE ON [YourMembership].[spCreateEventCEUAward] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Event CEU Awards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event CEU Awards
-- Item: spUpdateEventCEUAward
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventCEUAward
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEventCEUAward]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEventCEUAward];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEventCEUAward]
    @AwardID int,
    @EventId int,
    @CertificationID nvarchar(200),
    @CreditTypeID int,
    @Credits decimal(18, 2),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventCEUAward]
    SET
        [EventId] = @EventId,
        [CertificationID] = @CertificationID,
        [CreditTypeID] = @CreditTypeID,
        [Credits] = @Credits,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [AwardID] = @AwardID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEventCEUAwards] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEventCEUAwards]
                                    WHERE
                                        [AwardID] = @AwardID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEventCEUAward] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventCEUAward table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEventCEUAward]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEventCEUAward];
GO
CREATE TRIGGER [YourMembership].trgUpdateEventCEUAward
ON [YourMembership].[EventCEUAward]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventCEUAward]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[EventCEUAward] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[AwardID] = I.[AwardID];
END;
GO
        

/* spUpdate Permissions for Event CEU Awards */

GRANT EXECUTE ON [YourMembership].[spUpdateEventCEUAward] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Event IDs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event IDs
-- Item: vwEventIDs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event IDs
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  EventID
-----               PRIMARY KEY: EventId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEventIDs]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEventIDs];
GO

CREATE VIEW [YourMembership].[vwEventIDs]
AS
SELECT
    e.*
FROM
    [YourMembership].[EventID] AS e
GO
GRANT SELECT ON [YourMembership].[vwEventIDs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Event IDs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event IDs
-- Item: Permissions for vwEventIDs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEventIDs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Event IDs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event IDs
-- Item: spCreateEventID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEventID]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEventID];
GO

CREATE PROCEDURE [YourMembership].[spCreateEventID]
    @EventId int = NULL,
    @LastModifiedDate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[EventID]
        (
            [EventId],
                [LastModifiedDate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @EventId,
                @LastModifiedDate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEventIDs] WHERE [EventId] = @EventId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEventID] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Event IDs */

GRANT EXECUTE ON [YourMembership].[spCreateEventID] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Event IDs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event IDs
-- Item: spUpdateEventID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEventID]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEventID];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEventID]
    @EventId int,
    @LastModifiedDate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventID]
    SET
        [LastModifiedDate] = @LastModifiedDate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [EventId] = @EventId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEventIDs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEventIDs]
                                    WHERE
                                        [EventId] = @EventId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEventID] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventID table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEventID]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEventID];
GO
CREATE TRIGGER [YourMembership].trgUpdateEventID
ON [YourMembership].[EventID]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventID]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[EventID] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[EventId] = I.[EventId];
END;
GO
        

/* spUpdate Permissions for Event IDs */

GRANT EXECUTE ON [YourMembership].[spUpdateEventID] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Event Registration Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Forms
-- Item: vwEventRegistrationForms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Registration Forms
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  EventRegistrationForm
-----               PRIMARY KEY: FormId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEventRegistrationForms]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEventRegistrationForms];
GO

CREATE VIEW [YourMembership].[vwEventRegistrationForms]
AS
SELECT
    e.*
FROM
    [YourMembership].[EventRegistrationForm] AS e
GO
GRANT SELECT ON [YourMembership].[vwEventRegistrationForms] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Event Registration Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Forms
-- Item: Permissions for vwEventRegistrationForms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEventRegistrationForms] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Event Registration Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Forms
-- Item: spCreateEventRegistrationForm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventRegistrationForm
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEventRegistrationForm]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEventRegistrationForm];
GO

CREATE PROCEDURE [YourMembership].[spCreateEventRegistrationForm]
    @FormId int = NULL,
    @FormName nvarchar(200),
    @AutoApprove bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[EventRegistrationForm]
        (
            [FormId],
                [FormName],
                [AutoApprove],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @FormId,
                @FormName,
                @AutoApprove,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEventRegistrationForms] WHERE [FormId] = @FormId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEventRegistrationForm] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Event Registration Forms */

GRANT EXECUTE ON [YourMembership].[spCreateEventRegistrationForm] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Event Registration Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Forms
-- Item: spUpdateEventRegistrationForm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventRegistrationForm
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEventRegistrationForm]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEventRegistrationForm];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEventRegistrationForm]
    @FormId int,
    @FormName nvarchar(200),
    @AutoApprove bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventRegistrationForm]
    SET
        [FormName] = @FormName,
        [AutoApprove] = @AutoApprove,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [FormId] = @FormId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEventRegistrationForms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEventRegistrationForms]
                                    WHERE
                                        [FormId] = @FormId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEventRegistrationForm] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventRegistrationForm table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEventRegistrationForm]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEventRegistrationForm];
GO
CREATE TRIGGER [YourMembership].trgUpdateEventRegistrationForm
ON [YourMembership].[EventRegistrationForm]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventRegistrationForm]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[EventRegistrationForm] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[FormId] = I.[FormId];
END;
GO
        

/* spUpdate Permissions for Event Registration Forms */

GRANT EXECUTE ON [YourMembership].[spUpdateEventRegistrationForm] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: vwEventRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Registrations
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  EventRegistration
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEventRegistrations]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEventRegistrations];
GO

CREATE VIEW [YourMembership].[vwEventRegistrations]
AS
SELECT
    e.*
FROM
    [YourMembership].[EventRegistration] AS e
GO
GRANT SELECT ON [YourMembership].[vwEventRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: Permissions for vwEventRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEventRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: spCreateEventRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventRegistration
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEventRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEventRegistration];
GO

CREATE PROCEDURE [YourMembership].[spCreateEventRegistration]
    @Id int = NULL,
    @EventId int,
    @RegistrationID nvarchar(200),
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @DisplayName nvarchar(200),
    @HeadShotImage nvarchar(500),
    @DateRegistered datetimeoffset,
    @IsPrimary bit,
    @BadgeNumber int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[EventRegistration]
        (
            [Id],
                [EventId],
                [RegistrationID],
                [FirstName],
                [LastName],
                [DisplayName],
                [HeadShotImage],
                [DateRegistered],
                [IsPrimary],
                [BadgeNumber],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @Id,
                @EventId,
                @RegistrationID,
                @FirstName,
                @LastName,
                @DisplayName,
                @HeadShotImage,
                @DateRegistered,
                @IsPrimary,
                @BadgeNumber,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEventRegistrations] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEventRegistration] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Event Registrations */

GRANT EXECUTE ON [YourMembership].[spCreateEventRegistration] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: spUpdateEventRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventRegistration
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEventRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEventRegistration];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEventRegistration]
    @Id int,
    @EventId int,
    @RegistrationID nvarchar(200),
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @DisplayName nvarchar(200),
    @HeadShotImage nvarchar(500),
    @DateRegistered datetimeoffset,
    @IsPrimary bit,
    @BadgeNumber int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventRegistration]
    SET
        [EventId] = @EventId,
        [RegistrationID] = @RegistrationID,
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [DisplayName] = @DisplayName,
        [HeadShotImage] = @HeadShotImage,
        [DateRegistered] = @DateRegistered,
        [IsPrimary] = @IsPrimary,
        [BadgeNumber] = @BadgeNumber,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEventRegistrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEventRegistrations]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEventRegistration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventRegistration table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEventRegistration]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEventRegistration];
GO
CREATE TRIGGER [YourMembership].trgUpdateEventRegistration
ON [YourMembership].[EventRegistration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventRegistration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[EventRegistration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO
        

/* spUpdate Permissions for Event Registrations */

GRANT EXECUTE ON [YourMembership].[spUpdateEventRegistration] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Event Session Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Session Groups
-- Item: vwEventSessionGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Session Groups
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  EventSessionGroup
-----               PRIMARY KEY: SessionGroupId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEventSessionGroups]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEventSessionGroups];
GO

CREATE VIEW [YourMembership].[vwEventSessionGroups]
AS
SELECT
    e.*
FROM
    [YourMembership].[EventSessionGroup] AS e
GO
GRANT SELECT ON [YourMembership].[vwEventSessionGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Event Session Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Session Groups
-- Item: Permissions for vwEventSessionGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEventSessionGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Event Session Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Session Groups
-- Item: spCreateEventSessionGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventSessionGroup
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEventSessionGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEventSessionGroup];
GO

CREATE PROCEDURE [YourMembership].[spCreateEventSessionGroup]
    @SessionGroupId int = NULL,
    @EventId int,
    @Name nvarchar(200),
    @Description nvarchar(500),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[EventSessionGroup]
        (
            [SessionGroupId],
                [EventId],
                [Name],
                [Description],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @SessionGroupId,
                @EventId,
                @Name,
                @Description,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEventSessionGroups] WHERE [SessionGroupId] = @SessionGroupId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEventSessionGroup] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Event Session Groups */

GRANT EXECUTE ON [YourMembership].[spCreateEventSessionGroup] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Event Session Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Session Groups
-- Item: spUpdateEventSessionGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventSessionGroup
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEventSessionGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEventSessionGroup];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEventSessionGroup]
    @SessionGroupId int,
    @EventId int,
    @Name nvarchar(200),
    @Description nvarchar(500),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventSessionGroup]
    SET
        [EventId] = @EventId,
        [Name] = @Name,
        [Description] = @Description,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [SessionGroupId] = @SessionGroupId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEventSessionGroups] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEventSessionGroups]
                                    WHERE
                                        [SessionGroupId] = @SessionGroupId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEventSessionGroup] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventSessionGroup table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEventSessionGroup]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEventSessionGroup];
GO
CREATE TRIGGER [YourMembership].trgUpdateEventSessionGroup
ON [YourMembership].[EventSessionGroup]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventSessionGroup]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[EventSessionGroup] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[SessionGroupId] = I.[SessionGroupId];
END;
GO
        

/* spUpdate Permissions for Event Session Groups */

GRANT EXECUTE ON [YourMembership].[spUpdateEventSessionGroup] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Event CEU Awards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event CEU Awards
-- Item: spDeleteEventCEUAward
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventCEUAward
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEventCEUAward]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEventCEUAward];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEventCEUAward]
    @AwardID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[EventCEUAward]
    WHERE
        [AwardID] = @AwardID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [AwardID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @AwardID AS [AwardID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEventCEUAward] TO [cdp_Integration]
    

/* spDelete Permissions for Event CEU Awards */

GRANT EXECUTE ON [YourMembership].[spDeleteEventCEUAward] TO [cdp_Integration]



/* spDelete SQL for Event IDs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event IDs
-- Item: spDeleteEventID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEventID]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEventID];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEventID]
    @EventId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[EventID]
    WHERE
        [EventId] = @EventId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [EventId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @EventId AS [EventId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEventID] TO [cdp_Integration]
    

/* spDelete Permissions for Event IDs */

GRANT EXECUTE ON [YourMembership].[spDeleteEventID] TO [cdp_Integration]



/* spDelete SQL for Event Registration Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Forms
-- Item: spDeleteEventRegistrationForm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventRegistrationForm
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEventRegistrationForm]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEventRegistrationForm];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEventRegistrationForm]
    @FormId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[EventRegistrationForm]
    WHERE
        [FormId] = @FormId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [FormId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @FormId AS [FormId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEventRegistrationForm] TO [cdp_Integration]
    

/* spDelete Permissions for Event Registration Forms */

GRANT EXECUTE ON [YourMembership].[spDeleteEventRegistrationForm] TO [cdp_Integration]



/* spDelete SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: spDeleteEventRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventRegistration
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEventRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEventRegistration];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEventRegistration]
    @Id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[EventRegistration]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEventRegistration] TO [cdp_Integration]
    

/* spDelete Permissions for Event Registrations */

GRANT EXECUTE ON [YourMembership].[spDeleteEventRegistration] TO [cdp_Integration]



/* spDelete SQL for Event Session Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Session Groups
-- Item: spDeleteEventSessionGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventSessionGroup
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEventSessionGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEventSessionGroup];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEventSessionGroup]
    @SessionGroupId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[EventSessionGroup]
    WHERE
        [SessionGroupId] = @SessionGroupId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [SessionGroupId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @SessionGroupId AS [SessionGroupId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEventSessionGroup] TO [cdp_Integration]
    

/* spDelete Permissions for Event Session Groups */

GRANT EXECUTE ON [YourMembership].[spDeleteEventSessionGroup] TO [cdp_Integration]



/* Index for Foreign Keys for EventSession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EventId in table EventSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventSession_EventId' 
    AND object_id = OBJECT_ID('[YourMembership].[EventSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventSession_EventId ON [YourMembership].[EventSession] ([EventId]);

/* Index for Foreign Keys for EventTicket */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Tickets
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EventId in table EventTicket
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventTicket_EventId' 
    AND object_id = OBJECT_ID('[YourMembership].[EventTicket]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventTicket_EventId ON [YourMembership].[EventTicket] ([EventId]);

-- Index for foreign key Category in table EventTicket
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventTicket_Category' 
    AND object_id = OBJECT_ID('[YourMembership].[EventTicket]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventTicket_Category ON [YourMembership].[EventTicket] ([Category]);

/* Index for Foreign Keys for Event */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for FeedbackSubmission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Feedback Submissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for FinanceBatchDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batch Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key BatchID in table FinanceBatchDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FinanceBatchDetail_BatchID' 
    AND object_id = OBJECT_ID('[YourMembership].[FinanceBatchDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FinanceBatchDetail_BatchID ON [YourMembership].[FinanceBatchDetail] ([BatchID]);

/* Base View SQL for Event Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sessions
-- Item: vwEventSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Sessions
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  EventSession
-----               PRIMARY KEY: SessionId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEventSessions]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEventSessions];
GO

CREATE VIEW [YourMembership].[vwEventSessions]
AS
SELECT
    e.*
FROM
    [YourMembership].[EventSession] AS e
GO
GRANT SELECT ON [YourMembership].[vwEventSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Event Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sessions
-- Item: Permissions for vwEventSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEventSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Event Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sessions
-- Item: spCreateEventSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventSession
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEventSession]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEventSession];
GO

CREATE PROCEDURE [YourMembership].[spCreateEventSession]
    @SessionId int = NULL,
    @EventId int,
    @Name nvarchar(200),
    @Presenter nvarchar(200),
    @StartDate datetimeoffset,
    @StartTime nvarchar(200),
    @EndDate datetimeoffset,
    @EndTime nvarchar(200),
    @MaxRegistrants int,
    @Description nvarchar(500),
    @AllowCEUs bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[EventSession]
        (
            [SessionId],
                [EventId],
                [Name],
                [Presenter],
                [StartDate],
                [StartTime],
                [EndDate],
                [EndTime],
                [MaxRegistrants],
                [Description],
                [AllowCEUs],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @SessionId,
                @EventId,
                @Name,
                @Presenter,
                @StartDate,
                @StartTime,
                @EndDate,
                @EndTime,
                @MaxRegistrants,
                @Description,
                @AllowCEUs,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEventSessions] WHERE [SessionId] = @SessionId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEventSession] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Event Sessions */

GRANT EXECUTE ON [YourMembership].[spCreateEventSession] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Event Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sessions
-- Item: spUpdateEventSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventSession
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEventSession]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEventSession];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEventSession]
    @SessionId int,
    @EventId int,
    @Name nvarchar(200),
    @Presenter nvarchar(200),
    @StartDate datetimeoffset,
    @StartTime nvarchar(200),
    @EndDate datetimeoffset,
    @EndTime nvarchar(200),
    @MaxRegistrants int,
    @Description nvarchar(500),
    @AllowCEUs bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventSession]
    SET
        [EventId] = @EventId,
        [Name] = @Name,
        [Presenter] = @Presenter,
        [StartDate] = @StartDate,
        [StartTime] = @StartTime,
        [EndDate] = @EndDate,
        [EndTime] = @EndTime,
        [MaxRegistrants] = @MaxRegistrants,
        [Description] = @Description,
        [AllowCEUs] = @AllowCEUs,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [SessionId] = @SessionId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEventSessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEventSessions]
                                    WHERE
                                        [SessionId] = @SessionId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEventSession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventSession table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEventSession]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEventSession];
GO
CREATE TRIGGER [YourMembership].trgUpdateEventSession
ON [YourMembership].[EventSession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventSession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[EventSession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[SessionId] = I.[SessionId];
END;
GO
        

/* spUpdate Permissions for Event Sessions */

GRANT EXECUTE ON [YourMembership].[spUpdateEventSession] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Event Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Tickets
-- Item: vwEventTickets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Tickets
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  EventTicket
-----               PRIMARY KEY: TicketId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEventTickets]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEventTickets];
GO

CREATE VIEW [YourMembership].[vwEventTickets]
AS
SELECT
    e.*
FROM
    [YourMembership].[EventTicket] AS e
GO
GRANT SELECT ON [YourMembership].[vwEventTickets] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Event Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Tickets
-- Item: Permissions for vwEventTickets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEventTickets] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Event Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Tickets
-- Item: spCreateEventTicket
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventTicket
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEventTicket]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEventTicket];
GO

CREATE PROCEDURE [YourMembership].[spCreateEventTicket]
    @TicketId int = NULL,
    @EventId int,
    @Name nvarchar(200),
    @Quantity int,
    @UnitPrice decimal(18, 2),
    @Type nvarchar(200),
    @Description nvarchar(500),
    @Category nvarchar(200),
    @Active bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[EventTicket]
        (
            [TicketId],
                [EventId],
                [Name],
                [Quantity],
                [UnitPrice],
                [Type],
                [Description],
                [Category],
                [Active],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @TicketId,
                @EventId,
                @Name,
                @Quantity,
                @UnitPrice,
                @Type,
                @Description,
                @Category,
                @Active,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEventTickets] WHERE [TicketId] = @TicketId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEventTicket] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Event Tickets */

GRANT EXECUTE ON [YourMembership].[spCreateEventTicket] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Event Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Tickets
-- Item: spUpdateEventTicket
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventTicket
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEventTicket]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEventTicket];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEventTicket]
    @TicketId int,
    @EventId int,
    @Name nvarchar(200),
    @Quantity int,
    @UnitPrice decimal(18, 2),
    @Type nvarchar(200),
    @Description nvarchar(500),
    @Category nvarchar(200),
    @Active bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventTicket]
    SET
        [EventId] = @EventId,
        [Name] = @Name,
        [Quantity] = @Quantity,
        [UnitPrice] = @UnitPrice,
        [Type] = @Type,
        [Description] = @Description,
        [Category] = @Category,
        [Active] = @Active,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [TicketId] = @TicketId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEventTickets] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEventTickets]
                                    WHERE
                                        [TicketId] = @TicketId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEventTicket] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventTicket table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEventTicket]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEventTicket];
GO
CREATE TRIGGER [YourMembership].trgUpdateEventTicket
ON [YourMembership].[EventTicket]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[EventTicket]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[EventTicket] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[TicketId] = I.[TicketId];
END;
GO
        

/* spUpdate Permissions for Event Tickets */

GRANT EXECUTE ON [YourMembership].[spUpdateEventTicket] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: vwEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Events
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  Event
-----               PRIMARY KEY: EventId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwEvents]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwEvents];
GO

CREATE VIEW [YourMembership].[vwEvents]
AS
SELECT
    e.*
FROM
    [YourMembership].[Event] AS e
GO
GRANT SELECT ON [YourMembership].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Permissions for vwEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spCreateEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Event
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateEvent];
GO

CREATE PROCEDURE [YourMembership].[spCreateEvent]
    @EventId int = NULL,
    @Name nvarchar(200),
    @Active bit,
    @StartDate datetimeoffset,
    @EndDate datetimeoffset,
    @StartTime nvarchar(200),
    @EndTime nvarchar(200),
    @IsVirtual bit,
    @VirtualMeetingType nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[Event]
        (
            [EventId],
                [Name],
                [Active],
                [StartDate],
                [EndDate],
                [StartTime],
                [EndTime],
                [IsVirtual],
                [VirtualMeetingType],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @EventId,
                @Name,
                @Active,
                @StartDate,
                @EndDate,
                @StartTime,
                @EndTime,
                @IsVirtual,
                @VirtualMeetingType,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwEvents] WHERE [EventId] = @EventId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateEvent] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Events */

GRANT EXECUTE ON [YourMembership].[spCreateEvent] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spUpdateEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Event
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateEvent];
GO

CREATE PROCEDURE [YourMembership].[spUpdateEvent]
    @EventId int,
    @Name nvarchar(200),
    @Active bit,
    @StartDate datetimeoffset,
    @EndDate datetimeoffset,
    @StartTime nvarchar(200),
    @EndTime nvarchar(200),
    @IsVirtual bit,
    @VirtualMeetingType nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Event]
    SET
        [Name] = @Name,
        [Active] = @Active,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [StartTime] = @StartTime,
        [EndTime] = @EndTime,
        [IsVirtual] = @IsVirtual,
        [VirtualMeetingType] = @VirtualMeetingType,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [EventId] = @EventId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwEvents]
                                    WHERE
                                        [EventId] = @EventId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateEvent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Event table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateEvent]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateEvent];
GO
CREATE TRIGGER [YourMembership].trgUpdateEvent
ON [YourMembership].[Event]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Event]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[Event] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[EventId] = I.[EventId];
END;
GO
        

/* spUpdate Permissions for Events */

GRANT EXECUTE ON [YourMembership].[spUpdateEvent] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Feedback Submissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Feedback Submissions
-- Item: vwFeedbackSubmissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Feedback Submissions
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  FeedbackSubmission
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwFeedbackSubmissions]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwFeedbackSubmissions];
GO

CREATE VIEW [HubSpot].[vwFeedbackSubmissions]
AS
SELECT
    f.*
FROM
    [HubSpot].[FeedbackSubmission] AS f
GO
GRANT SELECT ON [HubSpot].[vwFeedbackSubmissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Feedback Submissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Feedback Submissions
-- Item: Permissions for vwFeedbackSubmissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwFeedbackSubmissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Feedback Submissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Feedback Submissions
-- Item: spCreateFeedbackSubmission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FeedbackSubmission
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateFeedbackSubmission]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateFeedbackSubmission];
GO

CREATE PROCEDURE [HubSpot].[spCreateFeedbackSubmission]
    @hs_object_id nvarchar(100) = NULL,
    @hs_survey_id nvarchar(100),
    @hs_survey_name nvarchar(500),
    @hs_survey_type nvarchar(500),
    @hs_submission_name nvarchar(500),
    @hs_content nvarchar(MAX),
    @hs_response_group nvarchar(500),
    @hs_sentiment nvarchar(500),
    @hs_survey_channel nvarchar(500),
    @hs_timestamp datetimeoffset,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[FeedbackSubmission]
        (
            [hs_object_id],
                [hs_survey_id],
                [hs_survey_name],
                [hs_survey_type],
                [hs_submission_name],
                [hs_content],
                [hs_response_group],
                [hs_sentiment],
                [hs_survey_channel],
                [hs_timestamp],
                [createdate],
                [hs_lastmodifieddate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @hs_survey_id,
                @hs_survey_name,
                @hs_survey_type,
                @hs_submission_name,
                @hs_content,
                @hs_response_group,
                @hs_sentiment,
                @hs_survey_channel,
                @hs_timestamp,
                @createdate,
                @hs_lastmodifieddate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwFeedbackSubmissions] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateFeedbackSubmission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Feedback Submissions */

GRANT EXECUTE ON [HubSpot].[spCreateFeedbackSubmission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Feedback Submissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Feedback Submissions
-- Item: spUpdateFeedbackSubmission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FeedbackSubmission
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateFeedbackSubmission]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateFeedbackSubmission];
GO

CREATE PROCEDURE [HubSpot].[spUpdateFeedbackSubmission]
    @hs_object_id nvarchar(100),
    @hs_survey_id nvarchar(100),
    @hs_survey_name nvarchar(500),
    @hs_survey_type nvarchar(500),
    @hs_submission_name nvarchar(500),
    @hs_content nvarchar(MAX),
    @hs_response_group nvarchar(500),
    @hs_sentiment nvarchar(500),
    @hs_survey_channel nvarchar(500),
    @hs_timestamp datetimeoffset,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[FeedbackSubmission]
    SET
        [hs_survey_id] = @hs_survey_id,
        [hs_survey_name] = @hs_survey_name,
        [hs_survey_type] = @hs_survey_type,
        [hs_submission_name] = @hs_submission_name,
        [hs_content] = @hs_content,
        [hs_response_group] = @hs_response_group,
        [hs_sentiment] = @hs_sentiment,
        [hs_survey_channel] = @hs_survey_channel,
        [hs_timestamp] = @hs_timestamp,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwFeedbackSubmissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwFeedbackSubmissions]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateFeedbackSubmission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FeedbackSubmission table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateFeedbackSubmission]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateFeedbackSubmission];
GO
CREATE TRIGGER [HubSpot].trgUpdateFeedbackSubmission
ON [HubSpot].[FeedbackSubmission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[FeedbackSubmission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[FeedbackSubmission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Feedback Submissions */

GRANT EXECUTE ON [HubSpot].[spUpdateFeedbackSubmission] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Finance Batch Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batch Details
-- Item: vwFinanceBatchDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Finance Batch Details
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  FinanceBatchDetail
-----               PRIMARY KEY: DetailID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwFinanceBatchDetails]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwFinanceBatchDetails];
GO

CREATE VIEW [YourMembership].[vwFinanceBatchDetails]
AS
SELECT
    f.*
FROM
    [YourMembership].[FinanceBatchDetail] AS f
GO
GRANT SELECT ON [YourMembership].[vwFinanceBatchDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Finance Batch Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batch Details
-- Item: Permissions for vwFinanceBatchDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwFinanceBatchDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Finance Batch Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batch Details
-- Item: spCreateFinanceBatchDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FinanceBatchDetail
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateFinanceBatchDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateFinanceBatchDetail];
GO

CREATE PROCEDURE [YourMembership].[spCreateFinanceBatchDetail]
    @DetailID int = NULL,
    @BatchID int,
    @InvoiceNumber int,
    @Amount decimal(18, 2),
    @PaymentType nvarchar(200),
    @TransactionDate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[FinanceBatchDetail]
        (
            [DetailID],
                [BatchID],
                [InvoiceNumber],
                [Amount],
                [PaymentType],
                [TransactionDate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @DetailID,
                @BatchID,
                @InvoiceNumber,
                @Amount,
                @PaymentType,
                @TransactionDate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwFinanceBatchDetails] WHERE [DetailID] = @DetailID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateFinanceBatchDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Finance Batch Details */

GRANT EXECUTE ON [YourMembership].[spCreateFinanceBatchDetail] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Finance Batch Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batch Details
-- Item: spUpdateFinanceBatchDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FinanceBatchDetail
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateFinanceBatchDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateFinanceBatchDetail];
GO

CREATE PROCEDURE [YourMembership].[spUpdateFinanceBatchDetail]
    @DetailID int,
    @BatchID int,
    @InvoiceNumber int,
    @Amount decimal(18, 2),
    @PaymentType nvarchar(200),
    @TransactionDate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[FinanceBatchDetail]
    SET
        [BatchID] = @BatchID,
        [InvoiceNumber] = @InvoiceNumber,
        [Amount] = @Amount,
        [PaymentType] = @PaymentType,
        [TransactionDate] = @TransactionDate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [DetailID] = @DetailID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwFinanceBatchDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwFinanceBatchDetails]
                                    WHERE
                                        [DetailID] = @DetailID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateFinanceBatchDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FinanceBatchDetail table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateFinanceBatchDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateFinanceBatchDetail];
GO
CREATE TRIGGER [YourMembership].trgUpdateFinanceBatchDetail
ON [YourMembership].[FinanceBatchDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[FinanceBatchDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[FinanceBatchDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[DetailID] = I.[DetailID];
END;
GO
        

/* spUpdate Permissions for Finance Batch Details */

GRANT EXECUTE ON [YourMembership].[spUpdateFinanceBatchDetail] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Event Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sessions
-- Item: spDeleteEventSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventSession
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEventSession]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEventSession];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEventSession]
    @SessionId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[EventSession]
    WHERE
        [SessionId] = @SessionId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [SessionId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @SessionId AS [SessionId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEventSession] TO [cdp_Integration]
    

/* spDelete Permissions for Event Sessions */

GRANT EXECUTE ON [YourMembership].[spDeleteEventSession] TO [cdp_Integration]



/* spDelete SQL for Event Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Tickets
-- Item: spDeleteEventTicket
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventTicket
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEventTicket]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEventTicket];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEventTicket]
    @TicketId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[EventTicket]
    WHERE
        [TicketId] = @TicketId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [TicketId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @TicketId AS [TicketId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEventTicket] TO [cdp_Integration]
    

/* spDelete Permissions for Event Tickets */

GRANT EXECUTE ON [YourMembership].[spDeleteEventTicket] TO [cdp_Integration]



/* spDelete SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spDeleteEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Event
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteEvent];
GO

CREATE PROCEDURE [YourMembership].[spDeleteEvent]
    @EventId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[Event]
    WHERE
        [EventId] = @EventId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [EventId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @EventId AS [EventId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteEvent] TO [cdp_Integration]
    

/* spDelete Permissions for Events */

GRANT EXECUTE ON [YourMembership].[spDeleteEvent] TO [cdp_Integration]



/* spDelete SQL for Feedback Submissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Feedback Submissions
-- Item: spDeleteFeedbackSubmission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FeedbackSubmission
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteFeedbackSubmission]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteFeedbackSubmission];
GO

CREATE PROCEDURE [HubSpot].[spDeleteFeedbackSubmission]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[FeedbackSubmission]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteFeedbackSubmission] TO [cdp_Integration]
    

/* spDelete Permissions for Feedback Submissions */

GRANT EXECUTE ON [HubSpot].[spDeleteFeedbackSubmission] TO [cdp_Integration]



/* spDelete SQL for Finance Batch Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batch Details
-- Item: spDeleteFinanceBatchDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FinanceBatchDetail
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteFinanceBatchDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteFinanceBatchDetail];
GO

CREATE PROCEDURE [YourMembership].[spDeleteFinanceBatchDetail]
    @DetailID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[FinanceBatchDetail]
    WHERE
        [DetailID] = @DetailID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [DetailID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @DetailID AS [DetailID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteFinanceBatchDetail] TO [cdp_Integration]
    

/* spDelete Permissions for Finance Batch Details */

GRANT EXECUTE ON [YourMembership].[spDeleteFinanceBatchDetail] TO [cdp_Integration]



/* Index for Foreign Keys for FinanceBatch */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for GLCode */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: GL Codes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for GroupMembershipLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Membership Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProfileID in table GroupMembershipLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GroupMembershipLog_ProfileID' 
    AND object_id = OBJECT_ID('[YourMembership].[GroupMembershipLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GroupMembershipLog_ProfileID ON [YourMembership].[GroupMembershipLog] ([ProfileID]);

/* Index for Foreign Keys for GroupType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Group */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key GroupTypeId in table Group
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Group_GroupTypeId' 
    AND object_id = OBJECT_ID('[YourMembership].[Group]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Group_GroupTypeId ON [YourMembership].[Group] ([GroupTypeId]);

/* Base View SQL for Finance Batches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batches
-- Item: vwFinanceBatches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Finance Batches
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  FinanceBatch
-----               PRIMARY KEY: BatchID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwFinanceBatches]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwFinanceBatches];
GO

CREATE VIEW [YourMembership].[vwFinanceBatches]
AS
SELECT
    f.*
FROM
    [YourMembership].[FinanceBatch] AS f
GO
GRANT SELECT ON [YourMembership].[vwFinanceBatches] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Finance Batches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batches
-- Item: Permissions for vwFinanceBatches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwFinanceBatches] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Finance Batches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batches
-- Item: spCreateFinanceBatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FinanceBatch
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateFinanceBatch]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateFinanceBatch];
GO

CREATE PROCEDURE [YourMembership].[spCreateFinanceBatch]
    @BatchID int = NULL,
    @CommerceType nvarchar(200),
    @ItemCount int,
    @ClosedDate datetimeoffset,
    @CreateDateTime datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[FinanceBatch]
        (
            [BatchID],
                [CommerceType],
                [ItemCount],
                [ClosedDate],
                [CreateDateTime],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @BatchID,
                @CommerceType,
                @ItemCount,
                @ClosedDate,
                @CreateDateTime,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwFinanceBatches] WHERE [BatchID] = @BatchID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateFinanceBatch] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Finance Batches */

GRANT EXECUTE ON [YourMembership].[spCreateFinanceBatch] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Finance Batches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batches
-- Item: spUpdateFinanceBatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FinanceBatch
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateFinanceBatch]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateFinanceBatch];
GO

CREATE PROCEDURE [YourMembership].[spUpdateFinanceBatch]
    @BatchID int,
    @CommerceType nvarchar(200),
    @ItemCount int,
    @ClosedDate datetimeoffset,
    @CreateDateTime datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[FinanceBatch]
    SET
        [CommerceType] = @CommerceType,
        [ItemCount] = @ItemCount,
        [ClosedDate] = @ClosedDate,
        [CreateDateTime] = @CreateDateTime,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [BatchID] = @BatchID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwFinanceBatches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwFinanceBatches]
                                    WHERE
                                        [BatchID] = @BatchID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateFinanceBatch] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FinanceBatch table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateFinanceBatch]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateFinanceBatch];
GO
CREATE TRIGGER [YourMembership].trgUpdateFinanceBatch
ON [YourMembership].[FinanceBatch]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[FinanceBatch]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[FinanceBatch] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[BatchID] = I.[BatchID];
END;
GO
        

/* spUpdate Permissions for Finance Batches */

GRANT EXECUTE ON [YourMembership].[spUpdateFinanceBatch] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for GL Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: GL Codes
-- Item: vwGLCodes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      GL Codes
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  GLCode
-----               PRIMARY KEY: GLCodeId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwGLCodes]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwGLCodes];
GO

CREATE VIEW [YourMembership].[vwGLCodes]
AS
SELECT
    g.*
FROM
    [YourMembership].[GLCode] AS g
GO
GRANT SELECT ON [YourMembership].[vwGLCodes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for GL Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: GL Codes
-- Item: Permissions for vwGLCodes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwGLCodes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for GL Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: GL Codes
-- Item: spCreateGLCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GLCode
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateGLCode]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateGLCode];
GO

CREATE PROCEDURE [YourMembership].[spCreateGLCode]
    @GLCodeId int = NULL,
    @GLCodeName nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[GLCode]
        (
            [GLCodeId],
                [GLCodeName],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @GLCodeId,
                @GLCodeName,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwGLCodes] WHERE [GLCodeId] = @GLCodeId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateGLCode] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for GL Codes */

GRANT EXECUTE ON [YourMembership].[spCreateGLCode] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for GL Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: GL Codes
-- Item: spUpdateGLCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GLCode
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateGLCode]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateGLCode];
GO

CREATE PROCEDURE [YourMembership].[spUpdateGLCode]
    @GLCodeId int,
    @GLCodeName nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[GLCode]
    SET
        [GLCodeName] = @GLCodeName,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [GLCodeId] = @GLCodeId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwGLCodes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwGLCodes]
                                    WHERE
                                        [GLCodeId] = @GLCodeId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateGLCode] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GLCode table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateGLCode]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateGLCode];
GO
CREATE TRIGGER [YourMembership].trgUpdateGLCode
ON [YourMembership].[GLCode]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[GLCode]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[GLCode] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[GLCodeId] = I.[GLCodeId];
END;
GO
        

/* spUpdate Permissions for GL Codes */

GRANT EXECUTE ON [YourMembership].[spUpdateGLCode] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Group Membership Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Membership Logs
-- Item: vwGroupMembershipLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Group Membership Logs
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  GroupMembershipLog
-----               PRIMARY KEY: ItemID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwGroupMembershipLogs]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwGroupMembershipLogs];
GO

CREATE VIEW [YourMembership].[vwGroupMembershipLogs]
AS
SELECT
    g.*
FROM
    [YourMembership].[GroupMembershipLog] AS g
GO
GRANT SELECT ON [YourMembership].[vwGroupMembershipLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Group Membership Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Membership Logs
-- Item: Permissions for vwGroupMembershipLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwGroupMembershipLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Group Membership Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Membership Logs
-- Item: spCreateGroupMembershipLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GroupMembershipLog
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateGroupMembershipLog]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateGroupMembershipLog];
GO

CREATE PROCEDURE [YourMembership].[spCreateGroupMembershipLog]
    @ItemID int = NULL,
    @ID nvarchar(200),
    @ProfileID int,
    @NamePrefix nvarchar(200),
    @FirstName nvarchar(200),
    @MiddleName nvarchar(200),
    @LastName nvarchar(200),
    @Suffix nvarchar(200),
    @Nickname nvarchar(200),
    @EmployerName nvarchar(200),
    @WorkTitle nvarchar(200),
    @Date datetimeoffset,
    @Description nvarchar(500),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[GroupMembershipLog]
        (
            [ItemID],
                [ID],
                [ProfileID],
                [NamePrefix],
                [FirstName],
                [MiddleName],
                [LastName],
                [Suffix],
                [Nickname],
                [EmployerName],
                [WorkTitle],
                [Date],
                [Description],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ItemID,
                @ID,
                @ProfileID,
                @NamePrefix,
                @FirstName,
                @MiddleName,
                @LastName,
                @Suffix,
                @Nickname,
                @EmployerName,
                @WorkTitle,
                @Date,
                @Description,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwGroupMembershipLogs] WHERE [ItemID] = @ItemID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateGroupMembershipLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Group Membership Logs */

GRANT EXECUTE ON [YourMembership].[spCreateGroupMembershipLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Group Membership Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Membership Logs
-- Item: spUpdateGroupMembershipLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GroupMembershipLog
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateGroupMembershipLog]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateGroupMembershipLog];
GO

CREATE PROCEDURE [YourMembership].[spUpdateGroupMembershipLog]
    @ItemID int,
    @ID nvarchar(200),
    @ProfileID int,
    @NamePrefix nvarchar(200),
    @FirstName nvarchar(200),
    @MiddleName nvarchar(200),
    @LastName nvarchar(200),
    @Suffix nvarchar(200),
    @Nickname nvarchar(200),
    @EmployerName nvarchar(200),
    @WorkTitle nvarchar(200),
    @Date datetimeoffset,
    @Description nvarchar(500),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[GroupMembershipLog]
    SET
        [ID] = @ID,
        [ProfileID] = @ProfileID,
        [NamePrefix] = @NamePrefix,
        [FirstName] = @FirstName,
        [MiddleName] = @MiddleName,
        [LastName] = @LastName,
        [Suffix] = @Suffix,
        [Nickname] = @Nickname,
        [EmployerName] = @EmployerName,
        [WorkTitle] = @WorkTitle,
        [Date] = @Date,
        [Description] = @Description,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ItemID] = @ItemID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwGroupMembershipLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwGroupMembershipLogs]
                                    WHERE
                                        [ItemID] = @ItemID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateGroupMembershipLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GroupMembershipLog table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateGroupMembershipLog]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateGroupMembershipLog];
GO
CREATE TRIGGER [YourMembership].trgUpdateGroupMembershipLog
ON [YourMembership].[GroupMembershipLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[GroupMembershipLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[GroupMembershipLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ItemID] = I.[ItemID];
END;
GO
        

/* spUpdate Permissions for Group Membership Logs */

GRANT EXECUTE ON [YourMembership].[spUpdateGroupMembershipLog] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Group Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Types
-- Item: vwGroupTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Group Types
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  GroupType
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwGroupTypes]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwGroupTypes];
GO

CREATE VIEW [YourMembership].[vwGroupTypes]
AS
SELECT
    g.*
FROM
    [YourMembership].[GroupType] AS g
GO
GRANT SELECT ON [YourMembership].[vwGroupTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Group Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Types
-- Item: Permissions for vwGroupTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwGroupTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Group Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Types
-- Item: spCreateGroupType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GroupType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateGroupType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateGroupType];
GO

CREATE PROCEDURE [YourMembership].[spCreateGroupType]
    @Id int = NULL,
    @TypeName nvarchar(200),
    @SortIndex int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[GroupType]
        (
            [Id],
                [TypeName],
                [SortIndex],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @Id,
                @TypeName,
                @SortIndex,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwGroupTypes] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateGroupType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Group Types */

GRANT EXECUTE ON [YourMembership].[spCreateGroupType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Group Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Types
-- Item: spUpdateGroupType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GroupType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateGroupType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateGroupType];
GO

CREATE PROCEDURE [YourMembership].[spUpdateGroupType]
    @Id int,
    @TypeName nvarchar(200),
    @SortIndex int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[GroupType]
    SET
        [TypeName] = @TypeName,
        [SortIndex] = @SortIndex,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwGroupTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwGroupTypes]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateGroupType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GroupType table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateGroupType]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateGroupType];
GO
CREATE TRIGGER [YourMembership].trgUpdateGroupType
ON [YourMembership].[GroupType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[GroupType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[GroupType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO
        

/* spUpdate Permissions for Group Types */

GRANT EXECUTE ON [YourMembership].[spUpdateGroupType] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: vwGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Groups
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  Group
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwGroups]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwGroups];
GO

CREATE VIEW [YourMembership].[vwGroups]
AS
SELECT
    g.*
FROM
    [YourMembership].[Group] AS g
GO
GRANT SELECT ON [YourMembership].[vwGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: Permissions for vwGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: spCreateGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Group
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateGroup];
GO

CREATE PROCEDURE [YourMembership].[spCreateGroup]
    @Id int = NULL,
    @Name nvarchar(200),
    @GroupTypeName nvarchar(200),
    @GroupTypeId int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[Group]
        (
            [Id],
                [Name],
                [GroupTypeName],
                [GroupTypeId],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @Id,
                @Name,
                @GroupTypeName,
                @GroupTypeId,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwGroups] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateGroup] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Groups */

GRANT EXECUTE ON [YourMembership].[spCreateGroup] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: spUpdateGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Group
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateGroup];
GO

CREATE PROCEDURE [YourMembership].[spUpdateGroup]
    @Id int,
    @Name nvarchar(200),
    @GroupTypeName nvarchar(200),
    @GroupTypeId int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Group]
    SET
        [Name] = @Name,
        [GroupTypeName] = @GroupTypeName,
        [GroupTypeId] = @GroupTypeId,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwGroups] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwGroups]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateGroup] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Group table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateGroup]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateGroup];
GO
CREATE TRIGGER [YourMembership].trgUpdateGroup
ON [YourMembership].[Group]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Group]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[Group] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO
        

/* spUpdate Permissions for Groups */

GRANT EXECUTE ON [YourMembership].[spUpdateGroup] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Finance Batches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Finance Batches
-- Item: spDeleteFinanceBatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FinanceBatch
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteFinanceBatch]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteFinanceBatch];
GO

CREATE PROCEDURE [YourMembership].[spDeleteFinanceBatch]
    @BatchID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[FinanceBatch]
    WHERE
        [BatchID] = @BatchID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [BatchID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @BatchID AS [BatchID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteFinanceBatch] TO [cdp_Integration]
    

/* spDelete Permissions for Finance Batches */

GRANT EXECUTE ON [YourMembership].[spDeleteFinanceBatch] TO [cdp_Integration]



/* spDelete SQL for GL Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: GL Codes
-- Item: spDeleteGLCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GLCode
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteGLCode]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteGLCode];
GO

CREATE PROCEDURE [YourMembership].[spDeleteGLCode]
    @GLCodeId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[GLCode]
    WHERE
        [GLCodeId] = @GLCodeId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [GLCodeId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @GLCodeId AS [GLCodeId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteGLCode] TO [cdp_Integration]
    

/* spDelete Permissions for GL Codes */

GRANT EXECUTE ON [YourMembership].[spDeleteGLCode] TO [cdp_Integration]



/* spDelete SQL for Group Membership Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Membership Logs
-- Item: spDeleteGroupMembershipLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GroupMembershipLog
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteGroupMembershipLog]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteGroupMembershipLog];
GO

CREATE PROCEDURE [YourMembership].[spDeleteGroupMembershipLog]
    @ItemID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[GroupMembershipLog]
    WHERE
        [ItemID] = @ItemID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ItemID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ItemID AS [ItemID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteGroupMembershipLog] TO [cdp_Integration]
    

/* spDelete Permissions for Group Membership Logs */

GRANT EXECUTE ON [YourMembership].[spDeleteGroupMembershipLog] TO [cdp_Integration]



/* spDelete SQL for Group Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Types
-- Item: spDeleteGroupType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GroupType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteGroupType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteGroupType];
GO

CREATE PROCEDURE [YourMembership].[spDeleteGroupType]
    @Id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[GroupType]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteGroupType] TO [cdp_Integration]
    

/* spDelete Permissions for Group Types */

GRANT EXECUTE ON [YourMembership].[spDeleteGroupType] TO [cdp_Integration]



/* spDelete SQL for Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: spDeleteGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Group
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteGroup];
GO

CREATE PROCEDURE [YourMembership].[spDeleteGroup]
    @Id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[Group]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteGroup] TO [cdp_Integration]
    

/* spDelete Permissions for Groups */

GRANT EXECUTE ON [YourMembership].[spDeleteGroup] TO [cdp_Integration]



/* Index for Foreign Keys for InvoiceItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InvoiceNo in table InvoiceItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InvoiceItem_InvoiceNo' 
    AND object_id = OBJECT_ID('[YourMembership].[InvoiceItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InvoiceItem_InvoiceNo ON [YourMembership].[InvoiceItem] ([InvoiceNo]);

-- Index for foreign key WebSiteMemberID in table InvoiceItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InvoiceItem_WebSiteMemberID' 
    AND object_id = OBJECT_ID('[YourMembership].[InvoiceItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InvoiceItem_WebSiteMemberID ON [YourMembership].[InvoiceItem] ([WebSiteMemberID]);

-- Index for foreign key GLCodeItemName in table InvoiceItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InvoiceItem_GLCodeItemName' 
    AND object_id = OBJECT_ID('[YourMembership].[InvoiceItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InvoiceItem_GLCodeItemName ON [YourMembership].[InvoiceItem] ([GLCodeItemName]);

-- Index for foreign key QBClassItemName in table InvoiceItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InvoiceItem_QBClassItemName' 
    AND object_id = OBJECT_ID('[YourMembership].[InvoiceItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InvoiceItem_QBClassItemName ON [YourMembership].[InvoiceItem] ([QBClassItemName]);

/* Index for Foreign Keys for LineItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Line Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key hs_product_id in table LineItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_LineItem_hs_product_id' 
    AND object_id = OBJECT_ID('[HubSpot].[LineItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_LineItem_hs_product_id ON [HubSpot].[LineItem] ([hs_product_id]);

/* Index for Foreign Keys for Location */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key countryId in table Location
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Location_countryId' 
    AND object_id = OBJECT_ID('[YourMembership].[Location]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Location_countryId ON [YourMembership].[Location] ([countryId]);

/* Index for Foreign Keys for Meeting */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for MemberFavorite */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Favorites
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProfileID in table MemberFavorite
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberFavorite_ProfileID' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberFavorite]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberFavorite_ProfileID ON [YourMembership].[MemberFavorite] ([ProfileID]);

/* Base View SQL for Invoice Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Items
-- Item: vwInvoiceItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Invoice Items
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  InvoiceItem
-----               PRIMARY KEY: LineItemID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwInvoiceItems]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwInvoiceItems];
GO

CREATE VIEW [YourMembership].[vwInvoiceItems]
AS
SELECT
    i.*
FROM
    [YourMembership].[InvoiceItem] AS i
GO
GRANT SELECT ON [YourMembership].[vwInvoiceItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Invoice Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Items
-- Item: Permissions for vwInvoiceItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwInvoiceItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Invoice Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Items
-- Item: spCreateInvoiceItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR InvoiceItem
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateInvoiceItem]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateInvoiceItem];
GO

CREATE PROCEDURE [YourMembership].[spCreateInvoiceItem]
    @LineItemID int = NULL,
    @InvoiceNo int,
    @InvoiceType nvarchar(200),
    @WebSiteMemberID int,
    @ConstituentID nvarchar(200),
    @InvoiceNameFirst nvarchar(200),
    @InvoiceNameLast nvarchar(200),
    @Organization nvarchar(200),
    @EmailAddress nvarchar(200),
    @LineItemType nvarchar(200),
    @LineItemDescription nvarchar(200),
    @LineItemDate datetimeoffset,
    @LineItemDateEntered datetimeoffset,
    @LineItemAmount decimal(18, 2),
    @LineItemQuantity int,
    @LineTotal decimal(18, 2),
    @OutstandingBalance decimal(18, 2),
    @PaymentTerms nvarchar(200),
    @GLCodeItemName nvarchar(200),
    @QBClassItemName nvarchar(200),
    @PaymentOption nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[InvoiceItem]
        (
            [LineItemID],
                [InvoiceNo],
                [InvoiceType],
                [WebSiteMemberID],
                [ConstituentID],
                [InvoiceNameFirst],
                [InvoiceNameLast],
                [Organization],
                [EmailAddress],
                [LineItemType],
                [LineItemDescription],
                [LineItemDate],
                [LineItemDateEntered],
                [LineItemAmount],
                [LineItemQuantity],
                [LineTotal],
                [OutstandingBalance],
                [PaymentTerms],
                [GLCodeItemName],
                [QBClassItemName],
                [PaymentOption],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @LineItemID,
                @InvoiceNo,
                @InvoiceType,
                @WebSiteMemberID,
                @ConstituentID,
                @InvoiceNameFirst,
                @InvoiceNameLast,
                @Organization,
                @EmailAddress,
                @LineItemType,
                @LineItemDescription,
                @LineItemDate,
                @LineItemDateEntered,
                @LineItemAmount,
                @LineItemQuantity,
                @LineTotal,
                @OutstandingBalance,
                @PaymentTerms,
                @GLCodeItemName,
                @QBClassItemName,
                @PaymentOption,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwInvoiceItems] WHERE [LineItemID] = @LineItemID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateInvoiceItem] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Invoice Items */

GRANT EXECUTE ON [YourMembership].[spCreateInvoiceItem] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Invoice Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Items
-- Item: spUpdateInvoiceItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR InvoiceItem
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateInvoiceItem]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateInvoiceItem];
GO

CREATE PROCEDURE [YourMembership].[spUpdateInvoiceItem]
    @LineItemID int,
    @InvoiceNo int,
    @InvoiceType nvarchar(200),
    @WebSiteMemberID int,
    @ConstituentID nvarchar(200),
    @InvoiceNameFirst nvarchar(200),
    @InvoiceNameLast nvarchar(200),
    @Organization nvarchar(200),
    @EmailAddress nvarchar(200),
    @LineItemType nvarchar(200),
    @LineItemDescription nvarchar(200),
    @LineItemDate datetimeoffset,
    @LineItemDateEntered datetimeoffset,
    @LineItemAmount decimal(18, 2),
    @LineItemQuantity int,
    @LineTotal decimal(18, 2),
    @OutstandingBalance decimal(18, 2),
    @PaymentTerms nvarchar(200),
    @GLCodeItemName nvarchar(200),
    @QBClassItemName nvarchar(200),
    @PaymentOption nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[InvoiceItem]
    SET
        [InvoiceNo] = @InvoiceNo,
        [InvoiceType] = @InvoiceType,
        [WebSiteMemberID] = @WebSiteMemberID,
        [ConstituentID] = @ConstituentID,
        [InvoiceNameFirst] = @InvoiceNameFirst,
        [InvoiceNameLast] = @InvoiceNameLast,
        [Organization] = @Organization,
        [EmailAddress] = @EmailAddress,
        [LineItemType] = @LineItemType,
        [LineItemDescription] = @LineItemDescription,
        [LineItemDate] = @LineItemDate,
        [LineItemDateEntered] = @LineItemDateEntered,
        [LineItemAmount] = @LineItemAmount,
        [LineItemQuantity] = @LineItemQuantity,
        [LineTotal] = @LineTotal,
        [OutstandingBalance] = @OutstandingBalance,
        [PaymentTerms] = @PaymentTerms,
        [GLCodeItemName] = @GLCodeItemName,
        [QBClassItemName] = @QBClassItemName,
        [PaymentOption] = @PaymentOption,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [LineItemID] = @LineItemID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwInvoiceItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwInvoiceItems]
                                    WHERE
                                        [LineItemID] = @LineItemID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateInvoiceItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the InvoiceItem table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateInvoiceItem]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateInvoiceItem];
GO
CREATE TRIGGER [YourMembership].trgUpdateInvoiceItem
ON [YourMembership].[InvoiceItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[InvoiceItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[InvoiceItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[LineItemID] = I.[LineItemID];
END;
GO
        

/* spUpdate Permissions for Invoice Items */

GRANT EXECUTE ON [YourMembership].[spUpdateInvoiceItem] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Line Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Line Items
-- Item: vwLineItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Line Items
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  LineItem
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwLineItems]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwLineItems];
GO

CREATE VIEW [HubSpot].[vwLineItems]
AS
SELECT
    l.*
FROM
    [HubSpot].[LineItem] AS l
GO
GRANT SELECT ON [HubSpot].[vwLineItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Line Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Line Items
-- Item: Permissions for vwLineItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwLineItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Line Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Line Items
-- Item: spCreateLineItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR LineItem
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateLineItem]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateLineItem];
GO

CREATE PROCEDURE [HubSpot].[spCreateLineItem]
    @hs_object_id nvarchar(100) = NULL,
    @name nvarchar(500),
    @description nvarchar(MAX),
    @quantity decimal(18, 2),
    @price decimal(18, 2),
    @amount decimal(18, 2),
    @discount decimal(18, 2),
    @tax decimal(18, 2),
    @hs_product_id nvarchar(100),
    @hs_line_item_currency_code nvarchar(500),
    @hs_sku nvarchar(500),
    @hs_cost_of_goods_sold decimal(18, 2),
    @hs_recurring_billing_period nvarchar(500),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[LineItem]
        (
            [hs_object_id],
                [name],
                [description],
                [quantity],
                [price],
                [amount],
                [discount],
                [tax],
                [hs_product_id],
                [hs_line_item_currency_code],
                [hs_sku],
                [hs_cost_of_goods_sold],
                [hs_recurring_billing_period],
                [createdate],
                [hs_lastmodifieddate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @name,
                @description,
                @quantity,
                @price,
                @amount,
                @discount,
                @tax,
                @hs_product_id,
                @hs_line_item_currency_code,
                @hs_sku,
                @hs_cost_of_goods_sold,
                @hs_recurring_billing_period,
                @createdate,
                @hs_lastmodifieddate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwLineItems] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateLineItem] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Line Items */

GRANT EXECUTE ON [HubSpot].[spCreateLineItem] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Line Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Line Items
-- Item: spUpdateLineItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR LineItem
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateLineItem]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateLineItem];
GO

CREATE PROCEDURE [HubSpot].[spUpdateLineItem]
    @hs_object_id nvarchar(100),
    @name nvarchar(500),
    @description nvarchar(MAX),
    @quantity decimal(18, 2),
    @price decimal(18, 2),
    @amount decimal(18, 2),
    @discount decimal(18, 2),
    @tax decimal(18, 2),
    @hs_product_id nvarchar(100),
    @hs_line_item_currency_code nvarchar(500),
    @hs_sku nvarchar(500),
    @hs_cost_of_goods_sold decimal(18, 2),
    @hs_recurring_billing_period nvarchar(500),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[LineItem]
    SET
        [name] = @name,
        [description] = @description,
        [quantity] = @quantity,
        [price] = @price,
        [amount] = @amount,
        [discount] = @discount,
        [tax] = @tax,
        [hs_product_id] = @hs_product_id,
        [hs_line_item_currency_code] = @hs_line_item_currency_code,
        [hs_sku] = @hs_sku,
        [hs_cost_of_goods_sold] = @hs_cost_of_goods_sold,
        [hs_recurring_billing_period] = @hs_recurring_billing_period,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwLineItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwLineItems]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateLineItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the LineItem table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateLineItem]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateLineItem];
GO
CREATE TRIGGER [HubSpot].trgUpdateLineItem
ON [HubSpot].[LineItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[LineItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[LineItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Line Items */

GRANT EXECUTE ON [HubSpot].[spUpdateLineItem] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: vwLocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Locations
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  Location
-----               PRIMARY KEY: locationCode
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwLocations]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwLocations];
GO

CREATE VIEW [YourMembership].[vwLocations]
AS
SELECT
    l.*
FROM
    [YourMembership].[Location] AS l
GO
GRANT SELECT ON [YourMembership].[vwLocations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: Permissions for vwLocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwLocations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: spCreateLocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Location
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateLocation]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateLocation];
GO

CREATE PROCEDURE [YourMembership].[spCreateLocation]
    @locationCode nvarchar(200) = NULL,
    @countryId nvarchar(200),
    @locationName nvarchar(200),
    @taxGLCode nvarchar(200),
    @taxQBClass nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[Location]
        (
            [locationCode],
                [countryId],
                [locationName],
                [taxGLCode],
                [taxQBClass],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @locationCode,
                @countryId,
                @locationName,
                @taxGLCode,
                @taxQBClass,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwLocations] WHERE [locationCode] = @locationCode
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateLocation] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Locations */

GRANT EXECUTE ON [YourMembership].[spCreateLocation] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: spUpdateLocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Location
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateLocation]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateLocation];
GO

CREATE PROCEDURE [YourMembership].[spUpdateLocation]
    @locationCode nvarchar(200),
    @countryId nvarchar(200),
    @locationName nvarchar(200),
    @taxGLCode nvarchar(200),
    @taxQBClass nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Location]
    SET
        [countryId] = @countryId,
        [locationName] = @locationName,
        [taxGLCode] = @taxGLCode,
        [taxQBClass] = @taxQBClass,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [locationCode] = @locationCode

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwLocations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwLocations]
                                    WHERE
                                        [locationCode] = @locationCode
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateLocation] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Location table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateLocation]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateLocation];
GO
CREATE TRIGGER [YourMembership].trgUpdateLocation
ON [YourMembership].[Location]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Location]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[Location] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[locationCode] = I.[locationCode];
END;
GO
        

/* spUpdate Permissions for Locations */

GRANT EXECUTE ON [YourMembership].[spUpdateLocation] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: vwMeetings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Meetings
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  Meeting
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwMeetings]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwMeetings];
GO

CREATE VIEW [HubSpot].[vwMeetings]
AS
SELECT
    m.*
FROM
    [HubSpot].[Meeting] AS m
GO
GRANT SELECT ON [HubSpot].[vwMeetings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: Permissions for vwMeetings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwMeetings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: spCreateMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateMeeting];
GO

CREATE PROCEDURE [HubSpot].[spCreateMeeting]
    @hs_object_id nvarchar(100) = NULL,
    @hs_meeting_title nvarchar(500),
    @hs_meeting_body nvarchar(MAX),
    @hs_meeting_start_time datetimeoffset,
    @hs_meeting_end_time datetimeoffset,
    @hs_meeting_outcome nvarchar(500),
    @hs_meeting_location nvarchar(500),
    @hs_meeting_external_url nvarchar(1000),
    @hs_internal_meeting_notes nvarchar(MAX),
    @hs_activity_type nvarchar(500),
    @hubspot_owner_id nvarchar(100),
    @hs_timestamp datetimeoffset,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[Meeting]
        (
            [hs_object_id],
                [hs_meeting_title],
                [hs_meeting_body],
                [hs_meeting_start_time],
                [hs_meeting_end_time],
                [hs_meeting_outcome],
                [hs_meeting_location],
                [hs_meeting_external_url],
                [hs_internal_meeting_notes],
                [hs_activity_type],
                [hubspot_owner_id],
                [hs_timestamp],
                [createdate],
                [hs_lastmodifieddate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @hs_meeting_title,
                @hs_meeting_body,
                @hs_meeting_start_time,
                @hs_meeting_end_time,
                @hs_meeting_outcome,
                @hs_meeting_location,
                @hs_meeting_external_url,
                @hs_internal_meeting_notes,
                @hs_activity_type,
                @hubspot_owner_id,
                @hs_timestamp,
                @createdate,
                @hs_lastmodifieddate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwMeetings] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateMeeting] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Meetings */

GRANT EXECUTE ON [HubSpot].[spCreateMeeting] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: spUpdateMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateMeeting];
GO

CREATE PROCEDURE [HubSpot].[spUpdateMeeting]
    @hs_object_id nvarchar(100),
    @hs_meeting_title nvarchar(500),
    @hs_meeting_body nvarchar(MAX),
    @hs_meeting_start_time datetimeoffset,
    @hs_meeting_end_time datetimeoffset,
    @hs_meeting_outcome nvarchar(500),
    @hs_meeting_location nvarchar(500),
    @hs_meeting_external_url nvarchar(1000),
    @hs_internal_meeting_notes nvarchar(MAX),
    @hs_activity_type nvarchar(500),
    @hubspot_owner_id nvarchar(100),
    @hs_timestamp datetimeoffset,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Meeting]
    SET
        [hs_meeting_title] = @hs_meeting_title,
        [hs_meeting_body] = @hs_meeting_body,
        [hs_meeting_start_time] = @hs_meeting_start_time,
        [hs_meeting_end_time] = @hs_meeting_end_time,
        [hs_meeting_outcome] = @hs_meeting_outcome,
        [hs_meeting_location] = @hs_meeting_location,
        [hs_meeting_external_url] = @hs_meeting_external_url,
        [hs_internal_meeting_notes] = @hs_internal_meeting_notes,
        [hs_activity_type] = @hs_activity_type,
        [hubspot_owner_id] = @hubspot_owner_id,
        [hs_timestamp] = @hs_timestamp,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwMeetings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwMeetings]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateMeeting] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Meeting table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateMeeting]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateMeeting];
GO
CREATE TRIGGER [HubSpot].trgUpdateMeeting
ON [HubSpot].[Meeting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Meeting]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[Meeting] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Meetings */

GRANT EXECUTE ON [HubSpot].[spUpdateMeeting] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Member Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Favorites
-- Item: vwMemberFavorites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Member Favorites
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  MemberFavorite
-----               PRIMARY KEY: FavoriteId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMemberFavorites]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMemberFavorites];
GO

CREATE VIEW [YourMembership].[vwMemberFavorites]
AS
SELECT
    m.*
FROM
    [YourMembership].[MemberFavorite] AS m
GO
GRANT SELECT ON [YourMembership].[vwMemberFavorites] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Member Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Favorites
-- Item: Permissions for vwMemberFavorites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMemberFavorites] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Member Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Favorites
-- Item: spCreateMemberFavorite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MemberFavorite
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMemberFavorite]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMemberFavorite];
GO

CREATE PROCEDURE [YourMembership].[spCreateMemberFavorite]
    @FavoriteId int = NULL,
    @ProfileID int,
    @ItemType nvarchar(200),
    @ItemId nvarchar(200),
    @DateAdded datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[MemberFavorite]
        (
            [FavoriteId],
                [ProfileID],
                [ItemType],
                [ItemId],
                [DateAdded],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @FavoriteId,
                @ProfileID,
                @ItemType,
                @ItemId,
                @DateAdded,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMemberFavorites] WHERE [FavoriteId] = @FavoriteId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMemberFavorite] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Member Favorites */

GRANT EXECUTE ON [YourMembership].[spCreateMemberFavorite] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Member Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Favorites
-- Item: spUpdateMemberFavorite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MemberFavorite
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMemberFavorite]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMemberFavorite];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMemberFavorite]
    @FavoriteId int,
    @ProfileID int,
    @ItemType nvarchar(200),
    @ItemId nvarchar(200),
    @DateAdded datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberFavorite]
    SET
        [ProfileID] = @ProfileID,
        [ItemType] = @ItemType,
        [ItemId] = @ItemId,
        [DateAdded] = @DateAdded,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [FavoriteId] = @FavoriteId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMemberFavorites] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMemberFavorites]
                                    WHERE
                                        [FavoriteId] = @FavoriteId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMemberFavorite] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MemberFavorite table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMemberFavorite]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMemberFavorite];
GO
CREATE TRIGGER [YourMembership].trgUpdateMemberFavorite
ON [YourMembership].[MemberFavorite]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberFavorite]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[MemberFavorite] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[FavoriteId] = I.[FavoriteId];
END;
GO
        

/* spUpdate Permissions for Member Favorites */

GRANT EXECUTE ON [YourMembership].[spUpdateMemberFavorite] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Invoice Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Items
-- Item: spDeleteInvoiceItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR InvoiceItem
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteInvoiceItem]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteInvoiceItem];
GO

CREATE PROCEDURE [YourMembership].[spDeleteInvoiceItem]
    @LineItemID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[InvoiceItem]
    WHERE
        [LineItemID] = @LineItemID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [LineItemID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @LineItemID AS [LineItemID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteInvoiceItem] TO [cdp_Integration]
    

/* spDelete Permissions for Invoice Items */

GRANT EXECUTE ON [YourMembership].[spDeleteInvoiceItem] TO [cdp_Integration]



/* spDelete SQL for Line Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Line Items
-- Item: spDeleteLineItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR LineItem
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteLineItem]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteLineItem];
GO

CREATE PROCEDURE [HubSpot].[spDeleteLineItem]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[LineItem]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteLineItem] TO [cdp_Integration]
    

/* spDelete Permissions for Line Items */

GRANT EXECUTE ON [HubSpot].[spDeleteLineItem] TO [cdp_Integration]



/* spDelete SQL for Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: spDeleteLocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Location
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteLocation]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteLocation];
GO

CREATE PROCEDURE [YourMembership].[spDeleteLocation]
    @locationCode nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[Location]
    WHERE
        [locationCode] = @locationCode


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [locationCode] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @locationCode AS [locationCode] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteLocation] TO [cdp_Integration]
    

/* spDelete Permissions for Locations */

GRANT EXECUTE ON [YourMembership].[spDeleteLocation] TO [cdp_Integration]



/* spDelete SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: spDeleteMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteMeeting];
GO

CREATE PROCEDURE [HubSpot].[spDeleteMeeting]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[Meeting]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteMeeting] TO [cdp_Integration]
    

/* spDelete Permissions for Meetings */

GRANT EXECUTE ON [HubSpot].[spDeleteMeeting] TO [cdp_Integration]



/* spDelete SQL for Member Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Favorites
-- Item: spDeleteMemberFavorite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MemberFavorite
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMemberFavorite]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMemberFavorite];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMemberFavorite]
    @FavoriteId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[MemberFavorite]
    WHERE
        [FavoriteId] = @FavoriteId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [FavoriteId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @FavoriteId AS [FavoriteId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMemberFavorite] TO [cdp_Integration]
    

/* spDelete Permissions for Member Favorites */

GRANT EXECUTE ON [YourMembership].[spDeleteMemberFavorite] TO [cdp_Integration]



/* Index for Foreign Keys for MemberGroupBulk */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Group Bulks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key WebSiteMemberID in table MemberGroupBulk
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberGroupBulk_WebSiteMemberID' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberGroupBulk]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberGroupBulk_WebSiteMemberID ON [YourMembership].[MemberGroupBulk] ([WebSiteMemberID]);

-- Index for foreign key GroupID in table MemberGroupBulk
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberGroupBulk_GroupID' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberGroupBulk]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberGroupBulk_GroupID ON [YourMembership].[MemberGroupBulk] ([GroupID]);

/* Index for Foreign Keys for MemberGroup */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Groups
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProfileID in table MemberGroup
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberGroup_ProfileID' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberGroup]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberGroup_ProfileID ON [YourMembership].[MemberGroup] ([ProfileID]);

-- Index for foreign key GroupId in table MemberGroup
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberGroup_GroupId' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberGroup]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberGroup_GroupId ON [YourMembership].[MemberGroup] ([GroupId]);

-- Index for foreign key GroupTypeId in table MemberGroup
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberGroup_GroupTypeId' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberGroup]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberGroup_GroupTypeId ON [YourMembership].[MemberGroup] ([GroupTypeId]);

/* Index for Foreign Keys for MemberNetwork */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Networks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProfileID in table MemberNetwork
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberNetwork_ProfileID' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberNetwork]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberNetwork_ProfileID ON [YourMembership].[MemberNetwork] ([ProfileID]);

/* Index for Foreign Keys for MemberProfile */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Profiles
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MemberTypeCode in table MemberProfile
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberProfile_MemberTypeCode' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberProfile]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberProfile_MemberTypeCode ON [YourMembership].[MemberProfile] ([MemberTypeCode]);

/* Index for Foreign Keys for MemberReferral */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Referrals
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ReferrerID in table MemberReferral
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberReferral_ReferrerID' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberReferral]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberReferral_ReferrerID ON [YourMembership].[MemberReferral] ([ReferrerID]);

-- Index for foreign key ReferredID in table MemberReferral
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberReferral_ReferredID' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberReferral]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberReferral_ReferredID ON [YourMembership].[MemberReferral] ([ReferredID]);

/* Base View SQL for Member Group Bulks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Group Bulks
-- Item: vwMemberGroupBulks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Member Group Bulks
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  MemberGroupBulk
-----               PRIMARY KEY: WebSiteMemberID, GroupID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMemberGroupBulks]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMemberGroupBulks];
GO

CREATE VIEW [YourMembership].[vwMemberGroupBulks]
AS
SELECT
    m.*
FROM
    [YourMembership].[MemberGroupBulk] AS m
GO
GRANT SELECT ON [YourMembership].[vwMemberGroupBulks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Member Group Bulks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Group Bulks
-- Item: Permissions for vwMemberGroupBulks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMemberGroupBulks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Member Group Bulks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Group Bulks
-- Item: spCreateMemberGroupBulk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MemberGroupBulk
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMemberGroupBulk]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMemberGroupBulk];
GO

CREATE PROCEDURE [YourMembership].[spCreateMemberGroupBulk]
    @WebSiteMemberID int = NULL,
    @GroupID int = NULL,
    @GroupCode nvarchar(200),
    @GroupName nvarchar(200),
    @PrimaryGroup bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[MemberGroupBulk]
        (
            [WebSiteMemberID],
                [GroupID],
                [GroupCode],
                [GroupName],
                [PrimaryGroup],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @WebSiteMemberID,
                @GroupID,
                @GroupCode,
                @GroupName,
                @PrimaryGroup,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMemberGroupBulks] WHERE [WebSiteMemberID] = @WebSiteMemberID AND [GroupID] = @GroupID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMemberGroupBulk] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Member Group Bulks */

GRANT EXECUTE ON [YourMembership].[spCreateMemberGroupBulk] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Member Group Bulks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Group Bulks
-- Item: spUpdateMemberGroupBulk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MemberGroupBulk
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMemberGroupBulk]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMemberGroupBulk];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMemberGroupBulk]
    @WebSiteMemberID int,
    @GroupID int,
    @GroupCode nvarchar(200),
    @GroupName nvarchar(200),
    @PrimaryGroup bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberGroupBulk]
    SET
        [GroupCode] = @GroupCode,
        [GroupName] = @GroupName,
        [PrimaryGroup] = @PrimaryGroup,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [WebSiteMemberID] = @WebSiteMemberID AND [GroupID] = @GroupID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMemberGroupBulks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMemberGroupBulks]
                                    WHERE
                                        [WebSiteMemberID] = @WebSiteMemberID AND [GroupID] = @GroupID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMemberGroupBulk] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MemberGroupBulk table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMemberGroupBulk]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMemberGroupBulk];
GO
CREATE TRIGGER [YourMembership].trgUpdateMemberGroupBulk
ON [YourMembership].[MemberGroupBulk]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberGroupBulk]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[MemberGroupBulk] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[WebSiteMemberID] = I.[WebSiteMemberID] AND _organicTable.[GroupID] = I.[GroupID];
END;
GO
        

/* spUpdate Permissions for Member Group Bulks */

GRANT EXECUTE ON [YourMembership].[spUpdateMemberGroupBulk] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Member Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Groups
-- Item: vwMemberGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Member Groups
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  MemberGroup
-----               PRIMARY KEY: MemberGroupId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMemberGroups]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMemberGroups];
GO

CREATE VIEW [YourMembership].[vwMemberGroups]
AS
SELECT
    m.*
FROM
    [YourMembership].[MemberGroup] AS m
GO
GRANT SELECT ON [YourMembership].[vwMemberGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Member Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Groups
-- Item: Permissions for vwMemberGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMemberGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Member Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Groups
-- Item: spCreateMemberGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MemberGroup
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMemberGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMemberGroup];
GO

CREATE PROCEDURE [YourMembership].[spCreateMemberGroup]
    @MemberGroupId nvarchar(200) = NULL,
    @ProfileID int,
    @GroupId int,
    @GroupName nvarchar(200),
    @GroupTypeName nvarchar(200),
    @GroupTypeId int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[MemberGroup]
        (
            [MemberGroupId],
                [ProfileID],
                [GroupId],
                [GroupName],
                [GroupTypeName],
                [GroupTypeId],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @MemberGroupId,
                @ProfileID,
                @GroupId,
                @GroupName,
                @GroupTypeName,
                @GroupTypeId,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMemberGroups] WHERE [MemberGroupId] = @MemberGroupId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMemberGroup] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Member Groups */

GRANT EXECUTE ON [YourMembership].[spCreateMemberGroup] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Member Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Groups
-- Item: spUpdateMemberGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MemberGroup
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMemberGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMemberGroup];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMemberGroup]
    @MemberGroupId nvarchar(200),
    @ProfileID int,
    @GroupId int,
    @GroupName nvarchar(200),
    @GroupTypeName nvarchar(200),
    @GroupTypeId int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberGroup]
    SET
        [ProfileID] = @ProfileID,
        [GroupId] = @GroupId,
        [GroupName] = @GroupName,
        [GroupTypeName] = @GroupTypeName,
        [GroupTypeId] = @GroupTypeId,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [MemberGroupId] = @MemberGroupId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMemberGroups] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMemberGroups]
                                    WHERE
                                        [MemberGroupId] = @MemberGroupId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMemberGroup] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MemberGroup table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMemberGroup]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMemberGroup];
GO
CREATE TRIGGER [YourMembership].trgUpdateMemberGroup
ON [YourMembership].[MemberGroup]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberGroup]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[MemberGroup] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[MemberGroupId] = I.[MemberGroupId];
END;
GO
        

/* spUpdate Permissions for Member Groups */

GRANT EXECUTE ON [YourMembership].[spUpdateMemberGroup] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Member Networks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Networks
-- Item: vwMemberNetworks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Member Networks
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  MemberNetwork
-----               PRIMARY KEY: NetworkId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMemberNetworks]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMemberNetworks];
GO

CREATE VIEW [YourMembership].[vwMemberNetworks]
AS
SELECT
    m.*
FROM
    [YourMembership].[MemberNetwork] AS m
GO
GRANT SELECT ON [YourMembership].[vwMemberNetworks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Member Networks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Networks
-- Item: Permissions for vwMemberNetworks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMemberNetworks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Member Networks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Networks
-- Item: spCreateMemberNetwork
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MemberNetwork
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMemberNetwork]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMemberNetwork];
GO

CREATE PROCEDURE [YourMembership].[spCreateMemberNetwork]
    @NetworkId int = NULL,
    @ProfileID int,
    @NetworkType nvarchar(200),
    @ProfileUrl nvarchar(500),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[MemberNetwork]
        (
            [NetworkId],
                [ProfileID],
                [NetworkType],
                [ProfileUrl],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @NetworkId,
                @ProfileID,
                @NetworkType,
                @ProfileUrl,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMemberNetworks] WHERE [NetworkId] = @NetworkId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMemberNetwork] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Member Networks */

GRANT EXECUTE ON [YourMembership].[spCreateMemberNetwork] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Member Networks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Networks
-- Item: spUpdateMemberNetwork
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MemberNetwork
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMemberNetwork]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMemberNetwork];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMemberNetwork]
    @NetworkId int,
    @ProfileID int,
    @NetworkType nvarchar(200),
    @ProfileUrl nvarchar(500),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberNetwork]
    SET
        [ProfileID] = @ProfileID,
        [NetworkType] = @NetworkType,
        [ProfileUrl] = @ProfileUrl,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [NetworkId] = @NetworkId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMemberNetworks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMemberNetworks]
                                    WHERE
                                        [NetworkId] = @NetworkId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMemberNetwork] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MemberNetwork table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMemberNetwork]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMemberNetwork];
GO
CREATE TRIGGER [YourMembership].trgUpdateMemberNetwork
ON [YourMembership].[MemberNetwork]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberNetwork]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[MemberNetwork] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[NetworkId] = I.[NetworkId];
END;
GO
        

/* spUpdate Permissions for Member Networks */

GRANT EXECUTE ON [YourMembership].[spUpdateMemberNetwork] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Member Profiles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Profiles
-- Item: vwMemberProfiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Member Profiles
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  MemberProfile
-----               PRIMARY KEY: ProfileID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMemberProfiles]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMemberProfiles];
GO

CREATE VIEW [YourMembership].[vwMemberProfiles]
AS
SELECT
    m.*
FROM
    [YourMembership].[MemberProfile] AS m
GO
GRANT SELECT ON [YourMembership].[vwMemberProfiles] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Member Profiles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Profiles
-- Item: Permissions for vwMemberProfiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMemberProfiles] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Member Profiles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Profiles
-- Item: spCreateMemberProfile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MemberProfile
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMemberProfile]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMemberProfile];
GO

CREATE PROCEDURE [YourMembership].[spCreateMemberProfile]
    @ProfileID int = NULL,
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @EmailAddress nvarchar(200),
    @Organization nvarchar(200),
    @Title nvarchar(200),
    @MemberTypeCode nvarchar(200),
    @Status nvarchar(200),
    @JoinDate datetimeoffset,
    @ExpirationDate datetimeoffset,
    @LastModifiedDate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[MemberProfile]
        (
            [ProfileID],
                [FirstName],
                [LastName],
                [EmailAddress],
                [Organization],
                [Title],
                [MemberTypeCode],
                [Status],
                [JoinDate],
                [ExpirationDate],
                [LastModifiedDate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ProfileID,
                @FirstName,
                @LastName,
                @EmailAddress,
                @Organization,
                @Title,
                @MemberTypeCode,
                @Status,
                @JoinDate,
                @ExpirationDate,
                @LastModifiedDate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMemberProfiles] WHERE [ProfileID] = @ProfileID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMemberProfile] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Member Profiles */

GRANT EXECUTE ON [YourMembership].[spCreateMemberProfile] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Member Profiles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Profiles
-- Item: spUpdateMemberProfile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MemberProfile
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMemberProfile]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMemberProfile];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMemberProfile]
    @ProfileID int,
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @EmailAddress nvarchar(200),
    @Organization nvarchar(200),
    @Title nvarchar(200),
    @MemberTypeCode nvarchar(200),
    @Status nvarchar(200),
    @JoinDate datetimeoffset,
    @ExpirationDate datetimeoffset,
    @LastModifiedDate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberProfile]
    SET
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [EmailAddress] = @EmailAddress,
        [Organization] = @Organization,
        [Title] = @Title,
        [MemberTypeCode] = @MemberTypeCode,
        [Status] = @Status,
        [JoinDate] = @JoinDate,
        [ExpirationDate] = @ExpirationDate,
        [LastModifiedDate] = @LastModifiedDate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ProfileID] = @ProfileID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMemberProfiles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMemberProfiles]
                                    WHERE
                                        [ProfileID] = @ProfileID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMemberProfile] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MemberProfile table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMemberProfile]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMemberProfile];
GO
CREATE TRIGGER [YourMembership].trgUpdateMemberProfile
ON [YourMembership].[MemberProfile]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberProfile]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[MemberProfile] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ProfileID] = I.[ProfileID];
END;
GO
        

/* spUpdate Permissions for Member Profiles */

GRANT EXECUTE ON [YourMembership].[spUpdateMemberProfile] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Member Referrals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Referrals
-- Item: vwMemberReferrals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Member Referrals
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  MemberReferral
-----               PRIMARY KEY: ReferralId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMemberReferrals]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMemberReferrals];
GO

CREATE VIEW [YourMembership].[vwMemberReferrals]
AS
SELECT
    m.*
FROM
    [YourMembership].[MemberReferral] AS m
GO
GRANT SELECT ON [YourMembership].[vwMemberReferrals] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Member Referrals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Referrals
-- Item: Permissions for vwMemberReferrals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMemberReferrals] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Member Referrals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Referrals
-- Item: spCreateMemberReferral
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MemberReferral
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMemberReferral]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMemberReferral];
GO

CREATE PROCEDURE [YourMembership].[spCreateMemberReferral]
    @ReferralId int = NULL,
    @ReferrerID int,
    @ReferredID int,
    @ReferralDate datetimeoffset,
    @Status nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[MemberReferral]
        (
            [ReferralId],
                [ReferrerID],
                [ReferredID],
                [ReferralDate],
                [Status],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ReferralId,
                @ReferrerID,
                @ReferredID,
                @ReferralDate,
                @Status,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMemberReferrals] WHERE [ReferralId] = @ReferralId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMemberReferral] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Member Referrals */

GRANT EXECUTE ON [YourMembership].[spCreateMemberReferral] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Member Referrals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Referrals
-- Item: spUpdateMemberReferral
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MemberReferral
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMemberReferral]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMemberReferral];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMemberReferral]
    @ReferralId int,
    @ReferrerID int,
    @ReferredID int,
    @ReferralDate datetimeoffset,
    @Status nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberReferral]
    SET
        [ReferrerID] = @ReferrerID,
        [ReferredID] = @ReferredID,
        [ReferralDate] = @ReferralDate,
        [Status] = @Status,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ReferralId] = @ReferralId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMemberReferrals] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMemberReferrals]
                                    WHERE
                                        [ReferralId] = @ReferralId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMemberReferral] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MemberReferral table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMemberReferral]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMemberReferral];
GO
CREATE TRIGGER [YourMembership].trgUpdateMemberReferral
ON [YourMembership].[MemberReferral]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberReferral]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[MemberReferral] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ReferralId] = I.[ReferralId];
END;
GO
        

/* spUpdate Permissions for Member Referrals */

GRANT EXECUTE ON [YourMembership].[spUpdateMemberReferral] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Member Group Bulks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Group Bulks
-- Item: spDeleteMemberGroupBulk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MemberGroupBulk
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMemberGroupBulk]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMemberGroupBulk];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMemberGroupBulk]
    @WebSiteMemberID int, @GroupID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[MemberGroupBulk]
    WHERE
        [WebSiteMemberID] = @WebSiteMemberID AND [GroupID] = @GroupID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [WebSiteMemberID], NULL AS [GroupID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @WebSiteMemberID AS [WebSiteMemberID], @GroupID AS [GroupID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMemberGroupBulk] TO [cdp_Integration]
    

/* spDelete Permissions for Member Group Bulks */

GRANT EXECUTE ON [YourMembership].[spDeleteMemberGroupBulk] TO [cdp_Integration]



/* spDelete SQL for Member Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Groups
-- Item: spDeleteMemberGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MemberGroup
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMemberGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMemberGroup];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMemberGroup]
    @MemberGroupId nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[MemberGroup]
    WHERE
        [MemberGroupId] = @MemberGroupId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [MemberGroupId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @MemberGroupId AS [MemberGroupId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMemberGroup] TO [cdp_Integration]
    

/* spDelete Permissions for Member Groups */

GRANT EXECUTE ON [YourMembership].[spDeleteMemberGroup] TO [cdp_Integration]



/* spDelete SQL for Member Networks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Networks
-- Item: spDeleteMemberNetwork
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MemberNetwork
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMemberNetwork]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMemberNetwork];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMemberNetwork]
    @NetworkId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[MemberNetwork]
    WHERE
        [NetworkId] = @NetworkId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [NetworkId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @NetworkId AS [NetworkId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMemberNetwork] TO [cdp_Integration]
    

/* spDelete Permissions for Member Networks */

GRANT EXECUTE ON [YourMembership].[spDeleteMemberNetwork] TO [cdp_Integration]



/* spDelete SQL for Member Profiles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Profiles
-- Item: spDeleteMemberProfile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MemberProfile
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMemberProfile]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMemberProfile];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMemberProfile]
    @ProfileID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[MemberProfile]
    WHERE
        [ProfileID] = @ProfileID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ProfileID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ProfileID AS [ProfileID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMemberProfile] TO [cdp_Integration]
    

/* spDelete Permissions for Member Profiles */

GRANT EXECUTE ON [YourMembership].[spDeleteMemberProfile] TO [cdp_Integration]



/* spDelete SQL for Member Referrals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Referrals
-- Item: spDeleteMemberReferral
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MemberReferral
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMemberReferral]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMemberReferral];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMemberReferral]
    @ReferralId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[MemberReferral]
    WHERE
        [ReferralId] = @ReferralId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ReferralId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ReferralId AS [ReferralId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMemberReferral] TO [cdp_Integration]
    

/* spDelete Permissions for Member Referrals */

GRANT EXECUTE ON [YourMembership].[spDeleteMemberReferral] TO [cdp_Integration]



/* Index for Foreign Keys for MemberSubAccount */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Sub Accounts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ID in table MemberSubAccount
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberSubAccount_ID' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberSubAccount]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberSubAccount_ID ON [YourMembership].[MemberSubAccount] ([ID]);

-- Index for foreign key ParentID in table MemberSubAccount
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MemberSubAccount_ParentID' 
    AND object_id = OBJECT_ID('[YourMembership].[MemberSubAccount]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MemberSubAccount_ParentID ON [YourMembership].[MemberSubAccount] ([ParentID]);

/* Index for Foreign Keys for MemberType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Member */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MemberTypeCode in table Member
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Member_MemberTypeCode' 
    AND object_id = OBJECT_ID('[YourMembership].[Member]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Member_MemberTypeCode ON [YourMembership].[Member] ([MemberTypeCode]);

-- Index for foreign key Country in table Member
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Member_Country' 
    AND object_id = OBJECT_ID('[YourMembership].[Member]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Member_Country ON [YourMembership].[Member] ([Country]);

/* Index for Foreign Keys for MembershipModifier */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Modifiers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MembershipID in table MembershipModifier
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MembershipModifier_MembershipID' 
    AND object_id = OBJECT_ID('[YourMembership].[MembershipModifier]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MembershipModifier_MembershipID ON [YourMembership].[MembershipModifier] ([MembershipID]);

/* Index for Foreign Keys for MembershipPromoCode */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Promo Codes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MembershipID in table MembershipPromoCode
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MembershipPromoCode_MembershipID' 
    AND object_id = OBJECT_ID('[YourMembership].[MembershipPromoCode]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MembershipPromoCode_MembershipID ON [YourMembership].[MembershipPromoCode] ([MembershipID]);

/* Base View SQL for Member Sub Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Sub Accounts
-- Item: vwMemberSubAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Member Sub Accounts
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  MemberSubAccount
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMemberSubAccounts]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMemberSubAccounts];
GO

CREATE VIEW [YourMembership].[vwMemberSubAccounts]
AS
SELECT
    m.*
FROM
    [YourMembership].[MemberSubAccount] AS m
GO
GRANT SELECT ON [YourMembership].[vwMemberSubAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Member Sub Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Sub Accounts
-- Item: Permissions for vwMemberSubAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMemberSubAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Member Sub Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Sub Accounts
-- Item: spCreateMemberSubAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MemberSubAccount
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMemberSubAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMemberSubAccount];
GO

CREATE PROCEDURE [YourMembership].[spCreateMemberSubAccount]
    @ID int = NULL,
    @ParentID int,
    @DateRegistered datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[MemberSubAccount]
        (
            [ID],
                [ParentID],
                [DateRegistered],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ID,
                @ParentID,
                @DateRegistered,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMemberSubAccounts] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMemberSubAccount] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Member Sub Accounts */

GRANT EXECUTE ON [YourMembership].[spCreateMemberSubAccount] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Member Sub Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Sub Accounts
-- Item: spUpdateMemberSubAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MemberSubAccount
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMemberSubAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMemberSubAccount];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMemberSubAccount]
    @ID int,
    @ParentID int,
    @DateRegistered datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberSubAccount]
    SET
        [ParentID] = @ParentID,
        [DateRegistered] = @DateRegistered,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMemberSubAccounts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMemberSubAccounts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMemberSubAccount] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MemberSubAccount table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMemberSubAccount]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMemberSubAccount];
GO
CREATE TRIGGER [YourMembership].trgUpdateMemberSubAccount
ON [YourMembership].[MemberSubAccount]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberSubAccount]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[MemberSubAccount] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Member Sub Accounts */

GRANT EXECUTE ON [YourMembership].[spUpdateMemberSubAccount] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Member Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Types
-- Item: vwMemberTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Member Types
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  MemberType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMemberTypes]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMemberTypes];
GO

CREATE VIEW [YourMembership].[vwMemberTypes]
AS
SELECT
    m.*
FROM
    [YourMembership].[MemberType] AS m
GO
GRANT SELECT ON [YourMembership].[vwMemberTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Member Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Types
-- Item: Permissions for vwMemberTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMemberTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Member Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Types
-- Item: spCreateMemberType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MemberType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMemberType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMemberType];
GO

CREATE PROCEDURE [YourMembership].[spCreateMemberType]
    @ID int = NULL,
    @TypeCode nvarchar(200),
    @Name nvarchar(200),
    @IsDefault bit,
    @PresetType nvarchar(200),
    @SortOrder int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[MemberType]
        (
            [ID],
                [TypeCode],
                [Name],
                [IsDefault],
                [PresetType],
                [SortOrder],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ID,
                @TypeCode,
                @Name,
                @IsDefault,
                @PresetType,
                @SortOrder,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMemberTypes] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMemberType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Member Types */

GRANT EXECUTE ON [YourMembership].[spCreateMemberType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Member Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Types
-- Item: spUpdateMemberType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MemberType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMemberType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMemberType];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMemberType]
    @ID int,
    @TypeCode nvarchar(200),
    @Name nvarchar(200),
    @IsDefault bit,
    @PresetType nvarchar(200),
    @SortOrder int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberType]
    SET
        [TypeCode] = @TypeCode,
        [Name] = @Name,
        [IsDefault] = @IsDefault,
        [PresetType] = @PresetType,
        [SortOrder] = @SortOrder,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMemberTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMemberTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMemberType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MemberType table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMemberType]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMemberType];
GO
CREATE TRIGGER [YourMembership].trgUpdateMemberType
ON [YourMembership].[MemberType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MemberType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[MemberType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Member Types */

GRANT EXECUTE ON [YourMembership].[spUpdateMemberType] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: vwMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Members
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  Member
-----               PRIMARY KEY: ProfileID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMembers]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMembers];
GO

CREATE VIEW [YourMembership].[vwMembers]
AS
SELECT
    m.*
FROM
    [YourMembership].[Member] AS m
GO
GRANT SELECT ON [YourMembership].[vwMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: Permissions for vwMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spCreateMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMember]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMember];
GO

CREATE PROCEDURE [YourMembership].[spCreateMember]
    @ProfileID int = NULL,
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @EmailAddr nvarchar(200),
    @MemberTypeCode nvarchar(200),
    @Status nvarchar(200),
    @Organization nvarchar(200),
    @Phone nvarchar(200),
    @Address1 nvarchar(200),
    @Address2 nvarchar(200),
    @City nvarchar(200),
    @State nvarchar(200),
    @PostalCode nvarchar(200),
    @Country nvarchar(200),
    @Title nvarchar(200),
    @JoinDate datetimeoffset,
    @RenewalDate datetimeoffset,
    @ExpirationDate datetimeoffset,
    @MemberSinceDate datetimeoffset,
    @WebsiteUrl nvarchar(500),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[Member]
        (
            [ProfileID],
                [FirstName],
                [LastName],
                [EmailAddr],
                [MemberTypeCode],
                [Status],
                [Organization],
                [Phone],
                [Address1],
                [Address2],
                [City],
                [State],
                [PostalCode],
                [Country],
                [Title],
                [JoinDate],
                [RenewalDate],
                [ExpirationDate],
                [MemberSinceDate],
                [WebsiteUrl],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ProfileID,
                @FirstName,
                @LastName,
                @EmailAddr,
                @MemberTypeCode,
                @Status,
                @Organization,
                @Phone,
                @Address1,
                @Address2,
                @City,
                @State,
                @PostalCode,
                @Country,
                @Title,
                @JoinDate,
                @RenewalDate,
                @ExpirationDate,
                @MemberSinceDate,
                @WebsiteUrl,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMembers] WHERE [ProfileID] = @ProfileID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMember] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Members */

GRANT EXECUTE ON [YourMembership].[spCreateMember] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spUpdateMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMember]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMember];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMember]
    @ProfileID int,
    @FirstName nvarchar(200),
    @LastName nvarchar(200),
    @EmailAddr nvarchar(200),
    @MemberTypeCode nvarchar(200),
    @Status nvarchar(200),
    @Organization nvarchar(200),
    @Phone nvarchar(200),
    @Address1 nvarchar(200),
    @Address2 nvarchar(200),
    @City nvarchar(200),
    @State nvarchar(200),
    @PostalCode nvarchar(200),
    @Country nvarchar(200),
    @Title nvarchar(200),
    @JoinDate datetimeoffset,
    @RenewalDate datetimeoffset,
    @ExpirationDate datetimeoffset,
    @MemberSinceDate datetimeoffset,
    @WebsiteUrl nvarchar(500),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Member]
    SET
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [EmailAddr] = @EmailAddr,
        [MemberTypeCode] = @MemberTypeCode,
        [Status] = @Status,
        [Organization] = @Organization,
        [Phone] = @Phone,
        [Address1] = @Address1,
        [Address2] = @Address2,
        [City] = @City,
        [State] = @State,
        [PostalCode] = @PostalCode,
        [Country] = @Country,
        [Title] = @Title,
        [JoinDate] = @JoinDate,
        [RenewalDate] = @RenewalDate,
        [ExpirationDate] = @ExpirationDate,
        [MemberSinceDate] = @MemberSinceDate,
        [WebsiteUrl] = @WebsiteUrl,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ProfileID] = @ProfileID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMembers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMembers]
                                    WHERE
                                        [ProfileID] = @ProfileID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMember] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Member table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMember]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMember];
GO
CREATE TRIGGER [YourMembership].trgUpdateMember
ON [YourMembership].[Member]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Member]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[Member] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ProfileID] = I.[ProfileID];
END;
GO
        

/* spUpdate Permissions for Members */

GRANT EXECUTE ON [YourMembership].[spUpdateMember] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Membership Modifiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Modifiers
-- Item: vwMembershipModifiers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Membership Modifiers
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  MembershipModifier
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMembershipModifiers]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMembershipModifiers];
GO

CREATE VIEW [YourMembership].[vwMembershipModifiers]
AS
SELECT
    m.*
FROM
    [YourMembership].[MembershipModifier] AS m
GO
GRANT SELECT ON [YourMembership].[vwMembershipModifiers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Membership Modifiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Modifiers
-- Item: Permissions for vwMembershipModifiers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMembershipModifiers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Membership Modifiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Modifiers
-- Item: spCreateMembershipModifier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MembershipModifier
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMembershipModifier]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMembershipModifier];
GO

CREATE PROCEDURE [YourMembership].[spCreateMembershipModifier]
    @ID int = NULL,
    @MembershipID int,
    @Name nvarchar(200),
    @Description nvarchar(500),
    @Amount decimal(18, 2),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[MembershipModifier]
        (
            [ID],
                [MembershipID],
                [Name],
                [Description],
                [Amount],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ID,
                @MembershipID,
                @Name,
                @Description,
                @Amount,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMembershipModifiers] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMembershipModifier] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Membership Modifiers */

GRANT EXECUTE ON [YourMembership].[spCreateMembershipModifier] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Membership Modifiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Modifiers
-- Item: spUpdateMembershipModifier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MembershipModifier
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMembershipModifier]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMembershipModifier];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMembershipModifier]
    @ID int,
    @MembershipID int,
    @Name nvarchar(200),
    @Description nvarchar(500),
    @Amount decimal(18, 2),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MembershipModifier]
    SET
        [MembershipID] = @MembershipID,
        [Name] = @Name,
        [Description] = @Description,
        [Amount] = @Amount,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMembershipModifiers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMembershipModifiers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMembershipModifier] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MembershipModifier table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMembershipModifier]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMembershipModifier];
GO
CREATE TRIGGER [YourMembership].trgUpdateMembershipModifier
ON [YourMembership].[MembershipModifier]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MembershipModifier]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[MembershipModifier] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Membership Modifiers */

GRANT EXECUTE ON [YourMembership].[spUpdateMembershipModifier] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Membership Promo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Promo Codes
-- Item: vwMembershipPromoCodes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Membership Promo Codes
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  MembershipPromoCode
-----               PRIMARY KEY: PromoCodeId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMembershipPromoCodes]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMembershipPromoCodes];
GO

CREATE VIEW [YourMembership].[vwMembershipPromoCodes]
AS
SELECT
    m.*
FROM
    [YourMembership].[MembershipPromoCode] AS m
GO
GRANT SELECT ON [YourMembership].[vwMembershipPromoCodes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Membership Promo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Promo Codes
-- Item: Permissions for vwMembershipPromoCodes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMembershipPromoCodes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Membership Promo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Promo Codes
-- Item: spCreateMembershipPromoCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MembershipPromoCode
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMembershipPromoCode]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMembershipPromoCode];
GO

CREATE PROCEDURE [YourMembership].[spCreateMembershipPromoCode]
    @PromoCodeId int = NULL,
    @MembershipID int,
    @FriendlyName nvarchar(200),
    @DiscountAmount decimal(18, 2),
    @ExpirationDate datetimeoffset,
    @UsageLimit int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[MembershipPromoCode]
        (
            [PromoCodeId],
                [MembershipID],
                [FriendlyName],
                [DiscountAmount],
                [ExpirationDate],
                [UsageLimit],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @PromoCodeId,
                @MembershipID,
                @FriendlyName,
                @DiscountAmount,
                @ExpirationDate,
                @UsageLimit,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMembershipPromoCodes] WHERE [PromoCodeId] = @PromoCodeId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMembershipPromoCode] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Membership Promo Codes */

GRANT EXECUTE ON [YourMembership].[spCreateMembershipPromoCode] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Membership Promo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Promo Codes
-- Item: spUpdateMembershipPromoCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MembershipPromoCode
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMembershipPromoCode]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMembershipPromoCode];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMembershipPromoCode]
    @PromoCodeId int,
    @MembershipID int,
    @FriendlyName nvarchar(200),
    @DiscountAmount decimal(18, 2),
    @ExpirationDate datetimeoffset,
    @UsageLimit int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MembershipPromoCode]
    SET
        [MembershipID] = @MembershipID,
        [FriendlyName] = @FriendlyName,
        [DiscountAmount] = @DiscountAmount,
        [ExpirationDate] = @ExpirationDate,
        [UsageLimit] = @UsageLimit,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [PromoCodeId] = @PromoCodeId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMembershipPromoCodes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMembershipPromoCodes]
                                    WHERE
                                        [PromoCodeId] = @PromoCodeId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMembershipPromoCode] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MembershipPromoCode table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMembershipPromoCode]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMembershipPromoCode];
GO
CREATE TRIGGER [YourMembership].trgUpdateMembershipPromoCode
ON [YourMembership].[MembershipPromoCode]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[MembershipPromoCode]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[MembershipPromoCode] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[PromoCodeId] = I.[PromoCodeId];
END;
GO
        

/* spUpdate Permissions for Membership Promo Codes */

GRANT EXECUTE ON [YourMembership].[spUpdateMembershipPromoCode] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Member Sub Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Sub Accounts
-- Item: spDeleteMemberSubAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MemberSubAccount
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMemberSubAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMemberSubAccount];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMemberSubAccount]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[MemberSubAccount]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMemberSubAccount] TO [cdp_Integration]
    

/* spDelete Permissions for Member Sub Accounts */

GRANT EXECUTE ON [YourMembership].[spDeleteMemberSubAccount] TO [cdp_Integration]



/* spDelete SQL for Member Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Types
-- Item: spDeleteMemberType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MemberType
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMemberType]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMemberType];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMemberType]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[MemberType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMemberType] TO [cdp_Integration]
    

/* spDelete Permissions for Member Types */

GRANT EXECUTE ON [YourMembership].[spDeleteMemberType] TO [cdp_Integration]



/* spDelete SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spDeleteMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMember]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMember];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMember]
    @ProfileID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[Member]
    WHERE
        [ProfileID] = @ProfileID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ProfileID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ProfileID AS [ProfileID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMember] TO [cdp_Integration]
    

/* spDelete Permissions for Members */

GRANT EXECUTE ON [YourMembership].[spDeleteMember] TO [cdp_Integration]



/* spDelete SQL for Membership Modifiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Modifiers
-- Item: spDeleteMembershipModifier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MembershipModifier
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMembershipModifier]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMembershipModifier];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMembershipModifier]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[MembershipModifier]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMembershipModifier] TO [cdp_Integration]
    

/* spDelete Permissions for Membership Modifiers */

GRANT EXECUTE ON [YourMembership].[spDeleteMembershipModifier] TO [cdp_Integration]



/* spDelete SQL for Membership Promo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Promo Codes
-- Item: spDeleteMembershipPromoCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MembershipPromoCode
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMembershipPromoCode]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMembershipPromoCode];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMembershipPromoCode]
    @PromoCodeId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[MembershipPromoCode]
    WHERE
        [PromoCodeId] = @PromoCodeId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [PromoCodeId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @PromoCodeId AS [PromoCodeId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMembershipPromoCode] TO [cdp_Integration]
    

/* spDelete Permissions for Membership Promo Codes */

GRANT EXECUTE ON [YourMembership].[spDeleteMembershipPromoCode] TO [cdp_Integration]



/* Index for Foreign Keys for Membership */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: vwMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Memberships
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  Membership
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwMemberships]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwMemberships];
GO

CREATE VIEW [YourMembership].[vwMemberships]
AS
SELECT
    m.*
FROM
    [YourMembership].[Membership] AS m
GO
GRANT SELECT ON [YourMembership].[vwMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: Permissions for vwMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spCreateMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Membership
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateMembership];
GO

CREATE PROCEDURE [YourMembership].[spCreateMembership]
    @Id int = NULL,
    @Code nvarchar(200),
    @Name nvarchar(200),
    @DuesAmount decimal(18, 2),
    @ProRatedDues bit,
    @AllowMultipleOpenInvoices bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[Membership]
        (
            [Id],
                [Code],
                [Name],
                [DuesAmount],
                [ProRatedDues],
                [AllowMultipleOpenInvoices],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @Id,
                @Code,
                @Name,
                @DuesAmount,
                @ProRatedDues,
                @AllowMultipleOpenInvoices,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwMemberships] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateMembership] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Memberships */

GRANT EXECUTE ON [YourMembership].[spCreateMembership] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spUpdateMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Membership
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateMembership];
GO

CREATE PROCEDURE [YourMembership].[spUpdateMembership]
    @Id int,
    @Code nvarchar(200),
    @Name nvarchar(200),
    @DuesAmount decimal(18, 2),
    @ProRatedDues bit,
    @AllowMultipleOpenInvoices bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Membership]
    SET
        [Code] = @Code,
        [Name] = @Name,
        [DuesAmount] = @DuesAmount,
        [ProRatedDues] = @ProRatedDues,
        [AllowMultipleOpenInvoices] = @AllowMultipleOpenInvoices,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwMemberships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwMemberships]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateMembership] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Membership table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateMembership]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateMembership];
GO
CREATE TRIGGER [YourMembership].trgUpdateMembership
ON [YourMembership].[Membership]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Membership]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[Membership] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO
        

/* spUpdate Permissions for Memberships */

GRANT EXECUTE ON [YourMembership].[spUpdateMembership] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spDeleteMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Membership
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteMembership];
GO

CREATE PROCEDURE [YourMembership].[spDeleteMembership]
    @Id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[Membership]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteMembership] TO [cdp_Integration]
    

/* spDelete Permissions for Memberships */

GRANT EXECUTE ON [YourMembership].[spDeleteMembership] TO [cdp_Integration]



/* Index for Foreign Keys for Note */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Notes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Notes
-- Item: vwNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Notes
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  Note
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwNotes]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwNotes];
GO

CREATE VIEW [HubSpot].[vwNotes]
AS
SELECT
    n.*
FROM
    [HubSpot].[Note] AS n
GO
GRANT SELECT ON [HubSpot].[vwNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Notes
-- Item: Permissions for vwNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Notes
-- Item: spCreateNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Note
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateNote]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateNote];
GO

CREATE PROCEDURE [HubSpot].[spCreateNote]
    @hs_object_id nvarchar(100) = NULL,
    @hs_note_body nvarchar(MAX),
    @hs_timestamp datetimeoffset,
    @hubspot_owner_id nvarchar(100),
    @hs_attachment_ids nvarchar(500),
    @hs_body_preview nvarchar(MAX),
    @hs_body_preview_is_truncated bit,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[Note]
        (
            [hs_object_id],
                [hs_note_body],
                [hs_timestamp],
                [hubspot_owner_id],
                [hs_attachment_ids],
                [hs_body_preview],
                [hs_body_preview_is_truncated],
                [createdate],
                [hs_lastmodifieddate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @hs_note_body,
                @hs_timestamp,
                @hubspot_owner_id,
                @hs_attachment_ids,
                @hs_body_preview,
                @hs_body_preview_is_truncated,
                @createdate,
                @hs_lastmodifieddate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwNotes] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateNote] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Notes */

GRANT EXECUTE ON [HubSpot].[spCreateNote] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Notes
-- Item: spUpdateNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Note
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateNote]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateNote];
GO

CREATE PROCEDURE [HubSpot].[spUpdateNote]
    @hs_object_id nvarchar(100),
    @hs_note_body nvarchar(MAX),
    @hs_timestamp datetimeoffset,
    @hubspot_owner_id nvarchar(100),
    @hs_attachment_ids nvarchar(500),
    @hs_body_preview nvarchar(MAX),
    @hs_body_preview_is_truncated bit,
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Note]
    SET
        [hs_note_body] = @hs_note_body,
        [hs_timestamp] = @hs_timestamp,
        [hubspot_owner_id] = @hubspot_owner_id,
        [hs_attachment_ids] = @hs_attachment_ids,
        [hs_body_preview] = @hs_body_preview,
        [hs_body_preview_is_truncated] = @hs_body_preview_is_truncated,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwNotes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwNotes]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateNote] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Note table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateNote]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateNote];
GO
CREATE TRIGGER [HubSpot].trgUpdateNote
ON [HubSpot].[Note]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Note]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[Note] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Notes */

GRANT EXECUTE ON [HubSpot].[spUpdateNote] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Notes
-- Item: spDeleteNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Note
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteNote]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteNote];
GO

CREATE PROCEDURE [HubSpot].[spDeleteNote]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[Note]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteNote] TO [cdp_Integration]
    

/* spDelete Permissions for Notes */

GRANT EXECUTE ON [HubSpot].[spDeleteNote] TO [cdp_Integration]



/* Index for Foreign Keys for PaymentProcessor */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Processors
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for PersonID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Person IDs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for ProductCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Product Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Product */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Product */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products__HubSpot
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Payment Processors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Processors
-- Item: vwPaymentProcessors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Payment Processors
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  PaymentProcessor
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwPaymentProcessors]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwPaymentProcessors];
GO

CREATE VIEW [YourMembership].[vwPaymentProcessors]
AS
SELECT
    p.*
FROM
    [YourMembership].[PaymentProcessor] AS p
GO
GRANT SELECT ON [YourMembership].[vwPaymentProcessors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Payment Processors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Processors
-- Item: Permissions for vwPaymentProcessors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwPaymentProcessors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Payment Processors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Processors
-- Item: spCreatePaymentProcessor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentProcessor
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreatePaymentProcessor]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreatePaymentProcessor];
GO

CREATE PROCEDURE [YourMembership].[spCreatePaymentProcessor]
    @Id int = NULL,
    @Name nvarchar(200),
    @Active bit,
    @Primary bit,
    @CardOrderType nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[PaymentProcessor]
        (
            [Id],
                [Name],
                [Active],
                [Primary],
                [CardOrderType],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @Id,
                @Name,
                @Active,
                @Primary,
                @CardOrderType,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwPaymentProcessors] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreatePaymentProcessor] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Payment Processors */

GRANT EXECUTE ON [YourMembership].[spCreatePaymentProcessor] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Payment Processors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Processors
-- Item: spUpdatePaymentProcessor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProcessor
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdatePaymentProcessor]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdatePaymentProcessor];
GO

CREATE PROCEDURE [YourMembership].[spUpdatePaymentProcessor]
    @Id int,
    @Name nvarchar(200),
    @Active bit,
    @Primary bit,
    @CardOrderType nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[PaymentProcessor]
    SET
        [Name] = @Name,
        [Active] = @Active,
        [Primary] = @Primary,
        [CardOrderType] = @CardOrderType,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwPaymentProcessors] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwPaymentProcessors]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdatePaymentProcessor] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentProcessor table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdatePaymentProcessor]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdatePaymentProcessor];
GO
CREATE TRIGGER [YourMembership].trgUpdatePaymentProcessor
ON [YourMembership].[PaymentProcessor]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[PaymentProcessor]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[PaymentProcessor] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO
        

/* spUpdate Permissions for Payment Processors */

GRANT EXECUTE ON [YourMembership].[spUpdatePaymentProcessor] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Person IDs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Person IDs
-- Item: vwPersonIDs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Person IDs
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  PersonID
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwPersonIDs]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwPersonIDs];
GO

CREATE VIEW [YourMembership].[vwPersonIDs]
AS
SELECT
    p.*
FROM
    [YourMembership].[PersonID] AS p
GO
GRANT SELECT ON [YourMembership].[vwPersonIDs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Person IDs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Person IDs
-- Item: Permissions for vwPersonIDs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwPersonIDs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Person IDs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Person IDs
-- Item: spCreatePersonID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PersonID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreatePersonID]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreatePersonID];
GO

CREATE PROCEDURE [YourMembership].[spCreatePersonID]
    @ID int = NULL,
    @UserType nvarchar(200),
    @DateRegistered datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[PersonID]
        (
            [ID],
                [UserType],
                [DateRegistered],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @ID,
                @UserType,
                @DateRegistered,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwPersonIDs] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreatePersonID] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Person IDs */

GRANT EXECUTE ON [YourMembership].[spCreatePersonID] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Person IDs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Person IDs
-- Item: spUpdatePersonID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PersonID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdatePersonID]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdatePersonID];
GO

CREATE PROCEDURE [YourMembership].[spUpdatePersonID]
    @ID int,
    @UserType nvarchar(200),
    @DateRegistered datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[PersonID]
    SET
        [UserType] = @UserType,
        [DateRegistered] = @DateRegistered,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwPersonIDs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwPersonIDs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdatePersonID] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PersonID table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdatePersonID]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdatePersonID];
GO
CREATE TRIGGER [YourMembership].trgUpdatePersonID
ON [YourMembership].[PersonID]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[PersonID]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[PersonID] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Person IDs */

GRANT EXECUTE ON [YourMembership].[spUpdatePersonID] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Product Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Product Categories
-- Item: vwProductCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Product Categories
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  ProductCategory
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwProductCategories]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwProductCategories];
GO

CREATE VIEW [YourMembership].[vwProductCategories]
AS
SELECT
    p.*
FROM
    [YourMembership].[ProductCategory] AS p
GO
GRANT SELECT ON [YourMembership].[vwProductCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Product Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Product Categories
-- Item: Permissions for vwProductCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwProductCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Product Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Product Categories
-- Item: spCreateProductCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProductCategory
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateProductCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateProductCategory];
GO

CREATE PROCEDURE [YourMembership].[spCreateProductCategory]
    @Id int = NULL,
    @Name nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[ProductCategory]
        (
            [Id],
                [Name],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @Id,
                @Name,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwProductCategories] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateProductCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Product Categories */

GRANT EXECUTE ON [YourMembership].[spCreateProductCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Product Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Product Categories
-- Item: spUpdateProductCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductCategory
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateProductCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateProductCategory];
GO

CREATE PROCEDURE [YourMembership].[spUpdateProductCategory]
    @Id int,
    @Name nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[ProductCategory]
    SET
        [Name] = @Name,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwProductCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwProductCategories]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateProductCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductCategory table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateProductCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateProductCategory];
GO
CREATE TRIGGER [YourMembership].trgUpdateProductCategory
ON [YourMembership].[ProductCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[ProductCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[ProductCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO
        

/* spUpdate Permissions for Product Categories */

GRANT EXECUTE ON [YourMembership].[spUpdateProductCategory] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Products
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  Product
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwProducts]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwProducts];
GO

CREATE VIEW [YourMembership].[vwProducts]
AS
SELECT
    p.*
FROM
    [YourMembership].[Product] AS p
GO
GRANT SELECT ON [YourMembership].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: Permissions for vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spCreateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateProduct];
GO

CREATE PROCEDURE [YourMembership].[spCreateProduct]
    @id int = NULL,
    @description nvarchar(500),
    @amount decimal(18, 2),
    @weight decimal(18, 2),
    @taxRate decimal(18, 2),
    @quantity int,
    @ProductActive bit,
    @IsFeatured bit,
    @ListInStore bit,
    @taxable bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[Product]
        (
            [id],
                [description],
                [amount],
                [weight],
                [taxRate],
                [quantity],
                [ProductActive],
                [IsFeatured],
                [ListInStore],
                [taxable],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @id,
                @description,
                @amount,
                @weight,
                @taxRate,
                @quantity,
                @ProductActive,
                @IsFeatured,
                @ListInStore,
                @taxable,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwProducts] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateProduct] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Products */

GRANT EXECUTE ON [YourMembership].[spCreateProduct] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spUpdateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateProduct];
GO

CREATE PROCEDURE [YourMembership].[spUpdateProduct]
    @id int,
    @description nvarchar(500),
    @amount decimal(18, 2),
    @weight decimal(18, 2),
    @taxRate decimal(18, 2),
    @quantity int,
    @ProductActive bit,
    @IsFeatured bit,
    @ListInStore bit,
    @taxable bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Product]
    SET
        [description] = @description,
        [amount] = @amount,
        [weight] = @weight,
        [taxRate] = @taxRate,
        [quantity] = @quantity,
        [ProductActive] = @ProductActive,
        [IsFeatured] = @IsFeatured,
        [ListInStore] = @ListInStore,
        [taxable] = @taxable,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [id] = @id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwProducts]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Product table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateProduct]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateProduct];
GO
CREATE TRIGGER [YourMembership].trgUpdateProduct
ON [YourMembership].[Product]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[Product]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[Product] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO
        

/* spUpdate Permissions for Products */

GRANT EXECUTE ON [YourMembership].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Products__HubSpot */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products__HubSpot
-- Item: vwProducts__HubSpot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Products__HubSpot
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  Product
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwProducts__HubSpot]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwProducts__HubSpot];
GO

CREATE VIEW [HubSpot].[vwProducts__HubSpot]
AS
SELECT
    p.*
FROM
    [HubSpot].[Product] AS p
GO
GRANT SELECT ON [HubSpot].[vwProducts__HubSpot] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Products__HubSpot */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products__HubSpot
-- Item: Permissions for vwProducts__HubSpot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwProducts__HubSpot] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Products__HubSpot */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products__HubSpot
-- Item: spCreateProduct__HubSpot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateProduct__HubSpot]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateProduct__HubSpot];
GO

CREATE PROCEDURE [HubSpot].[spCreateProduct__HubSpot]
    @hs_object_id nvarchar(100) = NULL,
    @name nvarchar(500),
    @description nvarchar(MAX),
    @price decimal(18, 2),
    @hs_cost_of_goods_sold decimal(18, 2),
    @hs_recurring_billing_period nvarchar(500),
    @hs_sku nvarchar(500),
    @tax decimal(18, 2),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[Product]
        (
            [hs_object_id],
                [name],
                [description],
                [price],
                [hs_cost_of_goods_sold],
                [hs_recurring_billing_period],
                [hs_sku],
                [tax],
                [createdate],
                [hs_lastmodifieddate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @name,
                @description,
                @price,
                @hs_cost_of_goods_sold,
                @hs_recurring_billing_period,
                @hs_sku,
                @tax,
                @createdate,
                @hs_lastmodifieddate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwProducts__HubSpot] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateProduct__HubSpot] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Products__HubSpot */

GRANT EXECUTE ON [HubSpot].[spCreateProduct__HubSpot] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Products__HubSpot */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products__HubSpot
-- Item: spUpdateProduct__HubSpot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateProduct__HubSpot]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateProduct__HubSpot];
GO

CREATE PROCEDURE [HubSpot].[spUpdateProduct__HubSpot]
    @hs_object_id nvarchar(100),
    @name nvarchar(500),
    @description nvarchar(MAX),
    @price decimal(18, 2),
    @hs_cost_of_goods_sold decimal(18, 2),
    @hs_recurring_billing_period nvarchar(500),
    @hs_sku nvarchar(500),
    @tax decimal(18, 2),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Product]
    SET
        [name] = @name,
        [description] = @description,
        [price] = @price,
        [hs_cost_of_goods_sold] = @hs_cost_of_goods_sold,
        [hs_recurring_billing_period] = @hs_recurring_billing_period,
        [hs_sku] = @hs_sku,
        [tax] = @tax,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwProducts__HubSpot] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwProducts__HubSpot]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateProduct__HubSpot] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Product table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateProduct__HubSpot]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateProduct__HubSpot];
GO
CREATE TRIGGER [HubSpot].trgUpdateProduct__HubSpot
ON [HubSpot].[Product]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Product]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[Product] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Products__HubSpot */

GRANT EXECUTE ON [HubSpot].[spUpdateProduct__HubSpot] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Payment Processors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Processors
-- Item: spDeletePaymentProcessor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentProcessor
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeletePaymentProcessor]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeletePaymentProcessor];
GO

CREATE PROCEDURE [YourMembership].[spDeletePaymentProcessor]
    @Id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[PaymentProcessor]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeletePaymentProcessor] TO [cdp_Integration]
    

/* spDelete Permissions for Payment Processors */

GRANT EXECUTE ON [YourMembership].[spDeletePaymentProcessor] TO [cdp_Integration]



/* spDelete SQL for Person IDs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Person IDs
-- Item: spDeletePersonID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PersonID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeletePersonID]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeletePersonID];
GO

CREATE PROCEDURE [YourMembership].[spDeletePersonID]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[PersonID]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeletePersonID] TO [cdp_Integration]
    

/* spDelete Permissions for Person IDs */

GRANT EXECUTE ON [YourMembership].[spDeletePersonID] TO [cdp_Integration]



/* spDelete SQL for Product Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Product Categories
-- Item: spDeleteProductCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProductCategory
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteProductCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteProductCategory];
GO

CREATE PROCEDURE [YourMembership].[spDeleteProductCategory]
    @Id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[ProductCategory]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteProductCategory] TO [cdp_Integration]
    

/* spDelete Permissions for Product Categories */

GRANT EXECUTE ON [YourMembership].[spDeleteProductCategory] TO [cdp_Integration]



/* spDelete SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spDeleteProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteProduct];
GO

CREATE PROCEDURE [YourMembership].[spDeleteProduct]
    @id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[Product]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteProduct] TO [cdp_Integration]
    

/* spDelete Permissions for Products */

GRANT EXECUTE ON [YourMembership].[spDeleteProduct] TO [cdp_Integration]



/* spDelete SQL for Products__HubSpot */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products__HubSpot
-- Item: spDeleteProduct__HubSpot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteProduct__HubSpot]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteProduct__HubSpot];
GO

CREATE PROCEDURE [HubSpot].[spDeleteProduct__HubSpot]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[Product]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteProduct__HubSpot] TO [cdp_Integration]
    

/* spDelete Permissions for Products__HubSpot */

GRANT EXECUTE ON [HubSpot].[spDeleteProduct__HubSpot] TO [cdp_Integration]



/* Index for Foreign Keys for QBClass */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: QB Classes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Quote */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Quotes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for ShippingMethod */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shipping Methods
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for SponsorRotator */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Sponsor Rotators
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for StoreOrderDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Order Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderID in table StoreOrderDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_StoreOrderDetail_OrderID' 
    AND object_id = OBJECT_ID('[YourMembership].[StoreOrderDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_StoreOrderDetail_OrderID ON [YourMembership].[StoreOrderDetail] ([OrderID]);

-- Index for foreign key WebsiteMemberID in table StoreOrderDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_StoreOrderDetail_WebsiteMemberID' 
    AND object_id = OBJECT_ID('[YourMembership].[StoreOrderDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_StoreOrderDetail_WebsiteMemberID ON [YourMembership].[StoreOrderDetail] ([WebsiteMemberID]);

-- Index for foreign key ShippingMethod in table StoreOrderDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_StoreOrderDetail_ShippingMethod' 
    AND object_id = OBJECT_ID('[YourMembership].[StoreOrderDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_StoreOrderDetail_ShippingMethod ON [YourMembership].[StoreOrderDetail] ([ShippingMethod]);

/* Base View SQL for QB Classes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: QB Classes
-- Item: vwQBClasses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      QB Classes
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  QBClass
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwQBClasses]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwQBClasses];
GO

CREATE VIEW [YourMembership].[vwQBClasses]
AS
SELECT
    q.*
FROM
    [YourMembership].[QBClass] AS q
GO
GRANT SELECT ON [YourMembership].[vwQBClasses] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for QB Classes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: QB Classes
-- Item: Permissions for vwQBClasses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwQBClasses] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for QB Classes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: QB Classes
-- Item: spCreateQBClass
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QBClass
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateQBClass]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateQBClass];
GO

CREATE PROCEDURE [YourMembership].[spCreateQBClass]
    @Id int = NULL,
    @Name nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[QBClass]
        (
            [Id],
                [Name],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @Id,
                @Name,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwQBClasses] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateQBClass] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for QB Classes */

GRANT EXECUTE ON [YourMembership].[spCreateQBClass] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for QB Classes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: QB Classes
-- Item: spUpdateQBClass
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QBClass
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateQBClass]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateQBClass];
GO

CREATE PROCEDURE [YourMembership].[spUpdateQBClass]
    @Id int,
    @Name nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[QBClass]
    SET
        [Name] = @Name,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwQBClasses] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwQBClasses]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateQBClass] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QBClass table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateQBClass]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateQBClass];
GO
CREATE TRIGGER [YourMembership].trgUpdateQBClass
ON [YourMembership].[QBClass]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[QBClass]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[QBClass] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO
        

/* spUpdate Permissions for QB Classes */

GRANT EXECUTE ON [YourMembership].[spUpdateQBClass] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Quotes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Quotes
-- Item: vwQuotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Quotes
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  Quote
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwQuotes]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwQuotes];
GO

CREATE VIEW [HubSpot].[vwQuotes]
AS
SELECT
    q.*
FROM
    [HubSpot].[Quote] AS q
GO
GRANT SELECT ON [HubSpot].[vwQuotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Quotes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Quotes
-- Item: Permissions for vwQuotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwQuotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Quotes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Quotes
-- Item: spCreateQuote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Quote
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateQuote]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateQuote];
GO

CREATE PROCEDURE [HubSpot].[spCreateQuote]
    @hs_object_id nvarchar(100) = NULL,
    @hs_title nvarchar(500),
    @hs_expiration_date datetimeoffset,
    @hs_status nvarchar(500),
    @hs_quote_amount decimal(18, 2),
    @hs_currency nvarchar(500),
    @hs_sender_firstname nvarchar(500),
    @hs_sender_lastname nvarchar(500),
    @hs_sender_email nvarchar(500),
    @hs_sender_company_name nvarchar(500),
    @hs_language nvarchar(500),
    @hs_locale nvarchar(500),
    @hs_slug nvarchar(500),
    @hs_public_url_key nvarchar(500),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[Quote]
        (
            [hs_object_id],
                [hs_title],
                [hs_expiration_date],
                [hs_status],
                [hs_quote_amount],
                [hs_currency],
                [hs_sender_firstname],
                [hs_sender_lastname],
                [hs_sender_email],
                [hs_sender_company_name],
                [hs_language],
                [hs_locale],
                [hs_slug],
                [hs_public_url_key],
                [createdate],
                [hs_lastmodifieddate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @hs_title,
                @hs_expiration_date,
                @hs_status,
                @hs_quote_amount,
                @hs_currency,
                @hs_sender_firstname,
                @hs_sender_lastname,
                @hs_sender_email,
                @hs_sender_company_name,
                @hs_language,
                @hs_locale,
                @hs_slug,
                @hs_public_url_key,
                @createdate,
                @hs_lastmodifieddate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwQuotes] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateQuote] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Quotes */

GRANT EXECUTE ON [HubSpot].[spCreateQuote] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Quotes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Quotes
-- Item: spUpdateQuote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Quote
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateQuote]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateQuote];
GO

CREATE PROCEDURE [HubSpot].[spUpdateQuote]
    @hs_object_id nvarchar(100),
    @hs_title nvarchar(500),
    @hs_expiration_date datetimeoffset,
    @hs_status nvarchar(500),
    @hs_quote_amount decimal(18, 2),
    @hs_currency nvarchar(500),
    @hs_sender_firstname nvarchar(500),
    @hs_sender_lastname nvarchar(500),
    @hs_sender_email nvarchar(500),
    @hs_sender_company_name nvarchar(500),
    @hs_language nvarchar(500),
    @hs_locale nvarchar(500),
    @hs_slug nvarchar(500),
    @hs_public_url_key nvarchar(500),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Quote]
    SET
        [hs_title] = @hs_title,
        [hs_expiration_date] = @hs_expiration_date,
        [hs_status] = @hs_status,
        [hs_quote_amount] = @hs_quote_amount,
        [hs_currency] = @hs_currency,
        [hs_sender_firstname] = @hs_sender_firstname,
        [hs_sender_lastname] = @hs_sender_lastname,
        [hs_sender_email] = @hs_sender_email,
        [hs_sender_company_name] = @hs_sender_company_name,
        [hs_language] = @hs_language,
        [hs_locale] = @hs_locale,
        [hs_slug] = @hs_slug,
        [hs_public_url_key] = @hs_public_url_key,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwQuotes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwQuotes]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateQuote] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Quote table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateQuote]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateQuote];
GO
CREATE TRIGGER [HubSpot].trgUpdateQuote
ON [HubSpot].[Quote]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Quote]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[Quote] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Quotes */

GRANT EXECUTE ON [HubSpot].[spUpdateQuote] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Shipping Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shipping Methods
-- Item: vwShippingMethods
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Shipping Methods
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  ShippingMethod
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwShippingMethods]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwShippingMethods];
GO

CREATE VIEW [YourMembership].[vwShippingMethods]
AS
SELECT
    s.*
FROM
    [YourMembership].[ShippingMethod] AS s
GO
GRANT SELECT ON [YourMembership].[vwShippingMethods] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Shipping Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shipping Methods
-- Item: Permissions for vwShippingMethods
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwShippingMethods] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Shipping Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shipping Methods
-- Item: spCreateShippingMethod
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ShippingMethod
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateShippingMethod]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateShippingMethod];
GO

CREATE PROCEDURE [YourMembership].[spCreateShippingMethod]
    @id int = NULL,
    @method nvarchar(200),
    @basePrice decimal(18, 2),
    @pricePerWeightUnit decimal(18, 2),
    @isDefault bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[ShippingMethod]
        (
            [id],
                [method],
                [basePrice],
                [pricePerWeightUnit],
                [isDefault],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @id,
                @method,
                @basePrice,
                @pricePerWeightUnit,
                @isDefault,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwShippingMethods] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateShippingMethod] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Shipping Methods */

GRANT EXECUTE ON [YourMembership].[spCreateShippingMethod] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Shipping Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shipping Methods
-- Item: spUpdateShippingMethod
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ShippingMethod
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateShippingMethod]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateShippingMethod];
GO

CREATE PROCEDURE [YourMembership].[spUpdateShippingMethod]
    @id int,
    @method nvarchar(200),
    @basePrice decimal(18, 2),
    @pricePerWeightUnit decimal(18, 2),
    @isDefault bit,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[ShippingMethod]
    SET
        [method] = @method,
        [basePrice] = @basePrice,
        [pricePerWeightUnit] = @pricePerWeightUnit,
        [isDefault] = @isDefault,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [id] = @id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwShippingMethods] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwShippingMethods]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateShippingMethod] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ShippingMethod table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateShippingMethod]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateShippingMethod];
GO
CREATE TRIGGER [YourMembership].trgUpdateShippingMethod
ON [YourMembership].[ShippingMethod]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[ShippingMethod]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[ShippingMethod] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO
        

/* spUpdate Permissions for Shipping Methods */

GRANT EXECUTE ON [YourMembership].[spUpdateShippingMethod] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Sponsor Rotators */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Sponsor Rotators
-- Item: vwSponsorRotators
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Sponsor Rotators
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  SponsorRotator
-----               PRIMARY KEY: RotatorId
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwSponsorRotators]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwSponsorRotators];
GO

CREATE VIEW [YourMembership].[vwSponsorRotators]
AS
SELECT
    s.*
FROM
    [YourMembership].[SponsorRotator] AS s
GO
GRANT SELECT ON [YourMembership].[vwSponsorRotators] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Sponsor Rotators */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Sponsor Rotators
-- Item: Permissions for vwSponsorRotators
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwSponsorRotators] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Sponsor Rotators */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Sponsor Rotators
-- Item: spCreateSponsorRotator
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SponsorRotator
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateSponsorRotator]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateSponsorRotator];
GO

CREATE PROCEDURE [YourMembership].[spCreateSponsorRotator]
    @RotatorId int = NULL,
    @AutoScroll bit,
    @Random bit,
    @DateAdded datetimeoffset,
    @Mode int,
    @Orientation nvarchar(200),
    @SchoolId int,
    @Speed int,
    @Title nvarchar(200),
    @ClientId int,
    @Heading nvarchar(200),
    @Height int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[SponsorRotator]
        (
            [RotatorId],
                [AutoScroll],
                [Random],
                [DateAdded],
                [Mode],
                [Orientation],
                [SchoolId],
                [Speed],
                [Title],
                [ClientId],
                [Heading],
                [Height],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @RotatorId,
                @AutoScroll,
                @Random,
                @DateAdded,
                @Mode,
                @Orientation,
                @SchoolId,
                @Speed,
                @Title,
                @ClientId,
                @Heading,
                @Height,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwSponsorRotators] WHERE [RotatorId] = @RotatorId
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateSponsorRotator] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Sponsor Rotators */

GRANT EXECUTE ON [YourMembership].[spCreateSponsorRotator] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Sponsor Rotators */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Sponsor Rotators
-- Item: spUpdateSponsorRotator
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SponsorRotator
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateSponsorRotator]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateSponsorRotator];
GO

CREATE PROCEDURE [YourMembership].[spUpdateSponsorRotator]
    @RotatorId int,
    @AutoScroll bit,
    @Random bit,
    @DateAdded datetimeoffset,
    @Mode int,
    @Orientation nvarchar(200),
    @SchoolId int,
    @Speed int,
    @Title nvarchar(200),
    @ClientId int,
    @Heading nvarchar(200),
    @Height int,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[SponsorRotator]
    SET
        [AutoScroll] = @AutoScroll,
        [Random] = @Random,
        [DateAdded] = @DateAdded,
        [Mode] = @Mode,
        [Orientation] = @Orientation,
        [SchoolId] = @SchoolId,
        [Speed] = @Speed,
        [Title] = @Title,
        [ClientId] = @ClientId,
        [Heading] = @Heading,
        [Height] = @Height,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [RotatorId] = @RotatorId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwSponsorRotators] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwSponsorRotators]
                                    WHERE
                                        [RotatorId] = @RotatorId
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateSponsorRotator] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SponsorRotator table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateSponsorRotator]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateSponsorRotator];
GO
CREATE TRIGGER [YourMembership].trgUpdateSponsorRotator
ON [YourMembership].[SponsorRotator]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[SponsorRotator]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[SponsorRotator] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[RotatorId] = I.[RotatorId];
END;
GO
        

/* spUpdate Permissions for Sponsor Rotators */

GRANT EXECUTE ON [YourMembership].[spUpdateSponsorRotator] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Store Order Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Order Details
-- Item: vwStoreOrderDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Store Order Details
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  StoreOrderDetail
-----               PRIMARY KEY: OrderDetailID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwStoreOrderDetails]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwStoreOrderDetails];
GO

CREATE VIEW [YourMembership].[vwStoreOrderDetails]
AS
SELECT
    s.*
FROM
    [YourMembership].[StoreOrderDetail] AS s
GO
GRANT SELECT ON [YourMembership].[vwStoreOrderDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Store Order Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Order Details
-- Item: Permissions for vwStoreOrderDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwStoreOrderDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Store Order Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Order Details
-- Item: spCreateStoreOrderDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR StoreOrderDetail
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateStoreOrderDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateStoreOrderDetail];
GO

CREATE PROCEDURE [YourMembership].[spCreateStoreOrderDetail]
    @OrderDetailID int = NULL,
    @OrderID int,
    @WebsiteMemberID int,
    @ProductName nvarchar(200),
    @Quantity int,
    @UnitPrice decimal(18, 2),
    @TotalPrice decimal(18, 2),
    @OrderDate datetimeoffset,
    @Status nvarchar(200),
    @ShippingMethod nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[StoreOrderDetail]
        (
            [OrderDetailID],
                [OrderID],
                [WebsiteMemberID],
                [ProductName],
                [Quantity],
                [UnitPrice],
                [TotalPrice],
                [OrderDate],
                [Status],
                [ShippingMethod],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @OrderDetailID,
                @OrderID,
                @WebsiteMemberID,
                @ProductName,
                @Quantity,
                @UnitPrice,
                @TotalPrice,
                @OrderDate,
                @Status,
                @ShippingMethod,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwStoreOrderDetails] WHERE [OrderDetailID] = @OrderDetailID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateStoreOrderDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Store Order Details */

GRANT EXECUTE ON [YourMembership].[spCreateStoreOrderDetail] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Store Order Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Order Details
-- Item: spUpdateStoreOrderDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR StoreOrderDetail
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateStoreOrderDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateStoreOrderDetail];
GO

CREATE PROCEDURE [YourMembership].[spUpdateStoreOrderDetail]
    @OrderDetailID int,
    @OrderID int,
    @WebsiteMemberID int,
    @ProductName nvarchar(200),
    @Quantity int,
    @UnitPrice decimal(18, 2),
    @TotalPrice decimal(18, 2),
    @OrderDate datetimeoffset,
    @Status nvarchar(200),
    @ShippingMethod nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[StoreOrderDetail]
    SET
        [OrderID] = @OrderID,
        [WebsiteMemberID] = @WebsiteMemberID,
        [ProductName] = @ProductName,
        [Quantity] = @Quantity,
        [UnitPrice] = @UnitPrice,
        [TotalPrice] = @TotalPrice,
        [OrderDate] = @OrderDate,
        [Status] = @Status,
        [ShippingMethod] = @ShippingMethod,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [OrderDetailID] = @OrderDetailID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwStoreOrderDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwStoreOrderDetails]
                                    WHERE
                                        [OrderDetailID] = @OrderDetailID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateStoreOrderDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the StoreOrderDetail table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateStoreOrderDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateStoreOrderDetail];
GO
CREATE TRIGGER [YourMembership].trgUpdateStoreOrderDetail
ON [YourMembership].[StoreOrderDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[StoreOrderDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[StoreOrderDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[OrderDetailID] = I.[OrderDetailID];
END;
GO
        

/* spUpdate Permissions for Store Order Details */

GRANT EXECUTE ON [YourMembership].[spUpdateStoreOrderDetail] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for QB Classes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: QB Classes
-- Item: spDeleteQBClass
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QBClass
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteQBClass]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteQBClass];
GO

CREATE PROCEDURE [YourMembership].[spDeleteQBClass]
    @Id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[QBClass]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteQBClass] TO [cdp_Integration]
    

/* spDelete Permissions for QB Classes */

GRANT EXECUTE ON [YourMembership].[spDeleteQBClass] TO [cdp_Integration]



/* spDelete SQL for Quotes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Quotes
-- Item: spDeleteQuote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Quote
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteQuote]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteQuote];
GO

CREATE PROCEDURE [HubSpot].[spDeleteQuote]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[Quote]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteQuote] TO [cdp_Integration]
    

/* spDelete Permissions for Quotes */

GRANT EXECUTE ON [HubSpot].[spDeleteQuote] TO [cdp_Integration]



/* spDelete SQL for Shipping Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shipping Methods
-- Item: spDeleteShippingMethod
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ShippingMethod
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteShippingMethod]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteShippingMethod];
GO

CREATE PROCEDURE [YourMembership].[spDeleteShippingMethod]
    @id int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[ShippingMethod]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteShippingMethod] TO [cdp_Integration]
    

/* spDelete Permissions for Shipping Methods */

GRANT EXECUTE ON [YourMembership].[spDeleteShippingMethod] TO [cdp_Integration]



/* spDelete SQL for Sponsor Rotators */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Sponsor Rotators
-- Item: spDeleteSponsorRotator
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SponsorRotator
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteSponsorRotator]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteSponsorRotator];
GO

CREATE PROCEDURE [YourMembership].[spDeleteSponsorRotator]
    @RotatorId int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[SponsorRotator]
    WHERE
        [RotatorId] = @RotatorId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [RotatorId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @RotatorId AS [RotatorId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteSponsorRotator] TO [cdp_Integration]
    

/* spDelete Permissions for Sponsor Rotators */

GRANT EXECUTE ON [YourMembership].[spDeleteSponsorRotator] TO [cdp_Integration]



/* spDelete SQL for Store Order Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Order Details
-- Item: spDeleteStoreOrderDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR StoreOrderDetail
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteStoreOrderDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteStoreOrderDetail];
GO

CREATE PROCEDURE [YourMembership].[spDeleteStoreOrderDetail]
    @OrderDetailID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[StoreOrderDetail]
    WHERE
        [OrderDetailID] = @OrderDetailID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [OrderDetailID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @OrderDetailID AS [OrderDetailID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteStoreOrderDetail] TO [cdp_Integration]
    

/* spDelete Permissions for Store Order Details */

GRANT EXECUTE ON [YourMembership].[spDeleteStoreOrderDetail] TO [cdp_Integration]



/* Index for Foreign Keys for StoreOrder */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Orders
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key WebsiteMemberID in table StoreOrder
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_StoreOrder_WebsiteMemberID' 
    AND object_id = OBJECT_ID('[YourMembership].[StoreOrder]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_StoreOrder_WebsiteMemberID ON [YourMembership].[StoreOrder] ([WebsiteMemberID]);

-- Index for foreign key ShippingMethod in table StoreOrder
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_StoreOrder_ShippingMethod' 
    AND object_id = OBJECT_ID('[YourMembership].[StoreOrder]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_StoreOrder_ShippingMethod ON [YourMembership].[StoreOrder] ([ShippingMethod]);

/* Index for Foreign Keys for Task */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Ticket */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for TimeZone */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Time Zones
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Store Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Orders
-- Item: vwStoreOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Store Orders
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  StoreOrder
-----               PRIMARY KEY: OrderID
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwStoreOrders]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwStoreOrders];
GO

CREATE VIEW [YourMembership].[vwStoreOrders]
AS
SELECT
    s.*
FROM
    [YourMembership].[StoreOrder] AS s
GO
GRANT SELECT ON [YourMembership].[vwStoreOrders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Store Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Orders
-- Item: Permissions for vwStoreOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwStoreOrders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Store Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Orders
-- Item: spCreateStoreOrder
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR StoreOrder
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateStoreOrder]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateStoreOrder];
GO

CREATE PROCEDURE [YourMembership].[spCreateStoreOrder]
    @OrderID int = NULL,
    @WebsiteMemberID int,
    @OrderDate datetimeoffset,
    @Status nvarchar(200),
    @TotalAmount decimal(18, 2),
    @ShippingMethod nvarchar(200),
    @TrackingNumber nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[StoreOrder]
        (
            [OrderID],
                [WebsiteMemberID],
                [OrderDate],
                [Status],
                [TotalAmount],
                [ShippingMethod],
                [TrackingNumber],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @OrderID,
                @WebsiteMemberID,
                @OrderDate,
                @Status,
                @TotalAmount,
                @ShippingMethod,
                @TrackingNumber,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwStoreOrders] WHERE [OrderID] = @OrderID
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateStoreOrder] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Store Orders */

GRANT EXECUTE ON [YourMembership].[spCreateStoreOrder] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Store Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Orders
-- Item: spUpdateStoreOrder
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR StoreOrder
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateStoreOrder]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateStoreOrder];
GO

CREATE PROCEDURE [YourMembership].[spUpdateStoreOrder]
    @OrderID int,
    @WebsiteMemberID int,
    @OrderDate datetimeoffset,
    @Status nvarchar(200),
    @TotalAmount decimal(18, 2),
    @ShippingMethod nvarchar(200),
    @TrackingNumber nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[StoreOrder]
    SET
        [WebsiteMemberID] = @WebsiteMemberID,
        [OrderDate] = @OrderDate,
        [Status] = @Status,
        [TotalAmount] = @TotalAmount,
        [ShippingMethod] = @ShippingMethod,
        [TrackingNumber] = @TrackingNumber,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [OrderID] = @OrderID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwStoreOrders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwStoreOrders]
                                    WHERE
                                        [OrderID] = @OrderID
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateStoreOrder] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the StoreOrder table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateStoreOrder]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateStoreOrder];
GO
CREATE TRIGGER [YourMembership].trgUpdateStoreOrder
ON [YourMembership].[StoreOrder]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[StoreOrder]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[StoreOrder] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[OrderID] = I.[OrderID];
END;
GO
        

/* spUpdate Permissions for Store Orders */

GRANT EXECUTE ON [YourMembership].[spUpdateStoreOrder] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Tasks
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  Task
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwTasks]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwTasks];
GO

CREATE VIEW [HubSpot].[vwTasks]
AS
SELECT
    t.*
FROM
    [HubSpot].[Task] AS t
GO
GRANT SELECT ON [HubSpot].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: Permissions for vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: spCreateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Task
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateTask]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateTask];
GO

CREATE PROCEDURE [HubSpot].[spCreateTask]
    @hs_object_id nvarchar(100) = NULL,
    @hs_task_subject nvarchar(500),
    @hs_task_body nvarchar(MAX),
    @hs_task_status nvarchar(500),
    @hs_task_priority nvarchar(500),
    @hs_task_type nvarchar(500),
    @hs_timestamp datetimeoffset,
    @hs_task_completion_date nvarchar(255),
    @hs_queue_membership_ids nvarchar(500),
    @hubspot_owner_id nvarchar(100),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[Task]
        (
            [hs_object_id],
                [hs_task_subject],
                [hs_task_body],
                [hs_task_status],
                [hs_task_priority],
                [hs_task_type],
                [hs_timestamp],
                [hs_task_completion_date],
                [hs_queue_membership_ids],
                [hubspot_owner_id],
                [createdate],
                [hs_lastmodifieddate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @hs_task_subject,
                @hs_task_body,
                @hs_task_status,
                @hs_task_priority,
                @hs_task_type,
                @hs_timestamp,
                @hs_task_completion_date,
                @hs_queue_membership_ids,
                @hubspot_owner_id,
                @createdate,
                @hs_lastmodifieddate,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwTasks] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateTask] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Tasks */

GRANT EXECUTE ON [HubSpot].[spCreateTask] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: spUpdateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Task
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateTask]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateTask];
GO

CREATE PROCEDURE [HubSpot].[spUpdateTask]
    @hs_object_id nvarchar(100),
    @hs_task_subject nvarchar(500),
    @hs_task_body nvarchar(MAX),
    @hs_task_status nvarchar(500),
    @hs_task_priority nvarchar(500),
    @hs_task_type nvarchar(500),
    @hs_timestamp datetimeoffset,
    @hs_task_completion_date nvarchar(255),
    @hs_queue_membership_ids nvarchar(500),
    @hubspot_owner_id nvarchar(100),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Task]
    SET
        [hs_task_subject] = @hs_task_subject,
        [hs_task_body] = @hs_task_body,
        [hs_task_status] = @hs_task_status,
        [hs_task_priority] = @hs_task_priority,
        [hs_task_type] = @hs_task_type,
        [hs_timestamp] = @hs_timestamp,
        [hs_task_completion_date] = @hs_task_completion_date,
        [hs_queue_membership_ids] = @hs_queue_membership_ids,
        [hubspot_owner_id] = @hubspot_owner_id,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwTasks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwTasks]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateTask] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Task table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateTask]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateTask];
GO
CREATE TRIGGER [HubSpot].trgUpdateTask
ON [HubSpot].[Task]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Task]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[Task] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Tasks */

GRANT EXECUTE ON [HubSpot].[spUpdateTask] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: vwTickets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Tickets
-----               SCHEMA:      HubSpot
-----               BASE TABLE:  Ticket
-----               PRIMARY KEY: hs_object_id
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[vwTickets]', 'V') IS NOT NULL
    DROP VIEW [HubSpot].[vwTickets];
GO

CREATE VIEW [HubSpot].[vwTickets]
AS
SELECT
    t.*
FROM
    [HubSpot].[Ticket] AS t
GO
GRANT SELECT ON [HubSpot].[vwTickets] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: Permissions for vwTickets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [HubSpot].[vwTickets] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: spCreateTicket
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Ticket
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spCreateTicket]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spCreateTicket];
GO

CREATE PROCEDURE [HubSpot].[spCreateTicket]
    @hs_object_id nvarchar(100) = NULL,
    @subject nvarchar(500),
    @content nvarchar(MAX),
    @hs_pipeline nvarchar(500),
    @hs_pipeline_stage nvarchar(500),
    @hs_ticket_priority nvarchar(500),
    @hs_ticket_category nvarchar(500),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @closed_date datetimeoffset,
    @source_type nvarchar(500),
    @hubspot_owner_id nvarchar(100),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [HubSpot].[Ticket]
        (
            [hs_object_id],
                [subject],
                [content],
                [hs_pipeline],
                [hs_pipeline_stage],
                [hs_ticket_priority],
                [hs_ticket_category],
                [createdate],
                [hs_lastmodifieddate],
                [closed_date],
                [source_type],
                [hubspot_owner_id],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @hs_object_id,
                @subject,
                @content,
                @hs_pipeline,
                @hs_pipeline_stage,
                @hs_ticket_priority,
                @hs_ticket_category,
                @createdate,
                @hs_lastmodifieddate,
                @closed_date,
                @source_type,
                @hubspot_owner_id,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [HubSpot].[vwTickets] WHERE [hs_object_id] = @hs_object_id
END
GO
GRANT EXECUTE ON [HubSpot].[spCreateTicket] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Tickets */

GRANT EXECUTE ON [HubSpot].[spCreateTicket] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: spUpdateTicket
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Ticket
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spUpdateTicket]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spUpdateTicket];
GO

CREATE PROCEDURE [HubSpot].[spUpdateTicket]
    @hs_object_id nvarchar(100),
    @subject nvarchar(500),
    @content nvarchar(MAX),
    @hs_pipeline nvarchar(500),
    @hs_pipeline_stage nvarchar(500),
    @hs_ticket_priority nvarchar(500),
    @hs_ticket_category nvarchar(500),
    @createdate datetimeoffset,
    @hs_lastmodifieddate datetimeoffset,
    @closed_date datetimeoffset,
    @source_type nvarchar(500),
    @hubspot_owner_id nvarchar(100),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Ticket]
    SET
        [subject] = @subject,
        [content] = @content,
        [hs_pipeline] = @hs_pipeline,
        [hs_pipeline_stage] = @hs_pipeline_stage,
        [hs_ticket_priority] = @hs_ticket_priority,
        [hs_ticket_category] = @hs_ticket_category,
        [createdate] = @createdate,
        [hs_lastmodifieddate] = @hs_lastmodifieddate,
        [closed_date] = @closed_date,
        [source_type] = @source_type,
        [hubspot_owner_id] = @hubspot_owner_id,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [hs_object_id] = @hs_object_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [HubSpot].[vwTickets] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [HubSpot].[vwTickets]
                                    WHERE
                                        [hs_object_id] = @hs_object_id
                                    
END
GO

GRANT EXECUTE ON [HubSpot].[spUpdateTicket] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Ticket table
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[trgUpdateTicket]', 'TR') IS NOT NULL
    DROP TRIGGER [HubSpot].[trgUpdateTicket];
GO
CREATE TRIGGER [HubSpot].trgUpdateTicket
ON [HubSpot].[Ticket]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [HubSpot].[Ticket]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [HubSpot].[Ticket] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hs_object_id] = I.[hs_object_id];
END;
GO
        

/* spUpdate Permissions for Tickets */

GRANT EXECUTE ON [HubSpot].[spUpdateTicket] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for Time Zones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Time Zones
-- Item: vwTimeZones
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Time Zones
-----               SCHEMA:      YourMembership
-----               BASE TABLE:  TimeZone
-----               PRIMARY KEY: fullName
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[vwTimeZones]', 'V') IS NOT NULL
    DROP VIEW [YourMembership].[vwTimeZones];
GO

CREATE VIEW [YourMembership].[vwTimeZones]
AS
SELECT
    t.*
FROM
    [YourMembership].[TimeZone] AS t
GO
GRANT SELECT ON [YourMembership].[vwTimeZones] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Time Zones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Time Zones
-- Item: Permissions for vwTimeZones
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [YourMembership].[vwTimeZones] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Time Zones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Time Zones
-- Item: spCreateTimeZone
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TimeZone
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spCreateTimeZone]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spCreateTimeZone];
GO

CREATE PROCEDURE [YourMembership].[spCreateTimeZone]
    @fullName nvarchar(200) = NULL,
    @gmtOffset nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [YourMembership].[TimeZone]
        (
            [fullName],
                [gmtOffset],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt]
        )
    VALUES
        (
            @fullName,
                @gmtOffset,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                @__mj_integration_LastSyncedAt
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [YourMembership].[vwTimeZones] WHERE [fullName] = @fullName
END
GO
GRANT EXECUTE ON [YourMembership].[spCreateTimeZone] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Time Zones */

GRANT EXECUTE ON [YourMembership].[spCreateTimeZone] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Time Zones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Time Zones
-- Item: spUpdateTimeZone
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TimeZone
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spUpdateTimeZone]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spUpdateTimeZone];
GO

CREATE PROCEDURE [YourMembership].[spUpdateTimeZone]
    @fullName nvarchar(200),
    @gmtOffset nvarchar(200),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50),
    @__mj_integration_LastSyncedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[TimeZone]
    SET
        [gmtOffset] = @gmtOffset,
        [${flyway:defaultSchema}_integration_SyncStatus] = @${flyway:defaultSchema}_integration_SyncStatus,
        [__mj_integration_LastSyncedAt] = @__mj_integration_LastSyncedAt
    WHERE
        [fullName] = @fullName

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [YourMembership].[vwTimeZones] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [YourMembership].[vwTimeZones]
                                    WHERE
                                        [fullName] = @fullName
                                    
END
GO

GRANT EXECUTE ON [YourMembership].[spUpdateTimeZone] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TimeZone table
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[trgUpdateTimeZone]', 'TR') IS NOT NULL
    DROP TRIGGER [YourMembership].[trgUpdateTimeZone];
GO
CREATE TRIGGER [YourMembership].trgUpdateTimeZone
ON [YourMembership].[TimeZone]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [YourMembership].[TimeZone]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [YourMembership].[TimeZone] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[fullName] = I.[fullName];
END;
GO
        

/* spUpdate Permissions for Time Zones */

GRANT EXECUTE ON [YourMembership].[spUpdateTimeZone] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Store Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Store Orders
-- Item: spDeleteStoreOrder
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR StoreOrder
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteStoreOrder]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteStoreOrder];
GO

CREATE PROCEDURE [YourMembership].[spDeleteStoreOrder]
    @OrderID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[StoreOrder]
    WHERE
        [OrderID] = @OrderID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [OrderID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @OrderID AS [OrderID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteStoreOrder] TO [cdp_Integration]
    

/* spDelete Permissions for Store Orders */

GRANT EXECUTE ON [YourMembership].[spDeleteStoreOrder] TO [cdp_Integration]



/* spDelete SQL for Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: spDeleteTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Task
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteTask]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteTask];
GO

CREATE PROCEDURE [HubSpot].[spDeleteTask]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[Task]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteTask] TO [cdp_Integration]
    

/* spDelete Permissions for Tasks */

GRANT EXECUTE ON [HubSpot].[spDeleteTask] TO [cdp_Integration]



/* spDelete SQL for Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: spDeleteTicket
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Ticket
------------------------------------------------------------
IF OBJECT_ID('[HubSpot].[spDeleteTicket]', 'P') IS NOT NULL
    DROP PROCEDURE [HubSpot].[spDeleteTicket];
GO

CREATE PROCEDURE [HubSpot].[spDeleteTicket]
    @hs_object_id nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [HubSpot].[Ticket]
    WHERE
        [hs_object_id] = @hs_object_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hs_object_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hs_object_id AS [hs_object_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [HubSpot].[spDeleteTicket] TO [cdp_Integration]
    

/* spDelete Permissions for Tickets */

GRANT EXECUTE ON [HubSpot].[spDeleteTicket] TO [cdp_Integration]



/* spDelete SQL for Time Zones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Time Zones
-- Item: spDeleteTimeZone
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TimeZone
------------------------------------------------------------
IF OBJECT_ID('[YourMembership].[spDeleteTimeZone]', 'P') IS NOT NULL
    DROP PROCEDURE [YourMembership].[spDeleteTimeZone];
GO

CREATE PROCEDURE [YourMembership].[spDeleteTimeZone]
    @fullName nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [YourMembership].[TimeZone]
    WHERE
        [fullName] = @fullName


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [fullName] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @fullName AS [fullName] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [YourMembership].[spDeleteTimeZone] TO [cdp_Integration]
    

/* spDelete Permissions for Time Zones */

GRANT EXECUTE ON [YourMembership].[spDeleteTimeZone] TO [cdp_Integration]



/* Set soft PK for YourMembership.Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08' AND [Name] = 'ProfileID'

/* Set soft FK for YourMembership.Member.MemberTypeCode → MemberType.TypeCode */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '94BFEFB5-2E4A-4499-BDED-F9197287D761',
                                    [RelatedEntityFieldName] = 'TypeCode',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08' AND [Name] = 'MemberTypeCode'

/* Set soft FK for YourMembership.Member.Country → Country.countryId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'A694C1ED-2BE5-4895-8292-E6377412B980',
                                    [RelatedEntityFieldName] = 'countryId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08' AND [Name] = 'Country'

/* Set soft PK for YourMembership.Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.MemberType.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '94BFEFB5-2E4A-4499-BDED-F9197287D761' AND [Name] = 'ID'

/* Set soft PK for YourMembership.Membership.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C8B8595D-F148-4DEE-B22B-F3FCD754363A' AND [Name] = 'Id'

/* Set soft PK for YourMembership.Group.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8EE7A6AF-EDDD-41A9-9261-86D75B5E25BC' AND [Name] = 'Id'

/* Set soft FK for YourMembership.Group.GroupTypeId → GroupType.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '77038FFA-ABAF-442E-B05D-3B1B1353EEAD',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '8EE7A6AF-EDDD-41A9-9261-86D75B5E25BC' AND [Name] = 'GroupTypeId'

/* Set soft PK for YourMembership.Product.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6525C9E6-6F94-412B-A4CF-B593AB351343' AND [Name] = 'id'

/* Set soft PK for YourMembership.DonationFund.fundId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '03CE4713-C5FC-4998-A6B6-57CFD787A21D' AND [Name] = 'fundId'

/* Set soft PK for YourMembership.Certification.CertificationID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5F6EC2D0-09D9-435F-9A89-3A03ADEAD39A' AND [Name] = 'CertificationID'

/* Set soft PK for YourMembership.InvoiceItem.LineItemID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0' AND [Name] = 'LineItemID'

/* Set soft FK for YourMembership.InvoiceItem.WebSiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0' AND [Name] = 'WebSiteMemberID'

/* Set soft FK for YourMembership.InvoiceItem.GLCodeItemName → GLCode.GLCodeName */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'E2A0E2D0-5CEC-4424-83CD-37E2349379DA',
                                    [RelatedEntityFieldName] = 'GLCodeName',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0' AND [Name] = 'GLCodeItemName'

/* Set soft FK for YourMembership.InvoiceItem.QBClassItemName → QBClass.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'DB54BB01-FEA4-49CD-82F9-8D0140CD61D3',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0' AND [Name] = 'QBClassItemName'

/* Set soft FK for YourMembership.InvoiceItem.InvoiceNo → StoreOrder.OrderID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '4BCFB338-C625-435F-A1B7-4C64B12AA19D',
                                    [RelatedEntityFieldName] = 'OrderID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'DBF3F559-C267-4972-8D7E-E4A8E000DEA0' AND [Name] = 'InvoiceNo'

/* Set soft PK for YourMembership.DuesTransaction.TransactionID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '505CB043-3A82-407A-B9A7-7233772AB994' AND [Name] = 'TransactionID'

/* Set soft FK for YourMembership.DuesTransaction.WebsiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '505CB043-3A82-407A-B9A7-7233772AB994' AND [Name] = 'WebsiteMemberID'

/* Set soft FK for YourMembership.DuesTransaction.MemberType → MemberType.TypeCode */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '94BFEFB5-2E4A-4499-BDED-F9197287D761',
                                    [RelatedEntityFieldName] = 'TypeCode',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '505CB043-3A82-407A-B9A7-7233772AB994' AND [Name] = 'MemberType'

/* Set soft PK for YourMembership.EventRegistration.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C12729F5-A6CF-4114-BB8D-61FA041E7F09' AND [Name] = 'Id'

/* Set soft FK for YourMembership.EventRegistration.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C12729F5-A6CF-4114-BB8D-61FA041E7F09' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.EventSession.SessionId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '465B0B78-02B4-4442-AA66-33796DAB50DA' AND [Name] = 'SessionId'

/* Set soft FK for YourMembership.EventSession.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '465B0B78-02B4-4442-AA66-33796DAB50DA' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.EventTicket.TicketId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1E432025-5472-427B-A43C-D4B13FAABECF' AND [Name] = 'TicketId'

/* Set soft FK for YourMembership.EventTicket.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '1E432025-5472-427B-A43C-D4B13FAABECF' AND [Name] = 'EventId'

/* Set soft FK for YourMembership.EventTicket.Category → EventCategory.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '935E7671-FADE-4AFF-A287-7D305EEA4004',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '1E432025-5472-427B-A43C-D4B13FAABECF' AND [Name] = 'Category'

/* Set soft PK for YourMembership.EventCategory.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '935E7671-FADE-4AFF-A287-7D305EEA4004' AND [Name] = 'Id'

/* Set soft PK for YourMembership.MemberGroup.MemberGroupId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F832CD3F-68CF-4F85-9590-A91CCCD6AAB5' AND [Name] = 'MemberGroupId'

/* Set soft FK for YourMembership.MemberGroup.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F832CD3F-68CF-4F85-9590-A91CCCD6AAB5' AND [Name] = 'ProfileID'

/* Set soft FK for YourMembership.MemberGroup.GroupId → Group.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '8EE7A6AF-EDDD-41A9-9261-86D75B5E25BC',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F832CD3F-68CF-4F85-9590-A91CCCD6AAB5' AND [Name] = 'GroupId'

/* Set soft FK for YourMembership.MemberGroup.GroupTypeId → GroupType.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '77038FFA-ABAF-442E-B05D-3B1B1353EEAD',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F832CD3F-68CF-4F85-9590-A91CCCD6AAB5' AND [Name] = 'GroupTypeId'

/* Set soft PK for YourMembership.Connection.ConnectionId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '14709D82-1EFA-4F7F-9A6F-238D8A910A89' AND [Name] = 'ConnectionId'

/* Set soft FK for YourMembership.Connection.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '14709D82-1EFA-4F7F-9A6F-238D8A910A89' AND [Name] = 'ProfileID'

/* Set soft PK for YourMembership.DonationHistory.intDonationId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F58F4447-D46F-47D2-B44C-45B238594B12' AND [Name] = 'intDonationId'

/* Set soft FK for YourMembership.DonationHistory.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F58F4447-D46F-47D2-B44C-45B238594B12' AND [Name] = 'ProfileID'

/* Set soft FK for YourMembership.DonationHistory.intDonationId → DonationTransaction.TransactionID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '23860586-3034-436F-B629-C4CE071357C1',
                                    [RelatedEntityFieldName] = 'TransactionID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F58F4447-D46F-47D2-B44C-45B238594B12' AND [Name] = 'intDonationId'

/* Set soft PK for YourMembership.EngagementScore.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CCECDA70-5577-4DC0-81A1-D0A35DB81701' AND [Name] = 'ProfileID'

/* Set soft FK for YourMembership.EngagementScore.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'CCECDA70-5577-4DC0-81A1-D0A35DB81701' AND [Name] = 'ProfileID'

/* Set soft PK for YourMembership.GroupType.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '77038FFA-ABAF-442E-B05D-3B1B1353EEAD' AND [Name] = 'Id'

/* Set soft PK for YourMembership.DonationTransaction.TransactionID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '23860586-3034-436F-B629-C4CE071357C1' AND [Name] = 'TransactionID'

/* Set soft FK for YourMembership.DonationTransaction.WebsiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '23860586-3034-436F-B629-C4CE071357C1' AND [Name] = 'WebsiteMemberID'

/* Set soft FK for YourMembership.DonationTransaction.FundName → DonationFund.fundName */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '03CE4713-C5FC-4998-A6B6-57CFD787A21D',
                                    [RelatedEntityFieldName] = 'fundName',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '23860586-3034-436F-B629-C4CE071357C1' AND [Name] = 'FundName'

/* Set soft PK for YourMembership.StoreOrder.OrderID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4BCFB338-C625-435F-A1B7-4C64B12AA19D' AND [Name] = 'OrderID'

/* Set soft FK for YourMembership.StoreOrder.WebsiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4BCFB338-C625-435F-A1B7-4C64B12AA19D' AND [Name] = 'WebsiteMemberID'

/* Set soft FK for YourMembership.StoreOrder.ShippingMethod → ShippingMethod.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C212F21F-167E-4CFC-98F3-0D82BE69CFAE',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4BCFB338-C625-435F-A1B7-4C64B12AA19D' AND [Name] = 'ShippingMethod'

/* Set soft PK for YourMembership.StoreOrderDetail.OrderDetailID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4C06760F-6564-4BED-B54E-93248DE64F45' AND [Name] = 'OrderDetailID'

/* Set soft FK for YourMembership.StoreOrderDetail.OrderID → StoreOrder.OrderID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '4BCFB338-C625-435F-A1B7-4C64B12AA19D',
                                    [RelatedEntityFieldName] = 'OrderID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4C06760F-6564-4BED-B54E-93248DE64F45' AND [Name] = 'OrderID'

/* Set soft FK for YourMembership.StoreOrderDetail.WebsiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4C06760F-6564-4BED-B54E-93248DE64F45' AND [Name] = 'WebsiteMemberID'

/* Set soft FK for YourMembership.StoreOrderDetail.ShippingMethod → ShippingMethod.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C212F21F-167E-4CFC-98F3-0D82BE69CFAE',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4C06760F-6564-4BED-B54E-93248DE64F45' AND [Name] = 'ShippingMethod'

/* Set soft PK for YourMembership.CertificationJournal.EntryID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '2BDB1786-D256-45AC-BFA8-9AA4CF8A0F48' AND [Name] = 'EntryID'

/* Set soft FK for YourMembership.CertificationJournal.WebsiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '2BDB1786-D256-45AC-BFA8-9AA4CF8A0F48' AND [Name] = 'WebsiteMemberID'

/* Set soft PK for YourMembership.CertificationCreditType.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '57038F58-C239-4E6B-AF4B-39961551C126' AND [Name] = 'ID'

/* Set soft PK for YourMembership.ProductCategory.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6670A77F-323E-4749-8CF6-7F37E240E3B9' AND [Name] = 'Id'

/* Set soft PK for YourMembership.CareerOpening.CareerOpeningID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '020EE023-76B0-4D95-ADF2-DD5C4804A96B' AND [Name] = 'CareerOpeningID'

/* Set soft PK for YourMembership.Campaign.CampaignId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9FCE89B2-43AB-4576-9468-EBA58CDA179F' AND [Name] = 'CampaignId'

/* Set soft PK for YourMembership.GLCode.GLCodeId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E2A0E2D0-5CEC-4424-83CD-37E2349379DA' AND [Name] = 'GLCodeId'

/* Set soft PK for YourMembership.MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801' AND [Name] = 'ProfileID'

/* Set soft FK for YourMembership.MemberProfile.MemberTypeCode → MemberType.TypeCode */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '94BFEFB5-2E4A-4499-BDED-F9197287D761',
                                    [RelatedEntityFieldName] = 'TypeCode',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801' AND [Name] = 'MemberTypeCode'

/* Set soft PK for YourMembership.PersonID.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E5A144BD-DEF9-41BD-9E58-47DC3B622515' AND [Name] = 'ID'

/* Set soft PK for YourMembership.MemberGroupBulk.WebSiteMemberID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C992FDA2-803A-4320-99D0-CAC85BF3A821' AND [Name] = 'WebSiteMemberID'

/* Set soft PK for YourMembership.MemberGroupBulk.GroupID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C992FDA2-803A-4320-99D0-CAC85BF3A821' AND [Name] = 'GroupID'

/* Set soft FK for YourMembership.MemberGroupBulk.WebSiteMemberID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C992FDA2-803A-4320-99D0-CAC85BF3A821' AND [Name] = 'WebSiteMemberID'

/* Set soft FK for YourMembership.MemberGroupBulk.GroupID → Group.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '8EE7A6AF-EDDD-41A9-9261-86D75B5E25BC',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C992FDA2-803A-4320-99D0-CAC85BF3A821' AND [Name] = 'GroupID'

/* Set soft PK for YourMembership.FinanceBatch.BatchID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1B5B7CBD-E2A1-49FB-A6D6-785FAB79F01E' AND [Name] = 'BatchID'

/* Set soft PK for YourMembership.FinanceBatchDetail.DetailID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '878586B4-F6B5-4D74-83AA-C445FBAAE84E' AND [Name] = 'DetailID'

/* Set soft FK for YourMembership.FinanceBatchDetail.BatchID → FinanceBatch.BatchID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '1B5B7CBD-E2A1-49FB-A6D6-785FAB79F01E',
                                    [RelatedEntityFieldName] = 'BatchID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '878586B4-F6B5-4D74-83AA-C445FBAAE84E' AND [Name] = 'BatchID'

/* Set soft PK for YourMembership.AllCampaign.CampaignId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '11912C5A-4706-4796-BD77-FB3B5F660B5A' AND [Name] = 'CampaignId'

/* Set soft PK for YourMembership.CampaignEmailList.ListId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1FA3156F-D157-4121-A0CD-A73187DC3E8A' AND [Name] = 'ListId'

/* Set soft PK for YourMembership.EventAttendeeType.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '06CEC46D-E396-4ED2-BC96-0C59F15225B4' AND [Name] = 'Id'

/* Set soft FK for YourMembership.EventAttendeeType.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '06CEC46D-E396-4ED2-BC96-0C59F15225B4' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.EventSessionGroup.SessionGroupId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9B81C81A-A11D-44A1-8CB2-D7FEFA22574B' AND [Name] = 'SessionGroupId'

/* Set soft FK for YourMembership.EventSessionGroup.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '9B81C81A-A11D-44A1-8CB2-D7FEFA22574B' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.EventCEUAward.AwardID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '047536B2-5302-42E6-A0A1-5B1C0AD3469B' AND [Name] = 'AwardID'

/* Set soft FK for YourMembership.EventCEUAward.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '047536B2-5302-42E6-A0A1-5B1C0AD3469B' AND [Name] = 'EventId'

/* Set soft FK for YourMembership.EventCEUAward.CertificationID → Certification.CertificationID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '5F6EC2D0-09D9-435F-9A89-3A03ADEAD39A',
                                    [RelatedEntityFieldName] = 'CertificationID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '047536B2-5302-42E6-A0A1-5B1C0AD3469B' AND [Name] = 'CertificationID'

/* Set soft FK for YourMembership.EventCEUAward.CreditTypeID → CertificationCreditType.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '57038F58-C239-4E6B-AF4B-39961551C126',
                                    [RelatedEntityFieldName] = 'ID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '047536B2-5302-42E6-A0A1-5B1C0AD3469B' AND [Name] = 'CreditTypeID'

/* Set soft PK for YourMembership.EventRegistrationForm.FormId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '704AF929-EB18-41C2-B4D8-FACDDB8F6336' AND [Name] = 'FormId'

/* Set soft PK for YourMembership.EventID.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '880A1545-DA68-4A31-8C80-A5E7117A5F80' AND [Name] = 'EventId'

/* Set soft FK for YourMembership.EventID.EventId → Event.EventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'FBE8B601-607D-4292-BC71-5FBA4F0B60E2',
                                    [RelatedEntityFieldName] = 'EventId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '880A1545-DA68-4A31-8C80-A5E7117A5F80' AND [Name] = 'EventId'

/* Set soft PK for YourMembership.GroupMembershipLog.ItemID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8F90B826-7C47-4A2F-96A2-1233F6EBB718' AND [Name] = 'ItemID'

/* Set soft FK for YourMembership.GroupMembershipLog.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '8F90B826-7C47-4A2F-96A2-1233F6EBB718' AND [Name] = 'ProfileID'

/* Set soft PK for YourMembership.DuesRule.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FCA2DB70-0291-4183-BF86-965DA9A33DDC' AND [Name] = 'ID'

/* Set soft PK for YourMembership.MemberReferral.ReferralId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '863D2F30-9416-4812-9BC7-251F764E9432' AND [Name] = 'ReferralId'

/* Set soft FK for YourMembership.MemberReferral.ReferrerID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '863D2F30-9416-4812-9BC7-251F764E9432' AND [Name] = 'ReferrerID'

/* Set soft FK for YourMembership.MemberReferral.ReferredID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '863D2F30-9416-4812-9BC7-251F764E9432' AND [Name] = 'ReferredID'

/* Set soft PK for YourMembership.MemberSubAccount.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '97454CB7-2D2D-4458-98CA-1420D97556CF' AND [Name] = 'ID'

/* Set soft FK for YourMembership.MemberSubAccount.ID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '97454CB7-2D2D-4458-98CA-1420D97556CF' AND [Name] = 'ID'

/* Set soft FK for YourMembership.MemberSubAccount.ParentID → Member.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8605717-76D7-48C2-92A8-7DF2A3DE1F08',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '97454CB7-2D2D-4458-98CA-1420D97556CF' AND [Name] = 'ParentID'

/* Set soft PK for YourMembership.Country.countryId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A694C1ED-2BE5-4895-8292-E6377412B980' AND [Name] = 'countryId'

/* Set soft PK for YourMembership.Location.locationCode */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'AFB37B76-7291-4F9B-95D7-BB7916749DED' AND [Name] = 'locationCode'

/* Set soft FK for YourMembership.Location.countryId → Country.countryId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'A694C1ED-2BE5-4895-8292-E6377412B980',
                                    [RelatedEntityFieldName] = 'countryId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'AFB37B76-7291-4F9B-95D7-BB7916749DED' AND [Name] = 'countryId'

/* Set soft PK for YourMembership.ShippingMethod.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C212F21F-167E-4CFC-98F3-0D82BE69CFAE' AND [Name] = 'id'

/* Set soft PK for YourMembership.PaymentProcessor.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E0BE164C-FA55-422A-9568-AA1A487A995A' AND [Name] = 'Id'

/* Set soft PK for YourMembership.CustomTaxLocation.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E776E6E7-5EEF-493B-B1C2-BE912B82BDF1' AND [Name] = 'Id'

/* Set soft PK for YourMembership.QBClass.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DB54BB01-FEA4-49CD-82F9-8D0140CD61D3' AND [Name] = 'Id'

/* Set soft PK for YourMembership.MembershipModifier.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '496C9ECD-5B63-4F09-83DE-7C1984DD4A35' AND [Name] = 'ID'

/* Set soft FK for YourMembership.MembershipModifier.MembershipID → Membership.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8B8595D-F148-4DEE-B22B-F3FCD754363A',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '496C9ECD-5B63-4F09-83DE-7C1984DD4A35' AND [Name] = 'MembershipID'

/* Set soft PK for YourMembership.MembershipPromoCode.PromoCodeId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A9F2A9F8-E37A-4524-96ED-1C1D36ADE02B' AND [Name] = 'PromoCodeId'

/* Set soft FK for YourMembership.MembershipPromoCode.MembershipID → Membership.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = 'C8B8595D-F148-4DEE-B22B-F3FCD754363A',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'A9F2A9F8-E37A-4524-96ED-1C1D36ADE02B' AND [Name] = 'MembershipID'

/* Set soft PK for YourMembership.Announcement.AnnouncementId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '773EED61-C801-4541-B5CF-1F76AC7F8A94' AND [Name] = 'AnnouncementId'

/* Set soft PK for YourMembership.EmailSuppressionList.Email */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '456577C0-3BD3-4C79-A1D9-F7093FF020C9' AND [Name] = 'Email'

/* Set soft PK for YourMembership.SponsorRotator.RotatorId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D6B41B71-FB71-45FD-AEE9-BA193960CE2F' AND [Name] = 'RotatorId'

/* Set soft PK for YourMembership.MemberNetwork.NetworkId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3DEE5D4B-4A59-45AB-9A66-AC16DEA4D83D' AND [Name] = 'NetworkId'

/* Set soft FK for YourMembership.MemberNetwork.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3DEE5D4B-4A59-45AB-9A66-AC16DEA4D83D' AND [Name] = 'ProfileID'

/* Set soft PK for YourMembership.MemberFavorite.FavoriteId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E7AFC988-7509-4034-BC89-7AD48500EF46' AND [Name] = 'FavoriteId'

/* Set soft FK for YourMembership.MemberFavorite.ProfileID → MemberProfile.ProfileID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '89BF89AE-396C-44CA-A382-9E2EF46BD801',
                                    [RelatedEntityFieldName] = 'ProfileID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'E7AFC988-7509-4034-BC89-7AD48500EF46' AND [Name] = 'ProfileID'

/* Set soft PK for YourMembership.TimeZone.fullName */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6FF0DA58-B2DC-4E68-A981-84493AC4D9E4' AND [Name] = 'fullName'

/* Set soft PK for HubSpot.Contact.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FC68FEEC-0410-48C2-844E-469EBB614A3E' AND [Name] = 'hs_object_id'

/* Set soft FK for HubSpot.Contact.associatedcompanyid → Company.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '41C62BFA-6A14-4FC5-8612-92F2621F2119',
                                    [RelatedEntityFieldName] = 'hs_object_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'FC68FEEC-0410-48C2-844E-469EBB614A3E' AND [Name] = 'associatedcompanyid'

/* Set soft PK for HubSpot.Company.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '41C62BFA-6A14-4FC5-8612-92F2621F2119' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Deal.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C01E4DEF-458D-47AA-AF60-CC46A3ED90E2' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Ticket.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '7312A9B6-291E-4E39-8B96-885DEC5734D6' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Product.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5DE0A4FF-D898-42E6-A79A-4758A7E1E93A' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.LineItem.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F834B20B-683C-479D-A05C-09533ED35B18' AND [Name] = 'hs_object_id'

/* Set soft FK for HubSpot.LineItem.hs_product_id → Product.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [RelatedEntityID] = '5DE0A4FF-D898-42E6-A79A-4758A7E1E93A',
                                    [RelatedEntityFieldName] = 'hs_object_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F834B20B-683C-479D-A05C-09533ED35B18' AND [Name] = 'hs_product_id'

/* Set soft PK for HubSpot.Quote.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B855C126-D8D2-4EAE-B052-915FFF4C7A5D' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Call.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3810B85B-9182-4779-B361-8A97A5565D04' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Email.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '08C534E4-7B71-4E83-86A9-628106E2C25B' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Note.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BF41E527-79B4-4923-9B7F-23967FC5D7F9' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Task.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '622EFB4D-03AE-404D-8799-F3865ED31218' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.Meeting.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BDE08C93-DB12-4D3C-AB73-25BD91842B5B' AND [Name] = 'hs_object_id'

/* Set soft PK for HubSpot.FeedbackSubmission.hs_object_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET __mj_UpdatedAt=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '246B6790-F7C2-42E0-99E3-DD548F14E282' AND [Name] = 'hs_object_id'


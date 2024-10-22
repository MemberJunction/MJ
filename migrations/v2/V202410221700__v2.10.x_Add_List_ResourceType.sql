INSERT INTO [${flyway:defaultSchema}].[ResourceType]
           (
			[ID],
			[Name]
           ,[DisplayName]
           ,[Description]
           ,[Icon]
           ,[EntityID]
           ,[CategoryEntityID])
     VALUES
           (
		   'E64D433E-F36B-1410-8560-0041FA62858A',
		   'Lists',
		   'Lists',
           'Lists contains sets of records from an Entity',
           'fa-solid fa-rectangle-list',
           'EE238F34-2837-EF11-86D4-6045BDEE16E6',
		   '42248F34-2837-EF11-86D4-6045BDEE16E6'
		   )
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwConversations]
GO
CREATE VIEW [${flyway:defaultSchema}].[vwConversations]
AS
SELECT 
    c.*,
    User_UserID.[Name] AS [User],
    Entity_LinkedEntityID.[Name] AS [LinkedEntity],
    DataContext_DataContextID.[Name] AS [DataContext]
FROM
    [${flyway:defaultSchema}].[Conversation] AS c
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [c].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_LinkedEntityID
  ON
    [c].[LinkedEntityID] = Entity_LinkedEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [c].[DataContextID] = DataContext_DataContextID.[ID]
GO
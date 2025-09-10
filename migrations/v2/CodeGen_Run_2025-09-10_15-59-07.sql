/* SQL text to delete entity field value ID 593063BF-207D-F011-A77F-AC1A3D21423D */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='593063BF-207D-F011-A77F-AC1A3D21423D'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='A73063BF-207D-F011-A77F-AC1A3D21423D'

/* SQL text to delete entity field value ID 5E3063BF-207D-F011-A77F-AC1A3D21423D */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='5E3063BF-207D-F011-A77F-AC1A3D21423D'

/* SQL text to update entity field related entity name field map for entity field ID EEFBD25B-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EEFBD25B-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID D5CD236F-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D5CD236F-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID F2FBD25B-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F2FBD25B-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID D6CD236F-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D6CD236F-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID F3FBD25B-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F3FBD25B-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID D2EA3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D2EA3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID DBEA3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DBEA3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID E2EA3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E2EA3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID DCEA3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DCEA3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID DDEA3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DDEA3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID F7EA3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F7EA3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 09EB3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='09EB3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 15EB3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='15EB3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 1BEB3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1BEB3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 0CEB3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0CEB3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 0DEB3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0DEB3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 0EEB3B36-1F7D-F011-A77F-AC1A3D21423D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0EEB3B36-1F7D-F011-A77F-AC1A3D21423D',
         @RelatedEntityNameFieldMap='ContentFileType'


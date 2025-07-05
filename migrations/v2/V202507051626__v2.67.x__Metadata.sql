-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spCreateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'parentAgentName',
@Description = N'Name of the parent agent to determine agent hierarchy',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL
/*
 * Migration: Update Component entity field descriptions
 *
 * Updates the Description, FunctionalRequirements, and TechnicalDesign field descriptions
 * to clarify that these fields are automatically derived from the Specification field
 * and should not be edited directly.
 *
 * Version: v2.123.x
 * Date: 2024-12-04 14:30
 */

-- Update Description field description
EXEC sys.sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'[READ-ONLY] Detailed description of the component functionality. This field is automatically synchronized from the Specification.description field and should not be edited directly. To update this value, edit the component spec file.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Component',
    @level2type = N'COLUMN', @level2name = N'Description';

-- Update FunctionalRequirements field description
EXEC sys.sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'[READ-ONLY] Functional requirements describing what the component should accomplish. This field is automatically synchronized from the Specification.functionalRequirements field and should not be edited directly. To update this value, edit the component spec file.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Component',
    @level2type = N'COLUMN', @level2name = N'FunctionalRequirements';

-- Update TechnicalDesign field description
EXEC sys.sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'[READ-ONLY] Technical design describing how the component is implemented. This field is automatically synchronized from the Specification.technicalDesign field and should not be edited directly. To update this value, edit the component spec file.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Component',
    @level2type = N'COLUMN', @level2name = N'TechnicalDesign';

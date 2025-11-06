/******************************************************************************
 * Association Sample Database - Schema Documentation
 * File: V001__schemas_documentation.sql
 *
 * Extended properties (documentation) for database schemas.
 * This file is separate to allow optional installation of documentation.
 ******************************************************************************/

-- Documentation for membership schema
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Core membership management including organizations, individual members, membership types, and membership records with renewal tracking',
    @level0type = N'SCHEMA',
    @level0name = 'membership';


-- Documentation for events schema
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Event management system for conferences, webinars, workshops, and chapter meetings including registration and attendance tracking',
    @level0type = N'SCHEMA',
    @level0name = 'events';


-- Documentation for learning schema
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Learning management system (LMS) for educational courses, certifications, member enrollments, progress tracking, and certificate issuance',
    @level0type = N'SCHEMA',
    @level0name = 'learning';


-- Documentation for finance schema
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Financial management including invoicing for dues and services, detailed line items, payment processing, and transaction tracking',
    @level0type = N'SCHEMA',
    @level0name = 'finance';


-- Documentation for marketing schema
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Marketing campaign management, member segmentation, targeted communications, and campaign performance tracking',
    @level0type = N'SCHEMA',
    @level0name = 'marketing';


-- Documentation for email schema
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Email communication system with reusable templates, send tracking, delivery metrics, click tracking, and engagement analytics',
    @level0type = N'SCHEMA',
    @level0name = 'email';


-- Documentation for chapters schema
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Local chapters and special interest groups including geographic chapters, chapter memberships, and leadership positions',
    @level0type = N'SCHEMA',
    @level0name = 'chapters';


-- Documentation for governance schema
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Association governance structures including committees, task forces, board positions, and volunteer leadership tracking',
    @level0type = N'SCHEMA',
    @level0name = 'governance';




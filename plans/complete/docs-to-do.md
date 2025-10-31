# MemberJunction Documentation To-Do List

This document outlines the necessary updates and additions to the MemberJunction documentation site (https://docs.memberjunction.org) based on the current state of the repository.

## Overview

The documentation site exists and has a good foundation, but needs significant updates to reflect the current state of the MemberJunction platform, especially the extensive package ecosystem and new features.

## Current Documentation Structure

### Existing Pages (Verified Accessible)
- https://docs.memberjunction.org/docs/what-is-memberjunction
- https://docs.memberjunction.org/docs/memberjunction-architecture
- https://docs.memberjunction.org/docs/quick-start-guide
- https://docs.memberjunction.org/docs/navigating-memberjunction-explorer
- https://docs.memberjunction.org/docs/developer-overview
- https://docs.memberjunction.org/docs/database-design
- https://docs.memberjunction.org/docs/using-memberjunction-explorer
- https://docs.memberjunction.org/docs/libraries
- https://docs.memberjunction.org/docs/integration
- https://docs.memberjunction.org/docs/add-custom-graphql-fields
- https://docs.memberjunction.org/docs/use-public-fields-in-mjapi
- https://docs.memberjunction.org/docs/customize-angular-forms-in-memberjunction-explorer

## High Priority Updates Needed

### 1. Package Documentation (CRITICAL)

The repository contains 100+ packages but the documentation site appears to have minimal package-specific documentation. Each package now has a comprehensive README.md that should be incorporated into the docs site.

#### New Pages Needed:

**Core Packages Section**
- `/docs/packages/core/global` - Document @memberjunction/global
- `/docs/packages/core/core` - Document @memberjunction/core
- `/docs/packages/core/core-entities` - Document @memberjunction/core-entities
- `/docs/packages/core/server` - Document @memberjunction/server
- `/docs/packages/core/cli` - Document @memberjunction/cli

**AI Framework Section**
- `/docs/packages/ai/overview` - AI Framework overview
- `/docs/packages/ai/core` - @memberjunction/ai base package
- `/docs/packages/ai/engine` - @memberjunction/aiengine
- `/docs/packages/ai/providers` - Overview of all AI providers
- Individual provider pages for each AI provider (15+ pages)

**Communication Framework Section**
- `/docs/packages/communication/overview` - Communication framework overview
- `/docs/packages/communication/engine` - Core communication engine
- `/docs/packages/communication/providers` - Provider implementations

**Actions Framework Section**
- `/docs/packages/actions/overview` - Actions framework overview
- `/docs/packages/actions/engine` - Action execution engine
- `/docs/packages/actions/creating-actions` - How to create custom actions

**Angular Components Section**
- `/docs/packages/angular/overview` - Angular components overview
- `/docs/packages/angular/explorer-components` - Explorer-specific components
- `/docs/packages/angular/generic-components` - Reusable components

### 2. Architecture Updates (HIGH)

The current architecture page needs updates to reflect:
- The modular package architecture
- AI integration architecture
- Communication framework architecture
- Actions framework architecture
- Vector database integration
- Modern Angular 18+ patterns

### 3. Getting Started Guide Updates (HIGH)

The quick start guide needs to reflect:
- Updated prerequisites (Node.js 18+, Angular 18+)
- NPM workspace setup
- Environment configuration for AI providers
- Docker deployment options

### 4. Developer Guide Expansion (HIGH)

#### New Developer Topics Needed:
- `/docs/developer/typescript-patterns` - TypeScript best practices in MJ
- `/docs/developer/entity-patterns` - Working with entities correctly
- `/docs/developer/metadata-driven-development` - Core MJ philosophy
- `/docs/developer/code-generation` - Using the code generation system
- `/docs/developer/testing` - Testing MJ applications
- `/docs/developer/performance` - Performance optimization

### 5. AI Integration Documentation (CRITICAL)

#### New AI Documentation Needed:
- `/docs/ai/getting-started` - Getting started with AI in MJ
- `/docs/ai/providers` - Choosing and configuring AI providers
- `/docs/ai/embeddings` - Working with embeddings and vectors
- `/docs/ai/chat-completions` - Building AI chat features
- `/docs/ai/recommendations` - Implementing recommendations
- `/docs/ai/duplicate-detection` - Using AI for duplicate detection

### 6. Communication Framework Documentation (HIGH)

#### New Communication Documentation:
- `/docs/communication/getting-started` - Getting started with communications
- `/docs/communication/templates` - Creating message templates
- `/docs/communication/providers` - Configuring providers
- `/docs/communication/bulk-messaging` - Sending bulk messages

### 7. Actions Framework Documentation (HIGH)

#### New Actions Documentation:
- `/docs/actions/concepts` - Understanding actions
- `/docs/actions/creating-actions` - Building custom actions
- `/docs/actions/scheduling` - Scheduled actions
- `/docs/actions/entity-actions` - Entity lifecycle actions

## Medium Priority Updates

### 8. API Reference Updates

- Update GraphQL API documentation with new types and queries
- Document REST API endpoints
- Add authentication documentation for API access
- Document rate limiting and security

### 9. Deployment Documentation

- `/docs/deployment/docker` - Docker deployment guide
- `/docs/deployment/azure` - Azure deployment
- `/docs/deployment/aws` - AWS deployment
- `/docs/deployment/migrations` - Database migration strategies

### 10. Integration Guides

- `/docs/integration/auth0` - Auth0 integration
- `/docs/integration/azure-ad` - Azure AD/MSAL integration
- `/docs/integration/external-systems` - Integrating external data

## Low Priority Updates

### 11. Advanced Topics

- `/docs/advanced/custom-providers` - Creating custom data providers
- `/docs/advanced/extending-metadata` - Extending the metadata system
- `/docs/advanced/custom-security` - Implementing custom security

### 12. Migration Guides

- `/docs/migration/v1-to-v2` - Migrating from v1 to v2
- `/docs/migration/database-upgrades` - Database upgrade procedures

### 13. Troubleshooting

- `/docs/troubleshooting/common-issues` - Common issues and solutions
- `/docs/troubleshooting/performance` - Performance troubleshooting
- `/docs/troubleshooting/debugging` - Debugging MJ applications

## Suggested New Sections

### 14. Tutorials Section

- `/docs/tutorials/build-first-app` - Build your first MJ application
- `/docs/tutorials/add-ai-chat` - Add AI chat to your app
- `/docs/tutorials/custom-forms` - Creating custom forms
- `/docs/tutorials/bulk-communications` - Sending bulk communications

### 15. Reference Architecture

- `/docs/reference/architecture-patterns` - Common architecture patterns
- `/docs/reference/security-patterns` - Security best practices
- `/docs/reference/data-patterns` - Data modeling patterns

### 16. Community Resources

- `/docs/community/contributing` - Contributing guide
- `/docs/community/roadmap` - Project roadmap
- `/docs/community/showcase` - Applications built with MJ

## Documentation Site Improvements

### Navigation Structure
The site navigation should be reorganized to reflect the major subsystems:
- Getting Started
- Core Concepts
- Package Reference
  - Core Packages
  - AI Framework
  - Communication Framework
  - Actions Framework
  - Angular Components
  - Utilities
- Developer Guide
- API Reference
- Deployment
- Tutorials
- Community

### Search Functionality
- Add search across all package documentation
- Include code examples in search
- Add filters for package type, topic, etc.

### Version Management
- Add version selector for documentation
- Maintain documentation for previous major versions
- Clear upgrade paths between versions

## Implementation Priority

1. **Immediate (Week 1-2)**
   - Update Getting Started guide
   - Create AI Framework overview
   - Create Communication Framework overview
   - Create Actions Framework overview

2. **Short Term (Week 3-4)**
   - Add package reference for core packages
   - Update architecture documentation
   - Add developer patterns guide

3. **Medium Term (Month 2)**
   - Complete all package documentation
   - Add tutorials
   - Expand integration guides

4. **Long Term (Month 3+)**
   - Add advanced topics
   - Complete reference architecture
   - Add community showcase

## Notes

- Each package now has a comprehensive README.md that can serve as the source for documentation
- The modular nature of MemberJunction is not well reflected in current docs
- AI capabilities are a major feature not covered in existing documentation
- Many powerful features like vector search, duplicate detection, and recommendations are undocumented
- The documentation should emphasize that many packages can be used standalone

This documentation update will ensure that developers can fully understand and utilize the powerful capabilities of the MemberJunction platform.
# MemberJunction Development Guide

## Build Commands
- Build all packages: `npm run build`
- Build specific packages: `turbo build --filter="@memberjunction/package-name"`
- Watch mode: `npm run watch`
- Start API server: `npm run start:api`
- Start Explorer UI: `npm run start:explorer`

## Lint & Format
- Check with ESLint: `npx eslint packages/path/to/file.ts`
- Format with Prettier: `npx prettier --write packages/path/to/file.ts`

## Code Style Guide
- Use TypeScript strict mode and explicit typing
- No explicit `any` types (enforced by ESLint)
- Prefer object shorthand syntax
- Follow existing naming conventions:
  - PascalCase for classes and interfaces
  - camelCase for variables, functions, methods
  - Use descriptive names and avoid abbreviations
- Imports: group imports by type (external, internal, relative)
- Error handling: use try/catch blocks and provide meaningful error messages
- Document public APIs with TSDoc comments
- Follow single responsibility principle

## Monorepo Structure
- Packages organized under /packages directory by function
- Each package has its own tsconfig.json and package.json
- Use package.json and turbo.json for build dependencies
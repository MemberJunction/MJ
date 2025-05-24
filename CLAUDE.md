# MemberJunction Development Guide

## IMPORTANT
- Before starting a new line of work always check the local branch we're on and see if it is (a) separate from the default branch in the remote repo - we always want to work in local feature branches and (b) if we aren't in such a feature branch that is named for the work being requested and empty, cut a new one but ask first and then switch to it

## Build Commands
- Build all packages: `npm run build`
- Build specific packages: `turbo build --filter="@memberjunction/package-name"`
- **IMPORTANT**: When building individual packages for testing/compilation, always use `npm run build` in the specific package directory (NOT turbo from root)
- Watch mode: `npm run watch`
- Start API server: `npm run start:api`
- Start Explorer UI: `npm run start:explorer`

## Development Workflow
- **CRITICAL**: After making code changes, always compile the affected package by running `npm run build` in that package's directory to check for TypeScript errors
- Fix all compilation errors before proceeding with additional changes
- This ensures code quality and prevents runtime issues

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

## Icon Libraries
- **Primary**: Font Awesome (already included) - Use for all icons throughout the application
- Font Awesome classes: `fa-solid`, `fa-regular`, `fa-light`, `fa-brands` etc.
- Use semantic icon names that clearly represent their function
- For model types in AI dashboard: use appropriate technology icons (fa-microchip, fa-robot, fa-brain, etc.)

## Monorepo Structure
- Packages organized under /packages directory by function
- Each package has its own tsconfig.json and package.json
- Use package.json and turbo.json for build dependencies

## NPM Workspace Management
- This is an NPM workspace monorepo
- **IMPORTANT**: To add dependencies to a specific package:
  - Define dependencies in the individual package's package.json
  - Run `npm install` at the repository root (NOT within the package directory)
  - Never run `npm install` inside individual package directories
  - The workspace manager will handle installing all dependencies across packages
- To update dependencies:
  - Edit the package.json file for the relevant package
  - Run `npm install` at the repo root
- When creating new packages:
  - Create the package structure with its own package.json
  - Add dependencies to the package.json
  - Run `npm install` at the repo root to update the workspace
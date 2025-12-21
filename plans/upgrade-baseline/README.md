# MemberJunction 3.0 Upgrade Baseline

**Date**: December 20, 2025
**Branch**: MJ_v3
**Node.js**: 24.11.1 (to be pinned to 24.12.0)
**npm**: 11.6.2

## Purpose

This directory contains the baseline state captured before beginning the MemberJunction v3.0 dependency upgrade. These files document all warnings, version inconsistencies, and security issues present in the codebase before the upgrade begins.

## Files

- **install-warnings-before.log** - Complete output from `npm install` including all warnings
- **build-warnings-before.log** - Complete output from `npm run build` including all compilation warnings
- **npm-audit-before.txt** - Security vulnerability audit results (text format)
- **npm-audit-before.json** - Security vulnerability audit results (JSON format)
- **syncpack-mismatches.txt** - Version inconsistencies across workspace packages
- **typescript-versions.txt** - All TypeScript versions found across packages
- **package-versions.txt** - Current versions of major framework packages (Angular, Kendo, RxJS, etc.)
- **summary.txt** - Quick metrics summary

## Key Findings

### TypeScript Version Inconsistency
Multiple TypeScript versions are in use across the monorepo, ranging from 4.9.5 to 5.4.5. This creates build inconsistencies and prevents using latest TypeScript features.

### Angular Version
Currently on Angular 18.0.2, which is 3 major versions behind the latest stable (21.0.6).

### Kendo UI Version
Currently on Kendo UI 16.2.0, which is 5 major versions behind the latest stable (21.3.0).

### Node.js Version
No .nvmrc file exists, allowing version drift across development environments.

## Next Steps

Phase 1 will focus on standardizing TypeScript to version 5.9.3 across all packages, which is required for Angular 21 compatibility.

## Usage

These baseline files will be compared against post-upgrade measurements to demonstrate:
- Reduction in warnings
- Resolution of version conflicts
- Security vulnerability fixes
- Overall build health improvements

---

**Note**: This baseline was captured on the MJ_v3 branch as part of the Phase 0 preparation step of the upgrade plan documented in [plans/3_0_packages_version_upgrades.md](../3_0_packages_version_upgrades.md).

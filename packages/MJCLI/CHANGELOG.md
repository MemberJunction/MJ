# Change Log - @memberjunction/cli

## 2.39.0

### Patch Changes

- @memberjunction/codegen-lib@2.39.0

## 2.38.0

### Patch Changes

- @memberjunction/codegen-lib@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/codegen-lib@2.37.1

## 2.37.0

### Patch Changes

- @memberjunction/codegen-lib@2.37.0

## 2.36.1

### Patch Changes

- @memberjunction/codegen-lib@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
  - @memberjunction/codegen-lib@2.36.0

## 2.35.1

### Patch Changes

- @memberjunction/codegen-lib@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/codegen-lib@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/codegen-lib@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/codegen-lib@2.34.1

## 2.34.0

### Patch Changes

- @memberjunction/codegen-lib@2.34.0

## 2.33.0

### Patch Changes

- @memberjunction/codegen-lib@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/codegen-lib@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/codegen-lib@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/codegen-lib@2.32.0

## 2.31.0

### Patch Changes

- Updated dependencies [946b64e]
- Updated dependencies [45a552e]
  - @memberjunction/codegen-lib@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [90dd865]
- Updated dependencies [a3ab749]
  - @memberjunction/codegen-lib@2.30.0

## 2.29.2

### Patch Changes

- 7a9ee63: Adjust exports to avoid loading config during build
- Updated dependencies [07bde92]
- Updated dependencies [598b9b5]
  - @memberjunction/codegen-lib@2.29.2

## 2.28.0

### Patch Changes

- @memberjunction/codegen-lib@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/codegen-lib@2.27.1

## 2.27.0

### Patch Changes

- @memberjunction/codegen-lib@2.27.0

## 2.26.1

### Patch Changes

- Updated dependencies [896ada0]
- Updated dependencies [a8ff81f]
  - @memberjunction/codegen-lib@2.26.1

## 2.26.0

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/codegen-lib@2.26.0

## 2.25.0

### Patch Changes

- Updated dependencies [fd07dcd]
  - @memberjunction/codegen-lib@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/codegen-lib@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [b5d480c]
- Updated dependencies [871fa69]
- Updated dependencies [93d3ee2]
  - @memberjunction/codegen-lib@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/codegen-lib@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/codegen-lib@2.23.1

## 2.23.0

### Minor Changes

- cae74af: Added some better handling of the tag argument for `mj migrate` so semver strings like `2.22.2` work as well as properly formatted tags like `v2.22.2`.

  #### Unrelated tweak that triggers a minor version

  Also added a flyway variable to the repeatable metadata maintenance migration to ensure it runs every time (not just every time its checksum changes).

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/codegen-lib@2.23.0

## 2.22.2

### Patch Changes

- @memberjunction/codegen-lib@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/codegen-lib@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [9660275]
  - @memberjunction/codegen-lib@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Bump @memberjunction/codegen-lib to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:28 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:29 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:44 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Applying package updates [skip ci] (craig@memberjunction.com)
- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.13.3

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)

## 2.6.0

Sat, 28 Sep 2024 00:19:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.5.2

Sat, 28 Sep 2024 00:06:03 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.5.0

Fri, 20 Sep 2024 16:17:07 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.7.0

Wed, 12 Jun 2024 18:53:38 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.3

Tue, 11 Jun 2024 04:01:38 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)

## 1.4.0

Sat, 25 May 2024 15:30:17 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Add more validation in install script (craig.adam@bluecypress.io)

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Check node version in install (closes #161) (craig.adam@bluecypress.io)

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Add CLI package (craig.adam@bluecypress.io)

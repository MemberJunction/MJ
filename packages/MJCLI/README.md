MemberJunction CLI
==================

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @memberjunction/cli
$ mj COMMAND
running command...
$ mj (--version)
@memberjunction/cli/2.33.0 linux-x64 node-v20.19.0
$ mj --help [COMMAND]
USAGE
  $ mj COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`mj bump`](#mj-bump)
* [`mj clean`](#mj-clean)
* [`mj codegen`](#mj-codegen)
* [`mj help [COMMAND]`](#mj-help-command)
* [`mj install`](#mj-install)
* [`mj migrate`](#mj-migrate)
* [`mj version`](#mj-version)

## `mj bump`

Bumps MemberJunction dependency versions

```
USAGE
  $ mj bump [-v] [-r] [-t <value>] [-q] [-d]

FLAGS
  -d, --dry          Dry run, do not write changes to package.json files
  -q, --quiet        Only output paths for updated packages
  -r, --recursive    Bump version in current directory and all subdirectories
  -t, --tag=<value>  Version tag to bump target for bump (e.g. v2.10.0), defaults to the CLI version
  -v, --verbose      Enable additional logging

DESCRIPTION
  Bumps MemberJunction dependency versions

EXAMPLES
  Bump all @memberjunction/* dependencies in the current directory's package.json to the CLI version

    $ mj bump

  Preview all recursive packages bumps without writing any changes.

    $ mj bump -rdv

  Recursively bump all @memberjunction/* dependencies in all packages to version v2.10.0 and output only the paths
  containing the updated package.json files. Pipe the output to xargs to run npm install in each directory and update
  the package-lock.json files as well.

    $ mj bump -rqt v2.10.0 | xargs -n1 -I{} npm install --prefix {}
```

_See code: [src/commands/bump/index.ts](https://github.com/MemberJunction/MJ/blob/v2.33.0/src/commands/bump/index.ts)_

## `mj clean`

Resets the MemberJunction database to a pre-installation state

```
USAGE
  $ mj clean [-v]

FLAGS
  -v, --verbose  Enable additional logging

DESCRIPTION
  Resets the MemberJunction database to a pre-installation state

EXAMPLES
  $ mj clean
```

_See code: [src/commands/clean/index.ts](https://github.com/MemberJunction/MJ/blob/v2.33.0/src/commands/clean/index.ts)_

## `mj codegen`

Run CodeGen to generate code and update metadata for MemberJunction

```
USAGE
  $ mj codegen [--skipdb]

FLAGS
  --skipdb  Skip database migration

DESCRIPTION
  Run CodeGen to generate code and update metadata for MemberJunction

EXAMPLES
  $ mj codegen
```

_See code: [src/commands/codegen/index.ts](https://github.com/MemberJunction/MJ/blob/v2.33.0/src/commands/codegen/index.ts)_

## `mj help [COMMAND]`

Display help for mj.

```
USAGE
  $ mj help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for mj.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.3/src/commands/help.ts)_

## `mj install`

Install MemberJunction

```
USAGE
  $ mj install [-v]

FLAGS
  -v, --verbose  Enable additional logging

DESCRIPTION
  Install MemberJunction

EXAMPLES
  $ mj install
```

_See code: [src/commands/install/index.ts](https://github.com/MemberJunction/MJ/blob/v2.33.0/src/commands/install/index.ts)_

## `mj migrate`

Migrate MemberJunction database to latest version

```
USAGE
  $ mj migrate [-v] [-t <value>]

FLAGS
  -t, --tag=<value>  Version tag to use for running remote migrations
  -v, --verbose      Enable additional logging

DESCRIPTION
  Migrate MemberJunction database to latest version

EXAMPLES
  $ mj migrate
```

_See code: [src/commands/migrate/index.ts](https://github.com/MemberJunction/MJ/blob/v2.33.0/src/commands/migrate/index.ts)_

## `mj version`

```
USAGE
  $ mj version [--json] [--verbose]

FLAGS
  --verbose  Show additional information about the CLI.

GLOBAL FLAGS
  --json  Format output as json.

FLAG DESCRIPTIONS
  --verbose  Show additional information about the CLI.

    Additionally shows the architecture, node version, operating system, and versions of plugins that the CLI is using.
```

_See code: [@oclif/plugin-version](https://github.com/oclif/plugin-version/blob/v2.2.4/src/commands/version.ts)_
<!-- commandsstop -->

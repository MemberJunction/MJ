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
@memberjunction/cli/2.0.0 darwin-arm64 node-v20.15.1
$ mj --help [COMMAND]
USAGE
  $ mj COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`mj clean`](#mj-clean)
* [`mj codegen`](#mj-codegen)
* [`mj help [COMMAND]`](#mj-help-command)
* [`mj install`](#mj-install)
* [`mj migrate`](#mj-migrate)
* [`mj test`](#mj-test)
* [`mj version`](#mj-version)

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

_See code: [src/commands/clean/index.ts](https://github.com/MemberJunction/MJ/blob/v2.0.0/src/commands/clean/index.ts)_

## `mj codegen`

Runs the MemberJunction code generation

```
USAGE
  $ mj codegen [--skipdb]

FLAGS
  --skipdb  Enable additional logging

DESCRIPTION
  Runs the MemberJunction code generation

EXAMPLES
  $ mj codegen
```

_See code: [src/commands/codegen/index.ts](https://github.com/MemberJunction/MJ/blob/v2.0.0/src/commands/codegen/index.ts)_

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

_See code: [src/commands/install/index.ts](https://github.com/MemberJunction/MJ/blob/v2.0.0/src/commands/install/index.ts)_

## `mj migrate`

Migrate MemberJunction database to latest version

```
USAGE
  $ mj migrate [-v]

FLAGS
  -v, --verbose  Enable additional logging

DESCRIPTION
  Migrate MemberJunction database to latest version

EXAMPLES
  $ mj migrate
```

_See code: [src/commands/migrate/index.ts](https://github.com/MemberJunction/MJ/blob/v2.0.0/src/commands/migrate/index.ts)_

## `mj test`

An empty commad to test CLI debugging

```
USAGE
  $ mj test [-v]

FLAGS
  -v, --verbose  Enable additional logging

DESCRIPTION
  An empty commad to test CLI debugging

EXAMPLES
  $ mj test
```

_See code: [src/commands/test/index.ts](https://github.com/MemberJunction/MJ/blob/v2.0.0/src/commands/test/index.ts)_

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

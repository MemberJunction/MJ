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
@memberjunction/cli/1.0.11 darwin-arm64 node-v20.12.2
$ mj --help [COMMAND]
USAGE
  $ mj COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`mj help [COMMAND]`](#mj-help-command)
* [`mj install`](#mj-install)
* [`mj version`](#mj-version)

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.0.21/src/commands/help.ts)_

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

_See code: [src/commands/install/index.ts](https://github.com/MemberJunction/MJ/blob/v1.0.11/src/commands/install/index.ts)_

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

_See code: [@oclif/plugin-version](https://github.com/oclif/plugin-version/blob/v2.0.17/src/commands/version.ts)_
<!-- commandsstop -->

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
@memberjunction/cli/1.0.11 darwin-arm64 node-v18.19.1
$ mj --help [COMMAND]
USAGE
  $ mj COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`mj hello PERSON`](#mj-hello-person)
* [`mj hello world`](#mj-hello-world)
* [`mj help [COMMAND]`](#mj-help-command)
* [`mj install`](#mj-install)
* [`mj plugins`](#mj-plugins)
* [`mj plugins add PLUGIN`](#mj-plugins-add-plugin)
* [`mj plugins:inspect PLUGIN...`](#mj-pluginsinspect-plugin)
* [`mj plugins install PLUGIN`](#mj-plugins-install-plugin)
* [`mj plugins link PATH`](#mj-plugins-link-path)
* [`mj plugins remove [PLUGIN]`](#mj-plugins-remove-plugin)
* [`mj plugins reset`](#mj-plugins-reset)
* [`mj plugins uninstall [PLUGIN]`](#mj-plugins-uninstall-plugin)
* [`mj plugins unlink [PLUGIN]`](#mj-plugins-unlink-plugin)
* [`mj plugins update`](#mj-plugins-update)

## `mj hello PERSON`

Say hello

```
USAGE
  $ mj hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ oex hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/MemberJunction/MJ/blob/v1.0.11/src/commands/hello/index.ts)_

## `mj hello world`

Say hello world

```
USAGE
  $ mj hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ mj hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/MemberJunction/MJ/blob/v1.0.11/src/commands/hello/world.ts)_

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
  $ mj install

DESCRIPTION
  Install MemberJunction

EXAMPLES
  $ mj install
```

_See code: [src/commands/install/index.ts](https://github.com/MemberJunction/MJ/blob/v1.0.11/src/commands/install/index.ts)_

## `mj plugins`

List installed plugins.

```
USAGE
  $ mj plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ mj plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.14/src/commands/plugins/index.ts)_

## `mj plugins add PLUGIN`

Installs a plugin into mj.

```
USAGE
  $ mj plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into mj.

  Uses bundled npm executable to install plugins into /Users/cadam/.local/share/mj

  Installation of a user-installed plugin will override a core plugin.

  Use the MJ_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the MJ_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ mj plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ mj plugins add myplugin

  Install a plugin from a github url.

    $ mj plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ mj plugins add someuser/someplugin
```

## `mj plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ mj plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ mj plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.14/src/commands/plugins/inspect.ts)_

## `mj plugins install PLUGIN`

Installs a plugin into mj.

```
USAGE
  $ mj plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into mj.

  Uses bundled npm executable to install plugins into /Users/cadam/.local/share/mj

  Installation of a user-installed plugin will override a core plugin.

  Use the MJ_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the MJ_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ mj plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ mj plugins install myplugin

  Install a plugin from a github url.

    $ mj plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ mj plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.14/src/commands/plugins/install.ts)_

## `mj plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ mj plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ mj plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.14/src/commands/plugins/link.ts)_

## `mj plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ mj plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ mj plugins unlink
  $ mj plugins remove

EXAMPLES
  $ mj plugins remove myplugin
```

## `mj plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ mj plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.14/src/commands/plugins/reset.ts)_

## `mj plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ mj plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ mj plugins unlink
  $ mj plugins remove

EXAMPLES
  $ mj plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.14/src/commands/plugins/uninstall.ts)_

## `mj plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ mj plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ mj plugins unlink
  $ mj plugins remove

EXAMPLES
  $ mj plugins unlink myplugin
```

## `mj plugins update`

Update installed plugins.

```
USAGE
  $ mj plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.0.14/src/commands/plugins/update.ts)_
<!-- commandsstop -->

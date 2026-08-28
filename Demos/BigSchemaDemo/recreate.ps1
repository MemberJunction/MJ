# Recreate the BigSchemaDemo schemas on Windows. Same contract as recreate.sh.
param(
    [string]$Profile = "standard",
    [string]$EnvFile = "",
    [switch]$RecreateDatabase,
    [switch]$Bootstrap,
    [switch]$NoGenerate
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "../..")
if (-not $EnvFile) { $EnvFile = Join-Path $RepoRoot ".env" }

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $pair = $_ -split '=', 2
    $key = $pair[0].Trim()
    $val = $pair[1].Trim().Trim("'").Trim('"')
    Set-Item -Path "Env:$key" -Value $val
}

$forbidden = @('MJ_6_1_0', 'MJ_DEV', 'MJ_6_0_0', 'master', 'tempdb', 'model', 'msdb')
if ($forbidden -contains $env:DB_DATABASE) {
    throw "Refusing to run BigSchemaDemo against shared database '$($env:DB_DATABASE)'."
}

if (-not $NoGenerate) {
    node (Join-Path $ScriptDir "generate.mjs") --profile $Profile
}

$sqlcmd = @("-S", "$($env:DB_HOST),$($env:DB_PORT)", "-U", $env:DB_USERNAME, "-P", $env:DB_PASSWORD, "-C", "-b")

if ($RecreateDatabase -or $Bootstrap) {
    & sqlcmd @sqlcmd -d master -Q "IF DB_ID(N'$($env:DB_DATABASE)') IS NOT NULL BEGIN ALTER DATABASE [$($env:DB_DATABASE)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$($env:DB_DATABASE)]; END; CREATE DATABASE [$($env:DB_DATABASE)];"
}

if ($Bootstrap) {
    Push-Location $RepoRoot
    try {
        npx mj migrate
        npx mj codegen --skipfiles
        npx mj sync push --dir=metadata --ci
        npx mj codegen --skipdb
    } finally {
        Pop-Location
    }
}

$SqlDir = Join-Path $ScriptDir "sql/$Profile"
foreach ($file in @('00_drop.sql', '01_schemas.sql', '02_tables.sql', '03_fks.sql', '04_seed.sql')) {
    & sqlcmd @sqlcmd -d $env:DB_DATABASE -i (Join-Path $SqlDir $file)
}

Write-Host "Done. Schemas are bsd_* in [$($env:DB_DATABASE)]."

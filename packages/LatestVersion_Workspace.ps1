# Function to get the current version of a library from its package.json
function GetLibraryVersion($libraryName) {
    $libraryPackageJsonPath = "../$libraryName/package.json"
    if (Test-Path $libraryPackageJsonPath) {
        $libraryPackageJson = Get-Content $libraryPackageJsonPath | ConvertFrom-Json
        return $libraryPackageJson.version
    } else {
        Write-Host "Warning: package.json not found for $libraryName"
        return $null
    }
}


# Define a custom object for each executable project
$remainingProjects = @(
    @{Name='CodeGen'; Dependencies=@('codegen-lib')},
    @{Name='GeneratedEntities'; Dependencies=@('global', 'core')},
    @{Name='MJAPI'; Dependencies=@('global', 'core', 'ai', 'sqlserver-dataprovider', 'server')},
    @{Name='MJExplorer'; Dependencies=@('global', 'core', 'core-entities', 'graphql-dataprovider'); AngularDeps=@('ng-container-directives', 'ng-link-directives', 'ng-compare-records', 'ng-record-changes', 'ng-user-view-grid', 'ng-explorer-core', 'ng-auth-services')}
)

# Define base libraries
$baseLibraries = @(
    @{Name='MJGlobal'; PackageName='global'; Dependencies=@()},
    @{Name='MJCore'; PackageName='core'; Dependencies=@('global')},
    @{Name='MJCoreEntities'; PackageName='core-entities'; Dependencies=@('global', 'core')},
    @{Name='MJQueue'; PackageName='queue'; Dependencies=@('global', 'core')},
    @{Name='MJAI'; PackageName='ai'; Dependencies=@('global', 'core')},
    @{Name='SQLServerDataProvider'; PackageName='sqlserver-dataprovider'; Dependencies=@('global', 'core', 'core-entities', 'queue', 'ai')},
    @{Name='CodeGenLib'; PackageName='codegen-lib'; Dependencies=@('global', 'core', 'sqlserver-dataprovider')},
    @{Name='GraphQLDataProvider'; PackageName='graphql-dataprovider'; Dependencies=@('global', 'core', 'core-entities')},
    @{Name='GeneratedEntities'; PackageName=$null; Dependencies=@('global', 'core')},
    @{Name='MJServer'; PackageName='server'; Dependencies=@('global', 'core', 'core-entities', 'queue', 'ai', 'sqlserver-dataprovider')}
)
# Define Angular libraries, adding the sub-folder path
$angularLibraries = @(
    @{Name='auth-services'; PackageName='ng-auth-services'; Dependencies=@('core')},
    @{Name='container-directives'; PackageName='ng-container-directives'; Dependencies=@('global', 'core')},
    @{Name='link-directives'; PackageName='ng-link-directives'; Dependencies=@('core')},
    @{Name='compare-records'; PackageName='ng-compare-records'; Dependencies=@('core', 'core-entities')},
    @{Name='record-changes'; PackageName='ng-record-changes'; Dependencies=@('global', 'core')},
    @{Name='user-view-grid'; PackageName='ng-user-view-grid'; Dependencies=@('global', 'core', 'core-entities', 'ng-compare-records', 'ng-container-directives')},
    @{Name='explorer-core'; PackageName='ng-explorer-core'; Dependencies=@('global', 'core', 'ng-user-view-grid', 'ng-record-changes', 'ng-compare-records', 'ng-container-directives')}
)

# Iterate over the custom objects
foreach ($projObject in $remainingProjects) {
    $proj = $projObject.Name
    Write-Host "Updating dependencies for $proj"
    Set-Location "$proj"

    $packageJsonPath = "./package.json"
    $packageJson = Get-Content $packageJsonPath | ConvertFrom-Json

    # Update dependencies
    foreach ($dep in $projObject.Dependencies) {
        $library = $baseLibraries | Where-Object { $_.PackageName -eq $dep }
        $version = GetLibraryVersion $library.Name
        if ($null -ne $version) {
            $packageJson.dependencies."@memberjunction/$dep" = "^$version"
        }
    }

    # Handle Angular Libraries dependencies if AngularDeps exists
    if ($projObject.AngularDeps) {
        foreach ($lib in $projObject.AngularDeps) {
            $library = $angularLibraries | Where-Object { $_.PackageName -eq $lib }
            $version = GetLibraryVersion ("Angular Components/" + $library.Name)
            if ($null -ne $version) {
                $packageJson.dependencies."@memberjunction/$lib" = "^$version"
            }
        }
    }

    $packageJson | ConvertTo-Json | Set-Content $packageJsonPath

    Set-Location ..
}

# ask the user if they want us to build GeneratedEntities or not
$buildGeneratedEntities = Read-Host "Do you want to build GeneratedEntities? (y/n)"
if ($buildGeneratedEntities -eq 'y') {
    Write-Host "Building GeneratedEntities"
    Set-Location "GeneratedEntities"
    npm run build
    Set-Location ..
}

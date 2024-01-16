# THIS SCRIPT WILL UPDATE THE LOCAL PROJECT HIERARCHY TO ENSURE THAT CodeGen, MJAPI AND MJExplorer ARE USING THE LATEST VERSION OF EACH DEPENDENCY
function InstallLatestVersion($packageName) {
    npm install @memberjunction/$packageName@latest --save
}
function LinkAllDependencies($dependenciesArray) {
    $linkString = $dependenciesArray | ForEach-Object { "@memberjunction/$_" }
    npm link $linkString
}

# Prompt the user for local linking
$useLocalLinking = Read-Host "Do you want to use local linking? (y/n)"

# Define a custom object for each executable project
$remainingProjects = @(
    @{Name='CodeGen'; Dependencies=@('codegen-lib')},
    @{Name='GeneratedEntities'; Dependencies=@('global', 'core')},
    @{Name='MJAPI'; Dependencies=@('global', 'core', 'ai', 'sqlserver-dataprovider', 'server')},
    @{Name='MJExplorer'; Dependencies=@('global', 'core', 'core-entities', 'graphql-dataprovider'); AngularDeps=@('ng-container-directives', 'ng-link-directives', 'ng-compare-records', 'ng-record-changes', 'ng-user-view-grid', 'ng-explorer-core', 'ng-auth-services', 'ng-core-entity-forms')}
)
# Iterate over the custom objects
foreach ($projObject in $remainingProjects) {
    $proj = $projObject.Name
    Write-Host "Updating dependencies for $proj"
    Set-Location $proj

    npm i # install all dependencies first
    
    # Use the InstallLatestVersion function for each dependency
    foreach ($dep in $projObject.Dependencies) {
        InstallLatestVersion $dep
    }

    # Handle Angular Libraries dependencies if AngularDeps exists
    if ($projObject.AngularDeps) {
        foreach ($lib in $projObject.AngularDeps) {
            Write-Host "   >>> Installing Latest $lib for $proj"
            InstallLatestVersion $lib
        }

        if ($useLocalLinking -eq 'y') {
            # Combine AngularDeps and Dependencies into one array
            $allDeps = $projObject.Dependencies + $projObject.AngularDeps
            LinkAllDependencies $allDeps
        }
    }
    elseif ($useLocalLinking -eq 'y') {
        # Link all dependencies in a single command to switch to local linking
        LinkAllDependencies $projObject.Dependencies
    }

    Set-Location ..
}

# ask the user if they want us to build GeneratedEntities or not
$buildGeneratedEntities = Read-Host "Do you want to build GeneratedEntities? (y/n)"
if ($buildGeneratedEntities -eq 'y') {
    Write-Host "Building GeneratedEntities"
    Set-Location GeneratedEntities
    npm run build
    Set-Location ..
}
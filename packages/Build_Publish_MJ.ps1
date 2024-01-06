function Get-ChangesSinceLastBuild {
    param (
        [string]$directoryPath
    )
    $buildLogPath = Join-Path $directoryPath "build.log.json"

    if (Test-Path $buildLogPath) {
        $lastBuildTime = (Get-Content $buildLogPath | ConvertFrom-Json | Select-Object -Last 1).buildTime
        $changes = git log --since="$lastBuildTime" -- $directoryPath
        return $null -ne $changes
    }

    return $true # Assume true if no log found
}


function Update-BuildLog {
    param (
        [string]$directoryPath
    )
    $buildLogPath = Join-Path $directoryPath "build.log.json"
    $currentDateTime = Get-Date -Format "o" # ISO 8601 format

    $logObject = if (Test-Path $buildLogPath) {
        Get-Content $buildLogPath | ConvertFrom-Json
    } else {
        @()
    }

    $logObject += @{ "buildTime" = $currentDateTime }
    $logObject | ConvertTo-Json -Depth 64 | Set-Content $buildLogPath
}


# Define function to update package.json patch version number
function Update-PatchVersion {
    $json = Get-Content 'package.json' | ConvertFrom-Json
    $version = $json.version -split '\.'
    $patch = [int]$version[2] + 1
    $newVersion = "$($version[0]).$($version[1]).$patch"
    $json.version = $newVersion
    $json | ConvertTo-Json -Depth 64 | Set-Content 'package.json'
}
function MapPackageNameToDirectoryName($packageName, $isCurrentAngular = $false) {
    $directoryName = $null

    # First, search in $baseLibraries
    $match = $baseLibraries | Where-Object {$_.PackageName -eq $packageName}
    if ($match) {
        $directoryName = $match.Name
        if ($isCurrentAngular) {
            $directoryName = "../$directoryName"
        }
    }

    # If not found, search in $angularLibraries
    if (!$directoryName) {
        $match = $angularLibraries | Where-Object {$_.PackageName -eq $packageName}
        if ($match) {
            $directoryName = $match.Name
            # Only add "Angular Components\" if we're not inside an Angular package
            if (!$isCurrentAngular) {
                $directoryName = "Angular Components/$directoryName"
            }
        }
    }

    return $directoryName
}

function UpdatePackageJSONToLatestDependencyVersion($packageName, $isAngular = $false) {
    # Use the MapPackageNameToDirectoryName function to get the correct directory name
    $directoryName = MapPackageNameToDirectoryName $packageName $isAngular

    if (!$directoryName) {
        Write-Host "Couldn't map package name to directory name for $packageName, halting the script."
        exit
    }

    # Adjust the path if the current package is an Angular package
    $prefix = "" #$isAngular ? "../" : ""
    $dependencyPath = $prefix + "../$directoryName/package.json"

    if (Test-Path $dependencyPath) {
        $depJson = Get-Content $dependencyPath | ConvertFrom-Json
        $latestVersion = $depJson.version

        # Update the current package's package.json
        $currentPackageJsonPath = './package.json'
        $currentJson = Get-Content $currentPackageJsonPath | ConvertFrom-Json
        $currentJson.dependencies."@memberjunction/$packageName" = "^$latestVersion"

        # next up, try to update package.json - sometimes this requires a few tries as the prior iteration of this function might have a lock that hasn't released yet so we retry and wait between retries
        $retryCount = 0
        $maxRetries = 10
        $retryDelay = 3 # seconds
        $success = $false

        while (-not $success -and $retryCount -lt $maxRetries) {
            try {
                $currentJson | ConvertTo-Json -Depth 64 | Set-Content $currentPackageJsonPath -ErrorAction Stop
                Write-Host "Updated $packageName to version ^$latestVersion in package.json"
                $success = $true
            }
            catch {
                $retryCount++
                Write-Host "Attempt $retryCount to update $packageName failed, retrying in $retryDelay seconds..."
                Start-Sleep -Seconds $retryDelay
            }
        }

        if (-not $success) {
            Write-Host "Failed to update $packageName after $maxRetries attempts, halting the script."
            exit
        }
    }
    else {
        Write-Host "Couldn't find package.json for $directoryName, halting the script."
        exit
    }
}

function InstallLatestVersion($packageName) {
    npm install @memberjunction/$packageName@latest --save
}
function LinkAllDependencies($dependenciesArray) {
    $linkString = $dependenciesArray | ForEach-Object { "@memberjunction/$_" }
    npm link $linkString
}

# Step 1: Building and Publishing foundational libraries
# Prompt the user for local linking
$publishToNPM = Read-Host "Do you want to publish to npm? (y/n)"

# Define a custom object for each library including the directory name and the dependencies list (in order)
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
# Iterate over the custom objects
foreach ($libObject in $baseLibraries) {
    $lib = $libObject.Name
    Write-Host "Checking for changes in $lib"
    Set-Location $lib

    if (Get-ChangesSinceLastBuild ".") {
        Write-Host "Changes detected in $lib, proceeding with build and publish"

        # Logic for building and publishing
        Write-Host "Building and publishing $lib"

        if ($lib -ne 'GeneratedEntities') {
            Update-PatchVersion
        }

        # Use the UpdatePackageJSONToLatestDependencyVersion function for each dependency
        foreach ($dep in $libObject.Dependencies) {
            UpdatePackageJSONToLatestDependencyVersion $dep $false
        }

        # build the project
        npm run build 

        if ($LASTEXITCODE -ne 0) {
            # if the build fails, halt the script
            Write-Host "Error building $lib. Halting the script."
            exit
        }    

        if ($lib -ne 'GeneratedEntities' -and $publishToNPM -eq 'y') {
            npm publish --access public

            # Update build log after successful publish
            Update-BuildLog "."
        }        
    } 
    else {
        Write-Host "No changes in $lib since last build, skipping this library"
    }

    Set-Location ..
}

# Step 2: Building and Publishing Angular libraries

# Define a custom object for each Angular library
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
foreach ($libObject in $angularLibraries) {
    $lib = $libObject.Name
    Write-Host "Checking for changes in Angular Library: $lib"
    Set-Location ('Angular Components\' + $lib)

    if (Get-ChangesSinceLastBuild ".") {
        Write-Host "Changes detected in Angular Library: $lib, proceeding with build and publish"

        # Logic for updating package JSON and building
        Write-Host "Building and publishing Angular Library: $lib"
        Set-Location ('Angular Components\' + $lib)

        Update-PatchVersion

        # Use the UpdatePackageJSONToLatestDependencyVersion function for each dependency
        foreach ($dep in $libObject.Dependencies) {
            UpdatePackageJSONToLatestDependencyVersion $dep $true
        }

        # Build the project
        npm run build

        if ($LASTEXITCODE -ne 0) {
            # if the build fails, halt the script
            Write-Host "Error building $lib. Halting the script."
            exit
        }    

        if ($publishToNPM -eq 'y') {
            npm publish --access public

            # Update build log after successful publish
            Update-BuildLog "."
        }
    } 
    else {
        Write-Host "No changes in $lib since last build, skipping this Angular library"
    }

    Set-Location ..\..
}


# Step 3: Update dependencies in executable projects
# Define a custom object for each executable project
$remainingProjects = @(
    @{Name='CodeGen'; Dependencies=@('codegen-lib')},
    @{Name='MJAPI'; Dependencies=@('global', 'core', 'ai', 'sqlserver-dataprovider', 'server')},
    @{Name='MJExplorer'; Dependencies=@('global', 'core', 'core-entities', 'graphql-dataprovider'); AngularDeps=@('ng-auth-services', 'ng-compare-records', 'ng-container-directives', 'ng-explorer-core', 'ng-link-directives', 'ng-record-changes', 'ng-user-view-grid')}
)
# Iterate over the custom objects
foreach ($projObject in $remainingProjects) {
    $proj = $projObject.Name
    Write-Host "Updating dependencies for $proj"
    Set-Location $proj

    # Use the InstallLatestVersion function for each dependency
    foreach ($dep in $projObject.Dependencies) {
        UpdatePackageJSONToLatestDependencyVersion $dep $false
    }

    # Handle Angular Libraries dependencies if AngularDeps exists
    if ($projObject.AngularDeps) {
        foreach ($lib in $projObject.AngularDeps) {
            Write-Host "   >>> Installing Latest $lib for $proj"
            UpdatePackageJSONToLatestDependencyVersion $lib $false
        }
        # # Combine AngularDeps and Dependencies into one array
        # $allDeps = $projObject.Dependencies + $projObject.AngularDeps
        # LinkAllDependencies $allDeps
    }
    else {
        # # Link all dependencies in a single command to switch to local linking
        # LinkAllDependencies $projObject.Dependencies
    }

    Set-Location ..
}

Write-Host "ALL DONE!"

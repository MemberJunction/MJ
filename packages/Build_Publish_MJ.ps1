function Test-FileChangesRecursive {
    param (
        [string]$directoryPath,
        [datetime]$lastBuildTime
    )
    $buildLogIdentifier = "build.log.json"

    # Get all files in the directory and subdirectories, excluding the build log
    $files = Get-ChildItem -Path $directoryPath -Recurse -File | Where-Object { $_.Name -notmatch $buildLogIdentifier }

    # Check if any file has been modified since the last build time
    foreach ($file in $files) {
        if ($file.LastWriteTime -gt $lastBuildTime) {
            return $true
        }
    }

    return $false # Return false if no files have changed since the last build
}

function Get-ChangesSinceLastBuild {
    param (
        [string]$directoryPath
    )
    $buildLogPath = Join-Path $directoryPath "build.log.json"

    if (Test-Path $buildLogPath) {
        $lastBuildTime = [datetime](Get-Content $buildLogPath | ConvertFrom-Json | Select-Object -Last 1).buildTime

        # Check for file changes recursively
        return Test-FileChangesRecursive -directoryPath $directoryPath -lastBuildTime $lastBuildTime
    }

    return $false # Assume false if no log found
}


function Update-BuildLog {
    param (
        [string]$directoryPath
    )
    $buildLogPath = Join-Path $directoryPath "build.log.json"
    $currentDateTime = Get-Date -Format "o" # ISO 8601 format

    $logObject = @()
    if (Test-Path $buildLogPath) {
        # Force $logObject to be an array even if there's only one item in the JSON file
        $logObject = @(Get-Content $buildLogPath | ConvertFrom-Json)
    }

    # Safely add a new entry
    $logObject += @{ "buildTime" = $currentDateTime }

    # Save back to the file
    $logObject | ConvertTo-Json -Depth 64 | Set-Content $buildLogPath
}



# Define function to update package.json patch version number
# function Update-PatchVersion {
#     $json = Get-Content 'package.json' | ConvertFrom-Json
#     $version = $json.version -split '\.'
#     $patch = [int]$version[2] + 1
#     $newVersion = "$($version[0]).$($version[1]).$patch"
#     $json.version = $newVersion
#     $json | ConvertTo-Json -Depth 64 | Set-Content 'package.json'
# }


function Update-PatchVersion {
    param (
        [int]$maxRetries = 10, # Maximum number of retries
        [int]$retryDelay = 4  # Delay in seconds between retries
    )

    $attempt = 0
    $success = $false

    while ($attempt -lt $maxRetries -and -not $success) {
        try {
            $json = Get-Content 'package.json' -Raw | ConvertFrom-Json
            $version = $json.version -split '\.'
            $patch = [int]$version[2] + 1
            $newVersion = "$($version[0]).$($version[1]).$patch"
            $json.version = $newVersion
            $json | ConvertTo-Json -Depth 64 | Set-Content 'package.json'
            $success = $true
        } catch {
            Write-Host "   Attempt $attempt to update package.json failed. Retrying in $retryDelay seconds..."
            Start-Sleep -Seconds $retryDelay
            $attempt++
        }
    }

    if (-not $success) {
        Write-Host "   Failed to update package.json after $maxRetries attempts."
        throw "Update-PatchVersion failed after multiple retries."
    }
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
        Write-Host "   Couldn't map package name to directory name for $packageName, halting the script."
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

        # Retrieve the current version of the package
        $currentVersion = $currentJson.dependencies."@memberjunction/$packageName"

        # Check if the current version is already the same as the latest version
        if ($currentVersion -ne "^$latestVersion") {
            $currentJson.dependencies."@memberjunction/$packageName" = "^$latestVersion"

            # next up, try to update package.json - sometimes this requires a few tries as the prior iteration of this function might have a lock that hasn't released yet so we retry and wait between retries
            $retryCount = 0
            $maxRetries = 10
            $retryDelay = 4 # seconds
            $success = $false

            while (-not $success -and $retryCount -lt $maxRetries) {
                try {
                    $currentJson | ConvertTo-Json -Depth 64 | Set-Content $currentPackageJsonPath -ErrorAction Stop
                    Write-Host "      Updated $packageName to version ^$latestVersion in package.json"
                    $success = $true
                }
                catch {
                    $retryCount++
                    Write-Host "      Attempt $retryCount to update $packageName failed, retrying in $retryDelay seconds..."
                    Start-Sleep -Seconds $retryDelay
                }
            }

            if (-not $success) {
                Write-Host "      Failed to update $packageName after $maxRetries attempts, halting the script."
                exit
            }
        }
        else {
            Write-Host "      No need to update $packageName, it's already at the latest version."
        }
    }
    else {
        Write-Host "      Couldn't find package.json for $directoryName, halting the script."
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
$ignoreBuildLog = Read-Host "Do you want to ignore the build log (and build/publish EVERYTHING, regardless of if things changed)? (y/n)"

# Define a custom object for each library including the directory name and the dependencies list (in order)
$baseLibraries = @(
    @{Name='MJGlobal'; PackageName='global'; Dependencies=@()},
    @{Name='MJAI'; PackageName='ai'; Dependencies=@()},
    @{Name='MJCore'; PackageName='core'; Dependencies=@('global')},
    @{Name='MJCoreEntities'; PackageName='core-entities'; Dependencies=@('global', 'core')},
    @{Name='MJAIEngine'; PackageName='aiengine'; Dependencies=@('global', 'core', 'core-entities', 'ai')},
    @{Name='MJQueue'; PackageName='queue'; Dependencies=@('global', 'core', 'core-entities', 'ai')},
    @{Name='SQLServerDataProvider'; PackageName='sqlserver-dataprovider'; Dependencies=@('global', 'core', 'core-entities', 'queue', 'ai')},
    @{Name='CodeGenLib'; PackageName='codegen-lib'; Dependencies=@('global', 'core', 'sqlserver-dataprovider')},
    @{Name='GraphQLDataProvider'; PackageName='graphql-dataprovider'; Dependencies=@('global', 'core', 'core-entities')},
    @{Name='GeneratedEntities'; PackageName=$null; Dependencies=@('global', 'core')},
    @{Name='MJServer'; PackageName='server'; Dependencies=@('global', 'core', 'core-entities', 'queue', 'ai', 'aiengine', 'sqlserver-dataprovider')}
)
# Iterate over the custom objects
foreach ($libObject in $baseLibraries) {
    $lib = $libObject.Name
    Write-Host "Processing $lib"
    Write-Host "   Checking for changes"
    Set-Location $lib

    # always update the dependencies to the latest versions for each package before we test for changes.
    # Use the UpdatePackageJSONToLatestDependencyVersion function for each dependency
    foreach ($dep in $libObject.Dependencies) {
        UpdatePackageJSONToLatestDependencyVersion $dep $false
    }

    if (($ignoreBuildLog -eq "y") -or (Get-ChangesSinceLastBuild ".")) {
        Write-Host "      Changes detected in $lib, proceeding with build and publish (OR, you chose to ignore the build log)"

        # Logic for building and publishing
        Write-Host "   Building and publishing $lib"

        if ($lib -ne 'GeneratedEntities') {
            Update-PatchVersion
        }

        # build the project
        npm run build 

        if ($LASTEXITCODE -ne 0) {
            # if the build fails, halt the script
            Write-Host "   Error building $lib. Halting the script."
            exit
        }    

        if ($lib -ne 'GeneratedEntities' -and $publishToNPM -eq 'y') {
            npm publish --access public
        }        

        # Update build log 
        Update-BuildLog "."
    } 
    else {
        Write-Host "   No changes in $lib since last build, skipping this library"
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
    @{Name='query-grid'; PackageName='ng-query-grid'; Dependencies=@('global', 'core', 'core-entities', 'ng-container-directives')},
    @{Name='user-view-grid'; PackageName='ng-user-view-grid'; Dependencies=@('global', 'core', 'core-entities', 'ng-compare-records', 'ng-container-directives')},
    @{Name='explorer-core'; PackageName='ng-explorer-core'; Dependencies=@('global', 'core', 'ng-user-view-grid', 'ng-query-grid', 'ng-record-changes', 'ng-compare-records', 'ng-container-directives')}
    @{Name='core-entity-forms'; PackageName='ng-core-entity-forms'; Dependencies=@('core', 'core-entities', 'ng-explorer-core')}
)

Write-Host ""
Write-Host ""
Write-Host "Checking Angular Libraries"
Write-Host ""

# Iterate over the custom objects
foreach ($libObject in $angularLibraries) {
    $lib = $libObject.Name
    Write-Host ""
    Write-Host "Processing Angular Library: $lib"
    Write-Host "   Checking for changes"
    Set-Location ('Angular Components\' + $lib)

    # ALWAYS update the dependencies to the latest versions for each package before we test for changes.
    # Use the UpdatePackageJSONToLatestDependencyVersion function for each dependency
    foreach ($dep in $libObject.Dependencies) {
        UpdatePackageJSONToLatestDependencyVersion $dep $true
    }

    if (($ignoreBuildLog -eq "y") -or (Get-ChangesSinceLastBuild ".")) {
        Write-Host "      Changes detected in Angular Library: $lib, proceeding with build and publish"

        # Logic for updating package JSON and building
        Write-Host "   Building and publishing Angular Library: $lib"

        Update-PatchVersion

        # Build the project
        npm run build

        if ($LASTEXITCODE -ne 0) {
            # if the build fails, halt the script
            Write-Host "   Error building $lib. Halting the script."
            exit
        }    

        if ($publishToNPM -eq 'y') {
            npm publish --access public
        }
        
        Update-BuildLog "."
    } 
    else {
        Write-Host "   No changes in $lib since last build, skipping this Angular library"
    }

    Set-Location ..\..
}


Write-Host ""
Write-Host ""
Write-Host "Updating Executable Projects..."
Write-Host ""


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
    Write-Host "Processing $proj"
    Write-Host "   Updating dependencies"
    Set-Location $proj

    # Use the InstallLatestVersion function for each dependency
    foreach ($dep in $projObject.Dependencies) {
        UpdatePackageJSONToLatestDependencyVersion $dep $false
    }

    # Handle Angular Libraries dependencies if AngularDeps exists
    if ($projObject.AngularDeps) {
        foreach ($lib in $projObject.AngularDeps) {
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

Write-Host ""
Write-Host "ALL DONE!"

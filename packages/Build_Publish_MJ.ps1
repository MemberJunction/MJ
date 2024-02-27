function Get-PackageNameFromPackageJson {
    param (
        [string]$directoryPath
    )
    $packageName = $null
    $packageJsonPath = Join-Path -Path $directoryPath -ChildPath "package.json"

    if (Test-Path $packageJsonPath) {
        try {
            $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
            $packageName = $packageJson.name
            if (-not $packageName) {
                Write-Host "Package name not found in $packageJsonPath"
            }
            else {
                # Remove '@memberjunction/' prefix from the package name
                $packageName = $packageName -replace '^@memberjunction/', ''
            }
        } catch {
            Write-Host "Error reading or parsing $packageJsonPath $_"
        }
    } else {
        Write-Host "$packageJsonPath does not exist."
    }

    return $packageName
}

function Get-MemberJunctionDependencies {
    param (
        [string]$directoryPath
    )
    $packageJsonPath = Join-Path $directoryPath "package.json"
    $dependenciesArray = @()

    if (Test-Path $packageJsonPath) {
        $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
        $dependencies = @($packageJson.dependencies.PSObject.Properties.Name)
        $devDependencies = @($packageJson.devDependencies.PSObject.Properties.Name)
        $peerDependencies = @($packageJson.peerDependencies.PSObject.Properties.Name)

        $allDependencies = $dependencies + $devDependencies + $peerDependencies
        $filteredDependencies = $allDependencies | Where-Object {$_ -like "@memberjunction/*"}

        foreach ($dep in $filteredDependencies) {
            $dependenciesArray += $dep -replace "@memberjunction/", ""
        }
    }
    return $dependenciesArray
}


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

    return $true # Assume true if no log found since we have never built this project.
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



function MapPackageNameToDirectoryName($rootDirectory, $packageName) {
    $directoryName = $null

    # First, search in $baseLibraries
    $match = $baseLibraries | Where-Object {$_.PackageName -eq $packageName}
    if ($match) {
        # simple scenario, we have a base library, so just join the path of the root + the library name (which can be a path like /AI/gemini etc)
        $directoryName = Join-Path -Path $rootDirectory -ChildPath $match.Name
        # if ($isCurrentAngular) {
        #     #Angular Component, so make sure we are using that along with root
        #     $directoryName = Join-Path -Path $rootDirectory -ChildPath "Angular Components" #$directoryName -ChildPath ".."
        #     #Now append the match name
        #     $directoryName = Join-Path -Path $directoryName -ChildPath $match.Name
        # }
        # else {
        #     #$directoryName = $match.Name
        #     $directoryName = Join-Path -Path $rootDirectory -ChildPath $match.Name
        # }
    }

    # If not found, search in $angularLibraries
    if (!$directoryName) {
        $match = $angularLibraries | Where-Object {$_.PackageName -eq $packageName}
        if ($match) {
            # The MATCH is an angular library, so we add the Angular Components directory to the ROOT path
            $directoryName = Join-Path -Path $rootDirectory -ChildPath "Angular Components"
            # now add in the match 
            $directoryName = Join-Path -Path $directoryName -ChildPath $match.Name
        }
    }

    return $directoryName
}

function UpdatePackageJSONToLatestDependencyVersion($rootDirectory, $packageName) {
    # Use the below function to get the correct directory name
    $directoryName = MapPackageNameToDirectoryName $rootDirectory $packageName

    if (!$directoryName) {
        Write-Host "   Couldn't map package name to directory name for $packageName, halting the script."
        exit
    }

    $dependencyPath = Join-Path -Path $directoryName -ChildPath "package.json"

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


############################################################################################################
############################################################################################################
# Define a custom object for each library including the directory name and the dependencies list (in order)
$baseLibraries = @(
    @{Name='MJGlobal'},
    @{Name='MJAI'}, 
    @{Name='AI/gemini'}, 
    @{Name='MJCore'},
    @{Name='MJCoreEntities'},
    @{Name='MJAIEngine'}, 
    @{Name='MJQueue'}, 
    @{Name='MJDataContext'},
    @{Name='MJDataContextServer'},
    @{Name='SkipTypes'},
    @{Name='SQLServerDataProvider'}, 
    @{Name='CodeGenLib'}, 
    @{Name='GraphQLDataProvider'}, 
    @{Name='GeneratedEntities'}, 
    @{Name='MJServer'} 
)
foreach ($lib in $baseLibraries) {
    if ($lib.Name -eq 'GeneratedEntities') {
        $lib.PackageName = $null
    } else {
        # Use the Get-PackageNameFromPackageJson function to fetch the package name
        $packageName = Get-PackageNameFromPackageJson -directoryPath $lib.Name

        # Check if a package name was returned and update the library object
        if ($packageName) {
            $lib.PackageName = $packageName
        } else {
            Write-Host "Could not retrieve package name for library: $($lib.Name)"
        }
    }
}

# Define a custom object for each Angular library
$angularLibraries = @(
    @{Name='shared'}, 
    @{Name='auth-services'}, 
    @{Name='container-directives'},
    @{Name='link-directives'}, 
    @{Name='compare-records'}, 
    @{Name='record-changes'}, 
    @{Name='data-context'}, 
    @{Name='query-grid'}, 
    @{Name='ask-skip'}, 
    @{Name='user-view-grid'}, 
    @{Name='explorer-core'}, 
    @{Name='core-entity-forms'}
)


# now populate the package name for each angular library
foreach ($lib in $angularLibraries) {
    # Use the Get-PackageNameFromPackageJson function to fetch the package name
    $packageName = Get-PackageNameFromPackageJson -directoryPath ('Angular Components/' + $lib.Name)

    # Check if a package name was returned and update the library object
    if ($packageName) {
        $lib.PackageName = $packageName
    } else {
        Write-Host "Could not retrieve package name for library: $($lib.Name)"
    }
}


# Define a custom object for each executable project
$executableProjects = @(
    @{Name='CodeGen'},
    @{Name='MJAPI'},
    @{Name='MJExplorer'}
)
############################################################################################################




############################################################################################################
# GET USER INPUT ON OPTIONS
$publishToNPM = Read-Host "Do you want to publish to npm? (y/n)"
$ignoreBuildLog = Read-Host "Do you want to ignore the build log (and build/publish EVERYTHING, regardless of if things changed)? (y/n)"
############################################################################################################

# Store the Root Directory so we can come back to it later
$rootDirectory = Get-Location

# Iterate over the Base Libraries
foreach ($libObject in $baseLibraries) {
    $lib = $libObject.Name
    Write-Host "Processing $lib"
    Write-Host "   Checking for changes"
    Set-Location $lib

    # Dynamically fetch MJ dependencies for the current package
    $MJDependencies = Get-MemberJunctionDependencies -directoryPath "."
    foreach ($mjDep in $MJDependencies) {
        # always update the dependencies to the latest versions for each package before we test for changes.
        # Use the UpdatePackageJSONToLatestDependencyVersion function for each dependency
        UpdatePackageJSONToLatestDependencyVersion -rootDirectory $rootDirectory -packageName $mjDep 
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

    # return to the root directory after each iteration
    Set-Location $rootDirectory
}

# Step 2: Building and Publishing Angular libraries


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

    # Dynamically fetch MJ dependencies for the current package
    $MJdependencies = Get-MemberJunctionDependencies -directoryPath "."
    foreach ($mjDep in $MJdependencies) {
        # always update the dependencies to the latest versions for each package before we test for changes.
        # Use the UpdatePackageJSONToLatestDependencyVersion function for each dependency
        UpdatePackageJSONToLatestDependencyVersion -rootDirectory $rootDirectory -packageName $mjDep  
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
# Iterate over the custom objects
foreach ($projObject in $executableProjects) {
    $proj = $projObject.Name
    Write-Host "Processing $proj"
    Write-Host "   Updating dependencies"
    Set-Location $proj

    $MJDependencies = Get-MemberJunctionDependencies -directoryPath "."
    foreach ($mjDep in $MJDependencies) {
        # always update the dependencies to the latest versions for each package  
        # Use the UpdatePackageJSONToLatestDependencyVersion function for each dependency
        UpdatePackageJSONToLatestDependencyVersion -rootDirectory $rootDirectory -packageName $mjDep  
    }

    Set-Location ..
}

Write-Host ""
Write-Host "ALL DONE!"

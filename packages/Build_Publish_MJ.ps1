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
            # write to the console the file name that has changed and the time it was last modified
            Write-Host "         >>> $($file.FullName) has changed since the last build. Last modified: $($file.LastWriteTime)"
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
        # Attempt to force the result into an array explicitly
        $logContent = Get-Content $buildLogPath | ConvertFrom-Json
        $logObject = @($logContent)
    }

    $logObject += @{ "buildTime" = $currentDateTime }

    # Convert the array to JSON, ensuring it remains an array
    $jsonOutput = $logObject | ConvertTo-Json -Depth 64 
    # -Compress

    # Ensure the output is wrapped as an array if not already
    $jsonOutput = $jsonOutput.Trim()
    if (-not $jsonOutput.StartsWith("[") -or -not $jsonOutput.EndsWith("]")) {
        $jsonOutput = "[$jsonOutput]"
    }

    Set-Content -Path $buildLogPath -Value $jsonOutput
}



function Update-Version {
    param (
        [hashtable]$newVersion = @{
            major = $null
            minor = $null
            patch = $null
        },
        [int]$maxRetries = 10, # Maximum number of retries
        [int]$retryDelay = 4  # Delay in seconds between retries
    )

    $attempt = 0
    $success = $false

    while ($attempt -lt $maxRetries -and -not $success) {
        try {
            $json = Get-Content 'package.json' -Raw | ConvertFrom-Json
            if ($null -ne $newVersion.major -and $null -ne $newVersion.minor -and $null -ne $newVersion.patch) {
                $json.version = "$($newVersion.major).$($newVersion.minor).$($newVersion.patch)"
            } else {
                $version = $json.version -split '\.'
                $patch = [int]$version[2] + 1
                $newVer = "$($version[0]).$($version[1]).$patch"
                $json.version = $newVer    
            }
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

    # First, search in $libraries
    $match = $libraries | Where-Object {$_.PackageName -eq $packageName}
    if ($match) {
        # simple scenario, we have a base library, so just join the path of the root + the library name (which can be a path like /AI/gemini etc)
        $directoryName = Join-Path -Path $rootDirectory -ChildPath $match.Name
    }

    # If not found, search in $angularLibraries
    if (!$directoryName) {
        $match = $angularLibraries | Where-Object {$_.PackageName -eq $packageName}
        if ($match) {
            # The MATCH is an angular library, so we add the Angular directory to the ROOT path
            $directoryName = Join-Path -Path $rootDirectory -ChildPath "Angular"
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

function GetLargestVersionNumbers() {
    # this function will look at ALL of the packages in our build.order.json file and will return an object that has major, minor and patch properties
    # the major, minor and patch properties will be the LARGEST major, minor and patch numbers found in the packages in the build.order.json file
    # we will then add 1 to the patch number and return the object
    $largestVersion = @{
        major = 0
        minor = 0
        patch = 0
    }
    # next iterate through all of the pacakges in the build.order.json file and get the LARGEST major, minor and patch numbers
    foreach ($lib in $libraries) {
        $packageName = $lib.PackageName
        $directoryName = MapPackageNameToDirectoryName $rootDirectory $packageName
        $dependencyPath = Join-Path -Path $directoryName -ChildPath "package.json"

        if (Test-Path $dependencyPath) {
            $depJson = Get-Content $dependencyPath | ConvertFrom-Json
            $version = $depJson.version -split '\.'

            if ([int]$version[0] -gt $largestVersion.major) {
                $largestVersion.major = [int]$version[0]
            }
            if ([int]$version[1] -gt $largestVersion.minor) {
                $largestVersion.minor = [int]$version[1]
            }
            if ([int]$version[2] -gt $largestVersion.patch) {
                $largestVersion.patch = [int]$version[2]
            }
        }
        else {
            # this should never happen so if we get here throw a message to the console and stop the script
            Write-Host "   Couldn't find package.json for $directoryName, halting the script."
            exit
        }
    }
    # now return the object with the largest version numbers
    return $largestVersion
}

function InstallLatestVersion($packageName) {
    npm install @memberjunction/$packageName@latest --save
}
function LinkAllDependencies($dependenciesArray) {
    $linkString = $dependenciesArray | ForEach-Object { "@memberjunction/$_" }
    npm link $linkString
}


############################################################################################################
### WE LOAD THE LIBRARY LIST FROM THE JSON FILE
### THE REASON WE DO THIS INSTEAD OF JUST SCANNING OUR SUB-DIRECTORIES IS BECAUSE 
### WE WANT TO BE ABLE TO SPECIFY THE ORDER OF THE LIBRARIES
$jsonPath = './build.order.json'

# Store the Root Directory so we can come back to it later
$rootDirectory = Get-Location


# Read the JSON file content
$jsonContent = Get-Content -Path $jsonPath -Raw

# Convert the JSON content into a PowerShell object
$jsonObject = $jsonContent | ConvertFrom-Json

# Get the libraries and executables from the $jsonObject
$libraries = $jsonObject.libraries
$executableProjects = $jsonObject.executables
############################################################################################################

# Now, we need to update the package names for each library so that we don't need that maintained in the build.order.json file
foreach ($lib in $libraries) {
    if ($lib.SkipNPMPublish -eq $true) {
        $lib | Add-Member -MemberType NoteProperty -Name "PackageName" -Value $null -Force  
    } else {
        # Use the Get-PackageNameFromPackageJson function to fetch the package name
        $packageName = Get-PackageNameFromPackageJson -directoryPath $lib.Name

        # Check if a package name was returned and update the library object
        if ($packageName) {
             # Use Add-Member to add or update the PackageName property
             $lib | Add-Member -MemberType NoteProperty -Name "PackageName" -Value $packageName -Force
        } else {
            Write-Host "Could not retrieve package name for library: $($lib.Name)"
        }
    }
}

############################################################################################################
# GET USER INPUT ON OPTIONS
$publishToNPM = Read-Host "Do you want to publish to npm? (y/n)"
$ignoreBuildLog = Read-Host "Do you want to ignore the build log (and build/publish EVERYTHING, regardless of if things changed)? (y/n)"
$alignVersions = "n"
$newVersion = @{
    major = $null
    minor = $null
    patch = $null
}
if ($ignoreBuildLog -eq "y") {
    $alignVersions = Read-Host "Do you want to align version numbers to ensure the same major/minor/patch version on all packages? (y/n)"
    if ($alignVersions -eq "y") {
        # now get the major, minor and patch version number to use, do this by doing a look into ALL packages we have in our build.order.json file
        # and get the LARGEST major, LARGEST minor, and LARGEST patch number and then add 1 to the patch number
        $largestVersion = GetLargestVersionNumbers
        $largestVersionBumped = $largestVersion
        $largestVersionBumped.patch++
        # now share the largest version bumped with the user and ask if they want to use this version number or specify a custom version number
        $customVersion = Read-Host "Do you want to specify a custom version number? If NO, we will use $($largestVersionBumped.major).$($largestVersionBumped.minor).$($largestVersionBumped.patch)      (y/n)"
#        $customVersion = Read-Host "Do you want to specify a custom version number? If NO, we will use . (y/n)"
        if ($customVersion -eq "y") {
            $customVersionInput = Read-Host "Enter the complete version number (e.g. 1.2.3)"
            $customVersionArray = $customVersionInput -split '\.'

            # make sure we validate the custom version array that it has exactly 3 elements and that each element is a 0 or greater integer
            if ($customVersionArray.Length -ne 3) {
                Write-Host "Invalid version number entered, must be in format of 1.2.3  ----- Halting the script."
                exit
            }

            $newVersion = @{
                major = [int]$customVersionArray[0]
                minor = [int]$customVersionArray[1]
                patch = [int]$customVersionArray[2]
            }
            # now make sure that the custom version number is valid, we have to have a major, minor and patch number and they have to be non-null and non-negative
            if ($null -eq $newVersion.major -or $null -eq $newVersion.minor -or $null -eq $newVersion.patch -or $newVersion.major -lt 0 -or $newVersion.minor -lt 0 -or $newVersion.patch -lt 0) {
                Write-Host "Invalid version number entered. Halting the script."
                exit
            }
            elseif ($newVersion.major -lt $largestVersion.major -or ($newVersion.major -eq $largestVersion.major -and $newVersion.minor -lt $largestVersion.minor) -or ($newVersion.major -eq $largestVersion.major -and $newVersion.minor -eq $largestVersion.minor -and $newVersion.patch -lt $largestVersion.patch)) {
                Write-Host "The custom version number is less than the largest version number found across ALL of the packages listed in the build.order.json file. Halting the script."
                exit
            }
        } else {
            $newVersion = $largestVersionBumped
        }
    }
}
############################################################################################################

# Iterate over the library array
foreach ($libObject in $libraries) {
    if ($libObject.SkipAll -eq $true) {
        Write-Host "Skipping $libObject.Name, as it's been marked to be skipped in the JSON file."
        continue
    }

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

        if (!$libObject.SkipNPMPublish) {
            if ($alignVersions -eq "y") {
                # Update the version number in the package.json file for the current library with the 
                # STANDARDIZED version number (major, minor, patch)
                Update-Version $newVersion 
            }
            else {
                # we are NOT aligning version numbers, rather we are just updating the patch version number
                Update-Version
            }
        }

        # build the project
        npm run build 

        if ($LASTEXITCODE -ne 0) {
            # if the build fails, halt the script
            Write-Host "   Error building $lib. Halting the script."
            exit
        }    

        if (!$libObject.SkipNPMPublish -and $publishToNPM -eq 'y') {
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

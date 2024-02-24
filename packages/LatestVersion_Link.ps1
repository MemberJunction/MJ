# THIS SCRIPT WILL UPDATE THE LOCAL PROJECT HIERARCHY TO ENSURE THAT CodeGen, MJAPI AND MJExplorer ARE USING THE LATEST VERSION OF EACH DEPENDENCY


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

# # Prompt the user for local linking
# $useLocalLinking = Read-Host "Do you want to use local linking? (y/n)"

# Define a custom object for each executable project
$remainingProjects = @(
    @{Name='CodeGen'},
    @{Name='MJAPI'},
    @{Name='GeneratedEntities'},
    @{Name='MJExplorer'}
)

# Iterate over the custom objects
foreach ($projObject in $remainingProjects) {
    $proj = $projObject.Name
    Write-Host "Updating dependencies for $proj"
    Set-Location $proj

    $MJDependencies = Get-MemberJunctionDependencies -directoryPath "."
    foreach ($mjDep in $MJDependencies) {
        # always update the dependencies to the latest versions for each package  
        # Use the UpdatePackageJSONToLatestDependencyVersion function for each dependency
        UpdatePackageJSONToLatestDependencyVersion $mjDep $false
    }

    npm i # install all dependencies first
    
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
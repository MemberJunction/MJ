# THIS SCRIPT WILL UPDATE THE LOCAL PROJECTS TO ENSURE THAT ALL MEMBERJUNCTION DEPENDENCIES ARE USING THE LATEST VERSION
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
function Get-SubDirectoriesWithPackageJson {
    # Get all sub-directories in the current directory, excluding hidden ones
    $subDirectories = Get-ChildItem -Directory | Where-Object { 
        # Exclude directories that are hidden or start with a dot
        -not $_.Attributes.ToString().Contains("Hidden") -and $_.Name -notlike ".*"
    } | Where-Object {
        # Check if the sub-directory contains a package.json file
        Test-Path (Join-Path $_.FullName "package.json")
    } | ForEach-Object {
        # Create a hashtable for each sub-directory with its name
        @{Name = $_.Name}
    }
    
    # Return the array of hashtables
    return $subDirectories
}

function InstallLatestVersions($dependencies) {
    $npmCommand = "npm install " + ($dependencies -join " ") + " --save"
    Invoke-Expression $npmCommand
}

# ask the user if they want us to build GeneratedEntities or not
$buildGeneratedEntities = Read-Host "After the packages are updated, do you want to build GeneratedEntities? (y/n)"

Write-Host "Starting to update MemberJunction dependencies..."
$projects = Get-SubDirectoriesWithPackageJson

# tell the user how many projects we're going to check for 
Write-Host "Found $($projects.Count) projects to check for MemberJunction dependencies"

foreach ($projObject in $projects) {
    $proj = $projObject.Name

    Set-Location $proj
    $MJDependencies = Get-MemberJunctionDependencies -directoryPath "."
    if ($MJDependencies.Count -eq 0) {
        # NO MJ Dependencies found, skip this project
        Write-Host "   >>>   No MemberJunction dependencies found in $proj, skipping..."
    }
    else {
        # tell the user how many MJ dependencies we're going to update
        Write-Host "   >>>   Found $($MJDependencies.Count) MemberJunction dependencies in $proj"

        # Prepare the dependencies for the npm install command
        $dependencyInstallString = $MJDependencies | ForEach-Object { "@memberjunction/$_@latest" }

        # Update the dependencies to the latest versions with a single npm command
        InstallLatestVersions $dependencyInstallString
    }
    Set-Location ..    
}

if ($buildGeneratedEntities -eq 'y') {
    Write-Host "Building GeneratedEntities"
    Set-Location GeneratedEntities
    npm run build
    Set-Location ..
}
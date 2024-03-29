# Directory to start from
$rootDir = Get-Location

# Destination file
$destFile = Join-Path $rootDir "member_junction_code_for_documentation.txt"

# Patterns to ignore
$dirIgnorePatterns = @('node_modules', 'dist', 'environments', '.vscode', 'SQL Scripts', 'Schema Files', '.angular')
$fileIgnorePatterns = @('.npm', '.env', '.git', '.zip', '.z', '.7z', 'mj server info.txt', '.ps1', 'package-lock.json')

# Function to check if path matches any ignore patterns
function Test-IgnoredPattern($path, $patterns) {
    foreach ($pattern in $patterns) {
        if ($path -like "*$pattern*") {
            return $true
        }
    }
    return $false
}

# Create or clear the destination file
if (Test-Path $destFile) { Clear-Content $destFile }

# Recursive function to process directories and files
function Process-Directory($path) {
    Get-ChildItem $path -Recurse | ForEach-Object {
        if (-not $_.PSIsContainer) {
            $relativePath = $_.FullName.Substring($rootDir.FullName.Length + 1)
            $dirName = Split-Path $relativePath -Parent
            $fileName = $_.Name

            if (-not (Test-IgnoredPattern $relativePath $dirIgnorePatterns) -and -not (Test-IgnoredPattern $fileName $fileIgnorePatterns)) {
                Add-Content -Path $destFile -Value ("`n" * 10)
                Add-Content -Path $destFile -Value "*******************************************************************************"
                Add-Content -Path $destFile -Value "-------------------------------------------------------------------------------"
                Add-Content -Path $destFile -Value "-------------------------NEW FILE----------------------------------------------"
                Add-Content -Path $destFile -Value "-------------------------------------------------------------------------------"
                Add-Content -Path $destFile -Value "*******************************************************************************"
                Add-Content -Path $destFile -Value "FILENAME: $fileName"
                Add-Content -Path $destFile -Value "DIRECTORY NAME: $dirName"
                Add-Content -Path $destFile -Value "-------------------------------------------------------------------------------"
                Get-Content $_.FullName | Add-Content $destFile
            }
        }
    }
}

# Start processing from the root directory
Process-Directory $rootDir

Write-Host "Documentation file created at $destFile"

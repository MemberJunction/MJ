# Add necessary assembly for zip functionality
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Set the root directory to the current working directory
$rootDir = Get-Location
# Create a zip file name based on the current date
$zipFileName = "member_junction_code_for_documentation_" + (Get-Date -Format "yyyy_MM_dd") + ".zip"
$zipDest = Join-Path $rootDir $zipFileName

# Updated arrays of patterns to ignore
$dirIgnorePatterns = @('node_modules', 'dist', 'environments', '.vscode', 'SQL Scripts', 'Schema Files', '.angular')
$fileIgnorePatterns = @('.npm', '.env', '.git', '.zip', '.z', '.7z', 'mj server info.txt', '.ps1', 'package-lock.json')

# Function to check if the path matches any ignore patterns
function ShouldIgnore($path, $patterns) {
    foreach ($pattern in $patterns) {
        if ($path -like "*$pattern*") {
            return $true
        }
    }
    return $false
}

# Function to add files to the zip archive
function Add-ToZip($file, $zipArchive) {
    # Calculate the relative path from the script's current directory
    $relativePath = $file.FullName.Replace($rootDir, "").TrimStart("\")
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive, $file.FullName, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal)
}

# Create a new zip archive
$zipArchive = [System.IO.Compression.ZipFile]::Open($zipDest, [System.IO.Compression.ZipArchiveMode]::Create)

try {
    # Gathering the files and directories to include in the zip file
    Get-ChildItem -Path $rootDir -Recurse | Where-Object {
        -not $_.PSIsContainer -and
        -not (ShouldIgnore $_.FullName $dirIgnorePatterns) -and
        -not (ShouldIgnore $_.Name $fileIgnorePatterns)
    } | ForEach-Object {
        Add-ToZip $_ $zipArchive
    }
} finally {
    # Always close the zip archive whether or not the operation succeeded
    $zipArchive.Dispose()
}

Write-Host "Archive created at $zipDest"

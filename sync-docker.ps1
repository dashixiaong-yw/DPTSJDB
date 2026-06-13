# Docker Deploy Sync Script
# Synchronizes required files from project root to docker/ directory

# Project root
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Target directory
$dockerDir = Join-Path $projectRoot "docker"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " DPTSJDB Docker Sync Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project root: $projectRoot" -ForegroundColor Gray
Write-Host "Target: $dockerDir" -ForegroundColor Gray
Write-Host ""

# Clean target directory
if (Test-Path $dockerDir) {
    Write-Host "[1/3] Clearing docker/ directory..." -ForegroundColor Yellow
    Remove-Item -Path "$dockerDir\*" -Recurse -Force
} else {
    Write-Host "[1/3] Creating docker/ directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $dockerDir -Force | Out-Null
}

# Directories to copy
$dirsToCopy = @(
    "src",
    "public"
)

# Files to copy
$filesToCopy = @(
    "package.json",
    "pnpm-lock.yaml",
    "next.config.ts",
    "tsconfig.json",
    "next-env.d.ts",
    "postcss.config.mjs",
    ".npmrc",
    "Dockerfile",
    "docker-compose.yml",
    ".dockerignore",
    ".env.example",
    "VERSION",
    "CHANGELOG.md"
)

# Copy directories
Write-Host "[2/3] Copying directories..." -ForegroundColor Yellow
$dirCount = 0
foreach ($dir in $dirsToCopy) {
    $sourcePath = Join-Path $projectRoot $dir
    if (Test-Path $sourcePath) {
        $destPath = Join-Path $dockerDir $dir
        Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force
        Write-Host "  + $dir/" -ForegroundColor Green
        $dirCount++
    } else {
        Write-Host "  - $dir/ (skip, not found)" -ForegroundColor DarkGray
    }
}

# Copy files
Write-Host "[3/3] Copying files..." -ForegroundColor Yellow
$fileCount = 0
foreach ($file in $filesToCopy) {
    $sourcePath = Join-Path $projectRoot $file
    if (Test-Path $sourcePath) {
        $destPath = Join-Path $dockerDir $file
        Copy-Item -Path $sourcePath -Destination $destPath -Force
        Write-Host "  + $file" -ForegroundColor Green
        $fileCount++
    } else {
        Write-Host "  - $file (skip, not found)" -ForegroundColor DarkGray
    }
}

# Generate docker-compose.yaml (for NAS GUI compatibility like Lingguang NAS)
Write-Host "[4/4] Generating docker-compose.yaml..." -ForegroundColor Yellow
$yamlSource = Join-Path $dockerDir "docker-compose.yml"
$yamlTarget = Join-Path $dockerDir "docker-compose.yaml"

if (Test-Path $yamlSource) {
    $shouldCopy = $true
    if ((Test-Path $yamlTarget) -and -not $Force) {
        $sourceHash = (Get-FileHash -LiteralPath $yamlSource -Algorithm MD5).Hash
        $destHash = (Get-FileHash -LiteralPath $yamlTarget -Algorithm MD5).Hash
        if ($sourceHash -eq $destHash) {
            $shouldCopy = $false
        }
    }
    if ($shouldCopy) {
        Copy-Item -LiteralPath $yamlSource -Destination $yamlTarget -Force
        Write-Host "  + docker-compose.yaml" -ForegroundColor Green
    } else {
        Write-Host "  = docker-compose.yaml (no changes)" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Sync Complete" -ForegroundColor Green
Write-Host " Directories: $dirCount | Files: $fileCount | yaml: 1" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Deployment files in docker/:" -ForegroundColor Yellow
Write-Host "  docker-compose.yml  - CLI (docker-compose)" -ForegroundColor White
Write-Host "  docker-compose.yaml - NAS GUI (Lingguang/GreenLink)" -ForegroundColor White
Write-Host ""
Write-Host "Next steps for deployment:" -ForegroundColor Yellow
Write-Host "  cd docker" -ForegroundColor White
Write-Host "  docker-compose up -d --build" -ForegroundColor White
Write-Host ""

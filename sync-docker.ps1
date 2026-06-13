# Docker Deploy Sync Script
# Incremental sync - only updates changed files, deletes removed files

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dockerDir = Join-Path $projectRoot "docker"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " DPTSJDB Docker Sync Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project root: $projectRoot" -ForegroundColor Gray
Write-Host "Target: $dockerDir" -ForegroundColor Gray
Write-Host ""

# Ensure target directory exists
if (-not (Test-Path $dockerDir)) {
    Write-Host "[init] Creating docker/ directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $dockerDir -Force | Out-Null
}

# Directories to sync (robocopy /MIR = mirror: add/update/delete)
$dirsToSync = @(
    "src",
    "public"
)

# Files to sync
$filesToSync = @(
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

# [1/3] Sync directories via robocopy /MIR
Write-Host "[1/3] Syncing directories (robocopy MIR)..." -ForegroundColor Yellow
$dirCount = 0
foreach ($dir in $dirsToSync) {
    $sourcePath = Join-Path $projectRoot $dir
    $destPath = Join-Path $dockerDir $dir
    if (Test-Path $sourcePath) {
        if (-not (Test-Path $destPath)) {
            New-Item -ItemType Directory -Path $destPath -Force | Out-Null
        }
        robocopy $sourcePath $destPath /MIR /NP /NDL /NJH /NJS /R:1 /W:1
        Write-Host "  + $dir/" -ForegroundColor Green
        $dirCount++
    } else {
        if (Test-Path $destPath) {
            Remove-Item -Path $destPath -Recurse -Force
            Write-Host "  - $dir/ (removed, source deleted)" -ForegroundColor Yellow
        }
    }
}

# [2/3] Sync individual files (incremental + delete orphaned)
Write-Host "[2/3] Syncing files..." -ForegroundColor Yellow
$fileAdded = 0
$fileUpdated = 0
$fileRemoved = 0
$fileSkipped = 0

foreach ($file in $filesToSync) {
    $sourcePath = Join-Path $projectRoot $file
    $destPath = Join-Path $dockerDir $file

    if (Test-Path $sourcePath) {
        if (Test-Path $destPath) {
            $srcHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm MD5).Hash
            $dstHash = (Get-FileHash -LiteralPath $destPath -Algorithm MD5).Hash
            if ($srcHash -ne $dstHash) {
                Copy-Item -LiteralPath $sourcePath -Destination $destPath -Force
                Write-Host "  ~ $file (updated)" -ForegroundColor Yellow
                $fileUpdated++
            } else {
                $fileSkipped++
            }
        } else {
            Copy-Item -LiteralPath $sourcePath -Destination $destPath
            Write-Host "  + $file" -ForegroundColor Green
            $fileAdded++
        }
    } else {
        if (Test-Path $destPath) {
            Remove-Item -LiteralPath $destPath -Force
            Write-Host "  - $file (removed)" -ForegroundColor Yellow
            $fileRemoved++
        }
    }
}

# [3/4] Generate .env from .env.example if not exists
Write-Host "[3/4] Checking .env file..." -ForegroundColor Yellow
$envExample = Join-Path $dockerDir ".env.example"
$envFile = Join-Path $dockerDir ".env"

if (Test-Path $envExample) {
    if (-not (Test-Path $envFile)) {
        Copy-Item -LiteralPath $envExample -Destination $envFile
        Write-Host "  + .env (created from .env.example, please edit with actual values)" -ForegroundColor Green
    } else {
        Write-Host "  = .env (exists, not overwritten)" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  ! .env.example not found, skip .env generation" -ForegroundColor Red
}

# [4/4] Generate docker-compose.yaml (NAS GUI compatibility)
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
Write-Host " Directories: $dirCount | Files: +$fileAdded ~$fileUpdated -$fileRemoved =$fileSkipped" -ForegroundColor Green
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

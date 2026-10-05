[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$composePath = Join-Path $projectRoot 'compose.yaml'
$dataPath = Join-Path $projectRoot '.local\n8n'
$backupRoot = Join-Path $projectRoot '.local\backups'
$backupName = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
$backupPath = Join-Path $backupRoot $backupName

function Invoke-LeadOpsCompose {
    param([string[]]$ComposeArgs)
    $result = & docker compose --project-directory $projectRoot --file $composePath @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed ($LASTEXITCODE)." }
    return $result
}

if (!(Test-Path -LiteralPath (Join-Path $dataPath 'database.sqlite')) -or
    !(Test-Path -LiteralPath (Join-Path $dataPath 'config'))) {
    throw 'No complete local n8n instance found. Start it before taking a backup.'
}

$stateText = Invoke-LeadOpsCompose -ComposeArgs @('ps', '-a', '--format', 'json', 'n8n')
$state = if ($stateText) { ($stateText -join "`n") | ConvertFrom-Json } else { $null }
$wasRunning = $null -ne $state -and $state.State -eq 'running'
$stopped = $false

try {
    # Stop SQLite writes before copying. No other Compose project is affected.
    if ($wasRunning) {
        Invoke-LeadOpsCompose -ComposeArgs @('stop', 'n8n') | Out-Host
        $stopped = $true
    }
    New-Item -ItemType Directory -Path $backupPath | Out-Null
    Copy-Item -LiteralPath $dataPath -Destination $backupPath -Recurse -Force
    Copy-Item -LiteralPath $composePath -Destination (Join-Path $backupPath 'compose.yaml')

    $manifest = [ordered]@{
        createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        project = 'aramis-leadops'
        backupType = 'stopped-sqlite-full-user-folder'
        private = $true
        files = @(
            Get-ChildItem -LiteralPath $backupPath -File -Recurse -Force | ForEach-Object {
                [ordered]@{
                    path = $_.FullName.Substring($backupPath.Length + 1)
                    bytes = $_.Length
                    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
                }
            }
        )
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupPath 'manifest.json') -Encoding UTF8
    Write-Host "Private full backup: $backupPath"
    Write-Host 'Contains the database AND encryption key. Keep it out of Git; copy it to secure storage on another disk or machine.'
}
finally {
    if ($stopped) {
        Invoke-LeadOpsCompose -ComposeArgs @('up', '-d', '--wait', '--wait-timeout', '180', 'n8n') | Out-Host
    }
}

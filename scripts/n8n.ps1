[CmdletBinding()]
param(
    [ValidateSet('Start', 'Status', 'Stop', 'Restart')]
    [string]$Action = 'Status'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$composePath = Join-Path $projectRoot 'compose.yaml'
$dataPath = Join-Path $projectRoot '.local\n8n'

function Invoke-LeadOpsCompose {
    param([string[]]$ComposeArgs)
    & docker compose --project-directory $projectRoot --file $composePath @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed ($LASTEXITCODE). Is Docker Desktop running?" }
}

switch ($Action) {
    'Start' {
        New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
        Invoke-LeadOpsCompose -ComposeArgs @('up', '-d', '--wait', '--wait-timeout', '180', 'n8n')
        Write-Host 'n8n ready: http://localhost:5678'
    }
    'Status' { Invoke-LeadOpsCompose -ComposeArgs @('ps', '-a') }
    'Stop' { Invoke-LeadOpsCompose -ComposeArgs @('stop', 'n8n') }
    'Restart' {
        Invoke-LeadOpsCompose -ComposeArgs @('restart', 'n8n')
        Invoke-LeadOpsCompose -ComposeArgs @('ps')
    }
}

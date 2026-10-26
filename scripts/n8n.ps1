[CmdletBinding()]
param(
    [ValidateSet('Start', 'Status', 'Stop', 'Restart')]
    [string]$Action = 'Status'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$composePath = Join-Path $projectRoot 'compose.yaml'
$dataPath = Join-Path $projectRoot '.local\n8n'

function Assert-LeadOpsDockerEngine {
    $dockerCommand = Get-Command docker.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $dockerCommand.Source
    $startInfo.Arguments = 'version --format "{{.Server.Version}}"'
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $probe = [System.Diagnostics.Process]::Start($startInfo)
    try {
        $stdout = $probe.StandardOutput.ReadToEndAsync()
        $stderr = $probe.StandardError.ReadToEndAsync()
        if (!$probe.WaitForExit(10000)) {
            # Stop only this CLI probe, never Docker Desktop or its containers.
            try { if (!$probe.HasExited) { $probe.Kill() } }
            catch [System.InvalidOperationException] { }
            throw 'Docker Engine did not respond within 10 seconds. Check Docker Desktop before retrying; see docs/05-local-n8n.md.'
        }
        if ($probe.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($stdout.GetAwaiter().GetResult())) {
            throw 'Docker Engine is unavailable. Docker Desktop may be closed or showing a startup error; see docs/05-local-n8n.md.'
        }
    }
    finally { $probe.Dispose() }
}

function Invoke-LeadOpsCompose {
    param([string[]]$ComposeArgs)
    & docker compose --project-directory $projectRoot --file $composePath @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed ($LASTEXITCODE). Is Docker Desktop running?" }
}

Assert-LeadOpsDockerEngine

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

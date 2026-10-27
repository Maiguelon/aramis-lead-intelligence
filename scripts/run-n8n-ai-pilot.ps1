[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProjectId,
    [ValidateSet('basic', 'public_company')][string]$Fixture = 'basic',
    [switch]$Live,
    [switch]$ConfirmPaidDemo
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$verificationDirectory = Join-Path $projectRoot '.local\n8n\leadops-verification'
if ($ProjectId -notmatch '^[A-Za-z0-9_-]+$') { throw 'Invalid local project ID.' }
if ($Live -and !$ConfirmPaidDemo) { throw 'Live API calls require -ConfirmPaidDemo and may incur charges.' }

function Prepare-Pilot {
    param([string]$Mode)
    $arguments = @((Join-Path $PSScriptRoot 'prepare-n8n-ai-pilot.mjs'), '--mode', $Mode, '--fixture', $Fixture)
    if ($Mode -eq 'live') { $arguments += '--confirm-paid-demo' }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { throw 'AI workflow validation or credential binding failed.' }
}
function Import-Pilot {
    & docker compose --project-directory $projectRoot exec -T n8n n8n import:workflow --input=/home/node/.n8n/leadops-verification/ai-pilot-ready.json "--projectId=$ProjectId" | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Native AI workflow import failed.' }
}

$mode = if ($Live) { 'live' } else { 'preview' }
if ($Live) {
    Get-ChildItem -LiteralPath $verificationDirectory -Filter 'ai-live-intent-*.json' | ForEach-Object {
        $prior = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
        if ($prior.state -notin @('complete', 'provider_rejected', 'analysis_rejection_reviewed')) {
            throw 'An earlier paid AI attempt needs reconciliation before another run.'
        }
    }
}
Prepare-Pilot -Mode $mode
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$intentPath = Join-Path $verificationDirectory "ai-live-intent-$stamp.json"
$receiptPath = Join-Path $verificationDirectory "ai-$mode-receipt-$stamp.json"
$intent = [ordered]@{ startedAtUtc = [DateTime]::UtcNow.ToString('o'); fixture = $Fixture;
    state = 'started_result_unknown'; plannedResponsesRequests = 2; crmWritesPerformed = $false; emailSent = $false }
try {
    Import-Pilot
    if ($Live) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes(($intent | ConvertTo-Json -Depth 5))
        $stream = [System.IO.File]::Open($intentPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    }
    # Capture raw execution output in memory; print only the sanitized business summary.
    $rawOutput = & docker compose --project-directory $projectRoot exec -T -e N8N_RUNNERS_BROKER_PORT=5681 n8n n8n execute --id=aramis-openai-pilot --rawOutput
    if ($LASTEXITCODE -ne 0) { throw 'Native AI execution failed; inspect the private intent before repeating.' }
    $match = [regex]::Match(($rawOutput -join "`n"), '(?ms)^\{\r?\n.*^\}')
    if (!$match.Success) { throw 'No native AI result; inspect the intent before repeating.' }
    $execution = $match.Value | ConvertFrom-Json
    $runs = $execution.data.resultData.runData
    if (!$runs) { $runs = $execution.resultData.runData }
    $result = $runs.'Resumen de prueba IA'[0].data.main[0][0].json
    if (!$result) { throw 'No sanitized AI business result; inspect the intent.' }
    $httpNodesExecuted = @($runs.PSObject.Properties.Name | Where-Object { $_ -like 'Agente*' }).Count
    if (!$Live -and ($httpNodesExecuted -ne 0 -or $result.status -ne 'preview')) { throw 'Unexpected API work in preview.' }
    $receipt = [ordered]@{ checkedAtUtc = [DateTime]::UtcNow.ToString('o'); result = $result;
        httpNodesExecuted = $httpNodesExecuted; credentialValuesRead = $false }
    $receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
    if ($Live) {
        $intent.state = if ($result.status -eq 'complete') { 'complete' }
            elseif ($result.status -eq 'configuration_needed' -and $result.generationCalls -eq 0) { 'provider_rejected' }
            else { 'review_required_before_repeat' }
        $intent.resultReceipt = [System.IO.Path]::GetFileName($receiptPath)
        $intent | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $intentPath -Encoding UTF8
    }
    $receipt | ConvertTo-Json -Depth 12 -Compress
}
finally {
    Prepare-Pilot -Mode 'preview'
    Import-Pilot
}

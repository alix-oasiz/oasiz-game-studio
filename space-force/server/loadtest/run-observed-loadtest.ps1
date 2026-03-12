param(
  [ValidateSet("lobbyfill", "roomcode")]
  [string]$Runner = "lobbyfill",
  [int]$NumClients = 40,
  [int]$UsersPerRoom = 4,
  [string]$RoomCode = "",
  [int]$Delay = 300,
  [int]$DurationSec = 180,
  [int]$WarmupSec = 15,
  [int]$SummaryIntervalMs = 5000,
  [int]$RequestTimeoutMs = 15000,
  [string]$DropletHost = "",
  [string]$RemoteObserverPath = "/root/space-force-observe.sh",
  [string]$RemoteObserveRoot = "/tmp/space-force-observe",
  [string]$OpsUrl = "http://127.0.0.1:2567/ops/stats",
  [string]$OpsToken = "",
  [int]$ObserveIntervalSec = 2,
  [string]$Interface = "",
  [string]$Pm2App = "space-force-colyseus",
  [bool]$SyncObserverScript = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-ObservedLog {
  param([string]$Message)
  Write-Host ("[ObservedLoadTest] " + $Message)
}

function New-RunId {
  return (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
}

function Resolve-DropletHost {
  param([string]$ProvidedHost)
  if (-not [string]::IsNullOrWhiteSpace($ProvidedHost)) {
    return $ProvidedHost.Trim()
  }
  if (-not [string]::IsNullOrWhiteSpace($env:OBS_DROPLET_HOST)) {
    return $env:OBS_DROPLET_HOST.Trim()
  }
  throw "Droplet host is required. Pass -DropletHost or set OBS_DROPLET_HOST."
}

function Resolve-OpsToken {
  param([string]$ProvidedToken)
  if (-not [string]::IsNullOrWhiteSpace($ProvidedToken)) {
    return $ProvidedToken.Trim()
  }
  if (-not [string]::IsNullOrWhiteSpace($env:OPS_STATS_TOKEN)) {
    return $env:OPS_STATS_TOKEN.Trim()
  }
  return ""
}

function Ensure-Tool {
  param([string]$ToolName)
  $command = Get-Command $ToolName -ErrorAction SilentlyContinue
  if (-not $command) {
    throw ("Missing required command: " + $ToolName)
  }
}

function Resolve-NpmCommand {
  if ($env:OS -eq "Windows_NT") {
    return "npm.cmd"
  }
  return "npm"
}

function Invoke-CommandChecked {
  param(
    [string]$Label,
    [string]$Command,
    [string[]]$Arguments
  )
  Write-ObservedLog ($Label + " -> " + $Command + " " + ($Arguments -join " "))
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw ($Label + " failed with exit code " + $LASTEXITCODE)
  }
}

function Invoke-CommandAllowFailure {
  param(
    [string]$Label,
    [string]$Command,
    [string[]]$Arguments
  )
  Write-ObservedLog ($Label + " -> " + $Command + " " + ($Arguments -join " "))
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    Write-ObservedLog ($Label + " failed with exit code " + $LASTEXITCODE + " (continuing)")
  }
}

function Build-ObserverStartArgs {
  param(
    [string]$RemoteScriptPath,
    [string]$RunId,
    [string]$OpsEndpoint,
    [string]$OpsTokenValue,
    [int]$IntervalSec,
    [string]$IfaceName,
    [string]$Pm2ProcessName
  )
  $args = @("bash", $RemoteScriptPath, "start", $RunId, "--ops-url", $OpsEndpoint, "--interval-sec", $IntervalSec.ToString(), "--pm2-app", $Pm2ProcessName)
  if (-not [string]::IsNullOrWhiteSpace($OpsTokenValue)) {
    $args += @("--ops-token", $OpsTokenValue)
  }
  if (-not [string]::IsNullOrWhiteSpace($IfaceName)) {
    $args += @("--iface", $IfaceName)
  }
  return $args
}

function Resolve-RunStore {
  $runsDir = Join-Path -Path (Get-Location) -ChildPath "observed-runs"
  if (-not (Test-Path -Path $runsDir)) {
    New-Item -Path $runsDir -ItemType Directory -Force | Out-Null
  }
  return $runsDir
}

function Resolve-ObserverScriptPath {
  $cwdCandidate = Join-Path -Path "." -ChildPath "loadtest/space-force-observe.sh"
  if (Test-Path -Path $cwdCandidate) {
    return $cwdCandidate
  }
  $scriptDir = Split-Path -Path $PSCommandPath -Parent
  return (Join-Path -Path $scriptDir -ChildPath "space-force-observe.sh")
}

function Run-Loadtest {
  param(
    [string]$NpmCommand,
    [string]$RunnerMode,
    [string]$LogPath,
    [int]$Clients,
    [int]$DelayMs,
    [int]$DurationSeconds,
    [int]$UsersPerRoomCount,
    [string]$RoomCodeValue,
    [int]$SummaryMs,
    [int]$RequestTimeout
  )
  $loadtestScript = "loadtest:" + $RunnerMode
  $args = @(
    "run",
    $loadtestScript,
    "--",
    "--numClients",
    $Clients.ToString(),
    "--delay",
    $DelayMs.ToString(),
    "--durationSec",
    $DurationSeconds.ToString(),
    "--summaryIntervalMs",
    $SummaryMs.ToString(),
    "--requestTimeoutMs",
    $RequestTimeout.ToString(),
    "--autoExitOnComplete",
    "true",
    "--output",
    $LogPath
  )

  if ($RunnerMode -eq "lobbyfill") {
    $args += @("--usersPerRoom", $UsersPerRoomCount.ToString())
  } else {
    if ([string]::IsNullOrWhiteSpace($RoomCodeValue)) {
      throw "RoomCode is required when -Runner roomcode is used."
    }
    $args += @("--roomCode", $RoomCodeValue.Trim().ToUpperInvariant())
  }

  Write-ObservedLog ("Running local loadtest via npm " + ($args -join " "))
  & $NpmCommand @args
  return $LASTEXITCODE
}

$runStartedAt = Get-Date
$runId = New-RunId
$resolvedDropletHost = Resolve-DropletHost -ProvidedHost $DropletHost
$resolvedOpsToken = Resolve-OpsToken -ProvidedToken $OpsToken
$npmCommand = Resolve-NpmCommand

Ensure-Tool -ToolName "ssh"
Ensure-Tool -ToolName "scp"
Ensure-Tool -ToolName "tar"
Ensure-Tool -ToolName $npmCommand

$runsDir = Resolve-RunStore
$runDir = Join-Path -Path $runsDir -ChildPath $runId
New-Item -Path $runDir -ItemType Directory -Force | Out-Null
$loadtestLogPath = Join-Path -Path $runDir -ChildPath "loadtest.log"
$localArchivePath = Join-Path -Path $runDir -ChildPath ($runId + ".tar.gz")
$remoteArchivePath = $RemoteObserveRoot.TrimEnd("/") + "/" + $runId + ".tar.gz"
$observerLocalPath = Resolve-ObserverScriptPath

Write-ObservedLog ("runId=" + $runId + " runner=" + $Runner + " host=" + $resolvedDropletHost)

$observerStarted = $false
$loadtestExitCode = 1
$artifactPulled = $false

try {
  if ($SyncObserverScript) {
    if (-not (Test-Path -Path $observerLocalPath)) {
      throw ("Observer script not found at " + $observerLocalPath)
    }
    Invoke-CommandChecked -Label "Sync observer script" -Command "scp" -Arguments @($observerLocalPath, ($resolvedDropletHost + ":" + $RemoteObserverPath))
    Invoke-CommandChecked -Label "Set observer script executable" -Command "ssh" -Arguments @($resolvedDropletHost, "chmod", "+x", $RemoteObserverPath)
  }

  $startArgs = Build-ObserverStartArgs -RemoteScriptPath $RemoteObserverPath -RunId $runId -OpsEndpoint $OpsUrl -OpsTokenValue $resolvedOpsToken -IntervalSec $ObserveIntervalSec -IfaceName $Interface -Pm2ProcessName $Pm2App
  $sshStartArgs = @($resolvedDropletHost) + $startArgs
  Invoke-CommandChecked -Label "Start remote observer" -Command "ssh" -Arguments $sshStartArgs
  $observerStarted = $true

  if ($WarmupSec -gt 0) {
    Write-ObservedLog ("Warmup for " + $WarmupSec + "s before loadtest")
    Start-Sleep -Seconds $WarmupSec
  }

  $loadtestExitCode = Run-Loadtest -NpmCommand $npmCommand -RunnerMode $Runner -LogPath $loadtestLogPath -Clients $NumClients -DelayMs $Delay -DurationSeconds $DurationSec -UsersPerRoomCount $UsersPerRoom -RoomCodeValue $RoomCode -SummaryMs $SummaryIntervalMs -RequestTimeout $RequestTimeoutMs
  Write-ObservedLog ("Loadtest finished with exit code " + $loadtestExitCode)
} finally {
  if ($observerStarted) {
    Invoke-CommandAllowFailure -Label "Stop remote observer" -Command "ssh" -Arguments @($resolvedDropletHost, "bash", $RemoteObserverPath, "stop", $runId)
    Invoke-CommandAllowFailure -Label "Pack remote observer artifacts" -Command "ssh" -Arguments @($resolvedDropletHost, "bash", $RemoteObserverPath, "pack", $runId)

    Invoke-CommandAllowFailure -Label "Pull observer archive" -Command "scp" -Arguments @(($resolvedDropletHost + ":" + $remoteArchivePath), $localArchivePath)
    if (Test-Path -Path $localArchivePath) {
      $artifactPulled = $true
      Invoke-CommandAllowFailure -Label "Extract observer archive" -Command "tar" -Arguments @("-xzf", $localArchivePath, "-C", $runDir)
    }

    $extractedRunDir = Join-Path -Path $runDir -ChildPath $runId
    if (Test-Path -Path $extractedRunDir) {
      $expectedFiles = @("pm2.log", "kernel.log", "metrics.log", "meta.json")
      foreach ($name in $expectedFiles) {
        $sourcePath = Join-Path -Path $extractedRunDir -ChildPath $name
        if (Test-Path -Path $sourcePath) {
          Copy-Item -Path $sourcePath -Destination (Join-Path -Path $runDir -ChildPath $name) -Force
        }
      }
    }

    Invoke-CommandAllowFailure -Label "Delete remote observer archive" -Command "ssh" -Arguments @($resolvedDropletHost, "rm", "-f", $remoteArchivePath)
  }

  $runEndedAt = Get-Date
  $runMeta = [ordered]@{
    runId = $runId
    startedAtIso = $runStartedAt.ToUniversalTime().ToString("o")
    endedAtIso = $runEndedAt.ToUniversalTime().ToString("o")
    runner = $Runner
    params = [ordered]@{
      numClients = $NumClients
      usersPerRoom = $UsersPerRoom
      roomCode = if ([string]::IsNullOrWhiteSpace($RoomCode)) { $null } else { $RoomCode.Trim().ToUpperInvariant() }
      delay = $Delay
      durationSec = $DurationSec
      warmupSec = $WarmupSec
      summaryIntervalMs = $SummaryIntervalMs
      requestTimeoutMs = $RequestTimeoutMs
    }
    observer = [ordered]@{
      dropletHost = $resolvedDropletHost
      remoteObserverPath = $RemoteObserverPath
      remoteObserveRoot = $RemoteObserveRoot
      opsUrl = $OpsUrl
      intervalSec = $ObserveIntervalSec
      iface = if ([string]::IsNullOrWhiteSpace($Interface)) { $null } else { $Interface.Trim() }
      pm2App = $Pm2App
      syncedObserverScript = $SyncObserverScript
    }
    artifacts = [ordered]@{
      pulled = $artifactPulled
      localArchivePath = if ($artifactPulled) { $localArchivePath } else { $null }
      remoteArchivePath = $remoteArchivePath
      loadtestLogPath = $loadtestLogPath
    }
    loadtestExitCode = $loadtestExitCode
  }
  $runMetaPath = Join-Path -Path $runDir -ChildPath "run-meta.json"
  $runMeta | ConvertTo-Json -Depth 10 | Set-Content -Path $runMetaPath -Encoding utf8
  Write-ObservedLog ("Wrote run metadata " + $runMetaPath)

  $indexArgs = @("run", "observed:index", "--", "--runId", $runId)
  Write-ObservedLog ("Building observed run index via npm " + ($indexArgs -join " "))
  & $npmCommand @indexArgs
  if ($LASTEXITCODE -ne 0) {
    Write-ObservedLog ("Observed index build failed with exit code " + $LASTEXITCODE)
  }
}

if ($loadtestExitCode -ne 0) {
  Write-ObservedLog ("Observed loadtest completed with non-zero loadtest exit code " + $loadtestExitCode)
  exit $loadtestExitCode
}

Write-ObservedLog ("Observed loadtest completed successfully for runId=" + $runId)

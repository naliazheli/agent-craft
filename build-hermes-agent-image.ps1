$ErrorActionPreference = "Stop"

$Image = if ($env:HERMES_AGENT_IMAGE) { $env:HERMES_AGENT_IMAGE } else { "aifactory/hermes-agent:real-local" }
$Dockerfile = if ($env:HERMES_AGENT_DOCKERFILE) { $env:HERMES_AGENT_DOCKERFILE } else { Join-Path $PSScriptRoot "docker\hermes-agent.real.Dockerfile" }
$Context = if ($env:HERMES_AGENT_SOURCE_PATH) {
    $env:HERMES_AGENT_SOURCE_PATH
} elseif (Test-Path "E:\hermes\hermes-agent") {
    "E:\hermes\hermes-agent"
} else {
    Join-Path $PSScriptRoot "hermes-agent"
}

function Convert-ToWslPath([string] $Path) {
    $resolved = (Resolve-Path $Path).Path
    if ($resolved -match "^([A-Za-z]):\\(.*)$") {
        return "/mnt/$($Matches[1].ToLower())/$($Matches[2] -replace '\\','/')"
    }
    return $resolved
}

if ($env:HERMES_AGENT_BUILD_WITH_WSL -in @("1", "true", "yes")) {
    $WslContext = Convert-ToWslPath $Context
    $Args = @("docker", "build", "-t", $Image)
    if ($Dockerfile) {
        $Args += @("-f", (Convert-ToWslPath $Dockerfile))
    }
    $Args += $WslContext
    wsl @Args
} else {
    $Args = @("build", "-t", $Image)
    if ($Dockerfile) {
        $Args += @("-f", $Dockerfile)
    }
    $Args += $Context
    docker @Args
}

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "Built Hermes agent image: $Image"

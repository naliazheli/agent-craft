$ErrorActionPreference = "Stop"

$Image = if ($env:CODEX_AGENT_IMAGE) { $env:CODEX_AGENT_IMAGE } else { "aifactory/codex-agent:local" }
$Dockerfile = if ($env:CODEX_AGENT_DOCKERFILE) { $env:CODEX_AGENT_DOCKERFILE } else { Join-Path $PSScriptRoot "docker\codex-agent.local.Dockerfile" }
$Platform = if ($env:CODEX_AGENT_PLATFORM) { $env:CODEX_AGENT_PLATFORM } elseif ($env:DOCKER_DEFAULT_PLATFORM) { $env:DOCKER_DEFAULT_PLATFORM } else { "" }
$DebianMirror = if ($env:CODEX_AGENT_DEBIAN_MIRROR) { $env:CODEX_AGENT_DEBIAN_MIRROR } elseif ($env:DEBIAN_MIRROR) { $env:DEBIAN_MIRROR } else { "http://mirrors.tuna.tsinghua.edu.cn/debian" }
$DebianSecurityMirror = if ($env:CODEX_AGENT_DEBIAN_SECURITY_MIRROR) { $env:CODEX_AGENT_DEBIAN_SECURITY_MIRROR } elseif ($env:DEBIAN_SECURITY_MIRROR) { $env:DEBIAN_SECURITY_MIRROR } else { "http://mirrors.tuna.tsinghua.edu.cn/debian-security" }

if (-not $Platform) {
    $Platform = (docker info --format '{{.OSType}}/{{.Architecture}}' 2>$null)
    $Platform = $Platform.Replace("x86_64", "amd64").Replace("aarch64", "arm64")
}

$PlatformArgs = @()
if ($Platform) {
    $PlatformArgs = @("--platform", $Platform)
}

$BuildArgs = @()
if ($DebianMirror) {
    $BuildArgs += @("--build-arg", "DEBIAN_MIRROR=$DebianMirror")
}
if ($DebianSecurityMirror) {
    $BuildArgs += @("--build-arg", "DEBIAN_SECURITY_MIRROR=$DebianSecurityMirror")
}

docker build @PlatformArgs @BuildArgs -f $Dockerfile -t $Image $PSScriptRoot
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$PlatformLabel = if ($Platform) { " ($Platform)" } else { "" }
Write-Host "Built codex agent image: $Image$PlatformLabel"

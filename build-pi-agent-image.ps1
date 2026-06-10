$ErrorActionPreference = "Stop"

$Image = if ($env:PI_AGENT_IMAGE) { $env:PI_AGENT_IMAGE } else { "aifactory/pi-agent:local" }
$Dockerfile = if ($env:PI_AGENT_DOCKERFILE) { $env:PI_AGENT_DOCKERFILE } else { Join-Path $PSScriptRoot "docker\pi-agent.local.Dockerfile" }
$NodeBase = if ($env:PI_AGENT_NODE_BASE) { $env:PI_AGENT_NODE_BASE } else { "node:24-bookworm" }
$PiPackage = if ($env:PI_AGENT_PACKAGE) { $env:PI_AGENT_PACKAGE } else { "@earendil-works/pi-coding-agent" }
$Platform = if ($env:PI_AGENT_PLATFORM) { $env:PI_AGENT_PLATFORM } elseif ($env:DOCKER_DEFAULT_PLATFORM) { $env:DOCKER_DEFAULT_PLATFORM } else { "" }
$DebianMirror = if ($env:PI_AGENT_DEBIAN_MIRROR) { $env:PI_AGENT_DEBIAN_MIRROR } elseif ($env:DEBIAN_MIRROR) { $env:DEBIAN_MIRROR } else { "http://mirrors.tuna.tsinghua.edu.cn/debian" }
$DebianSecurityMirror = if ($env:PI_AGENT_DEBIAN_SECURITY_MIRROR) { $env:PI_AGENT_DEBIAN_SECURITY_MIRROR } elseif ($env:DEBIAN_SECURITY_MIRROR) { $env:DEBIAN_SECURITY_MIRROR } else { "http://mirrors.tuna.tsinghua.edu.cn/debian-security" }

if (-not $Platform) {
    $Platform = (docker info --format '{{.OSType}}/{{.Architecture}}' 2>$null)
    $Platform = $Platform.Replace("x86_64", "amd64").Replace("aarch64", "arm64")
}

$PlatformArgs = @()
if ($Platform) {
    $PlatformArgs = @("--platform", $Platform)
}

$BuildArgs = @("--build-arg", "PI_AGENT_NODE_BASE=$NodeBase", "--build-arg", "PI_AGENT_PACKAGE=$PiPackage")
if ($DebianMirror) {
    $BuildArgs += @("--build-arg", "DEBIAN_MIRROR=$DebianMirror")
}
if ($DebianSecurityMirror) {
    $BuildArgs += @("--build-arg", "DEBIAN_SECURITY_MIRROR=$DebianSecurityMirror")
}

docker build @PlatformArgs @BuildArgs -t $Image -f $Dockerfile $PSScriptRoot
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$PlatformLabel = if ($Platform) { " ($Platform)" } else { "" }
Write-Host "Built pi agent image: $Image$PlatformLabel"

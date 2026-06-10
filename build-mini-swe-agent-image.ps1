$ErrorActionPreference = "Stop"

$Image = if ($env:MINI_SWE_AGENT_IMAGE) { $env:MINI_SWE_AGENT_IMAGE } else { "aifactory/mini-swe-agent:local" }
$Dockerfile = if ($env:MINI_SWE_AGENT_DOCKERFILE) { $env:MINI_SWE_AGENT_DOCKERFILE } else { Join-Path $PSScriptRoot "docker\mini-swe-agent.local.Dockerfile" }
$BaseImage = if ($env:MINI_SWE_AGENT_BASE_IMAGE) { $env:MINI_SWE_AGENT_BASE_IMAGE } else { "python:3.12-slim" }
$Platform = if ($env:MINI_SWE_AGENT_PLATFORM) { $env:MINI_SWE_AGENT_PLATFORM } elseif ($env:DOCKER_DEFAULT_PLATFORM) { $env:DOCKER_DEFAULT_PLATFORM } else { "" }
$DebianMirror = if ($env:MINI_SWE_AGENT_DEBIAN_MIRROR) { $env:MINI_SWE_AGENT_DEBIAN_MIRROR } elseif ($env:DEBIAN_MIRROR) { $env:DEBIAN_MIRROR } else { "http://mirrors.tuna.tsinghua.edu.cn/debian" }
$DebianSecurityMirror = if ($env:MINI_SWE_AGENT_DEBIAN_SECURITY_MIRROR) { $env:MINI_SWE_AGENT_DEBIAN_SECURITY_MIRROR } elseif ($env:DEBIAN_SECURITY_MIRROR) { $env:DEBIAN_SECURITY_MIRROR } else { "http://mirrors.tuna.tsinghua.edu.cn/debian-security" }
$PipIndexUrl = if ($env:MINI_SWE_AGENT_PIP_INDEX_URL) { $env:MINI_SWE_AGENT_PIP_INDEX_URL } elseif ($env:PIP_INDEX_URL) { $env:PIP_INDEX_URL } else { "https://pypi.tuna.tsinghua.edu.cn/simple" }

if (-not $Platform) {
    $Platform = (docker info --format '{{.OSType}}/{{.Architecture}}' 2>$null)
    $Platform = $Platform.Replace("x86_64", "amd64").Replace("aarch64", "arm64")
}

$PlatformArgs = @()
if ($Platform) {
    $PlatformArgs = @("--platform", $Platform)
}

$BuildArgs = @("--build-arg", "MINI_SWE_AGENT_BASE_IMAGE=$BaseImage")
if ($DebianMirror) {
    $BuildArgs += @("--build-arg", "DEBIAN_MIRROR=$DebianMirror")
}
if ($DebianSecurityMirror) {
    $BuildArgs += @("--build-arg", "DEBIAN_SECURITY_MIRROR=$DebianSecurityMirror")
}
if ($PipIndexUrl) {
    $BuildArgs += @("--build-arg", "PIP_INDEX_URL=$PipIndexUrl")
}

docker build @PlatformArgs @BuildArgs -t $Image -f $Dockerfile $PSScriptRoot
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$PlatformLabel = if ($Platform) { " ($Platform)" } else { "" }
Write-Host "Built mini-swe-agent image: $Image$PlatformLabel"

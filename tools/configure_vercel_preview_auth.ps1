$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$vercelPath = Join-Path $env:LOCALAPPDATA 'Temp\haebaek-vercel-cli\node_modules\.bin\vercel.cmd'
$scriptPath = Join-Path $PSScriptRoot 'configure_vercel_preview_auth.mjs'

if (-not (Test-Path -LiteralPath $nodePath)) {
    throw "Codex Node.js 실행 파일을 찾을 수 없습니다: $nodePath"
}
if (-not (Test-Path -LiteralPath $vercelPath)) {
    throw "인증된 Vercel CLI를 찾을 수 없습니다: $vercelPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.vercel\project.json'))) {
    throw '기존 Vercel 프로젝트 연결 정보를 찾을 수 없습니다.'
}

Push-Location $projectRoot
try {
    & $nodePath $scriptPath $vercelPath 'codex/vercel-auth-preview'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}

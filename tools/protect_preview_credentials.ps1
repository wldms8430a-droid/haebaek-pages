$ErrorActionPreference = 'Stop'
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$target = Join-Path (Split-Path -Parent $PSScriptRoot) 'local\preview-auth-credentials.json'
$parent = Split-Path -Parent $target
New-Item -ItemType Directory -Force -Path $parent | Out-Null

$protected = [ordered]@{}
foreach ($name in @('staff', 'admin')) {
    $secure = ConvertTo-SecureString -String $payload.$name -AsPlainText -Force
    $protected[$name] = ConvertFrom-SecureString -SecureString $secure
}
$protected | ConvertTo-Json | Set-Content -LiteralPath $target -Encoding UTF8

$ErrorActionPreference = 'Stop'
[void][Reflection.Assembly]::LoadWithPartialName('System.Security')
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$target = Join-Path (Split-Path -Parent $PSScriptRoot) 'local\preview-auth-credentials.json'
$parent = Split-Path -Parent $target
New-Item -ItemType Directory -Force -Path $parent | Out-Null

$protected = [ordered]@{}
foreach ($name in @('staff', 'admin')) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload.$name)
    try {
        $cipher = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $protected[$name] = [Convert]::ToBase64String($cipher)
    }
    finally {
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}
$protected | ConvertTo-Json | Set-Content -LiteralPath $target -Encoding UTF8

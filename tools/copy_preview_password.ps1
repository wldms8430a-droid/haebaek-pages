param([Parameter(Mandatory=$true)][ValidateSet('staff','admin')][string]$Account)
$ErrorActionPreference = 'Stop'
[void][Reflection.Assembly]::LoadWithPartialName('System.Security')
$source = Join-Path (Split-Path -Parent $PSScriptRoot) 'local\preview-auth-credentials.json'
$encrypted = (Get-Content -Raw -LiteralPath $source | ConvertFrom-Json).$Account
$cipher = [Convert]::FromBase64String($encrypted)
$bytes = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
try {
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.Clipboard]::SetText([Text.Encoding]::UTF8.GetString($bytes))
}
finally {
    [Array]::Clear($bytes, 0, $bytes.Length)
}
Write-Output "$Account Preview 비밀번호를 클립보드에 복사했습니다."

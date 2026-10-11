param([Parameter(Mandatory=$true)][ValidateSet('staff','admin')][string]$Account)
$ErrorActionPreference = 'Stop'
$source = Join-Path (Split-Path -Parent $PSScriptRoot) 'local\preview-auth-credentials.json'
$encrypted = (Get-Content -Raw -LiteralPath $source | ConvertFrom-Json).$Account
$secure = ConvertTo-SecureString -String $encrypted
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | Set-Clipboard
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
Write-Output "$Account Preview 비밀번호를 클립보드에 복사했습니다."

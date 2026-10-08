$ErrorActionPreference = 'Stop'
$toolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $toolRoot
$candidates = @((Join-Path $projectRoot 'local\admin-venv\Scripts\pythonw.exe'), (Join-Path (Split-Path -Parent $projectRoot) 'deployment-haebaek\backend\.venv\Scripts\pythonw.exe'))
$pythonPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $pythonPath) { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('관리자 Python 환경을 먼저 준비해주세요.'); exit 1 }
Start-Process -FilePath $pythonPath -ArgumentList @('"' + (Join-Path $toolRoot 'folder_publisher.py') + '"') -WorkingDirectory $toolRoot -WindowStyle Hidden

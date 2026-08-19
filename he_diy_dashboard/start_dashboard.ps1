$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Start-Process -FilePath python -ArgumentList @("backend\server.py", "--port", "8765") -WorkingDirectory $root -PassThru -WindowStyle Hidden

try {
    Write-Host "Python backend: http://127.0.0.1:8765"
    Write-Host "Node dashboard: http://127.0.0.1:5174"
    Write-Host "Press Ctrl+C to stop the dashboard."
    node "$root\frontend\server.js"
}
finally {
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
}

$gitExe = "C:\Program Files\Git\cmd\git.exe"

if (-not (Test-Path $gitExe)) {
    Write-Output "git.exe not found at $gitExe"
    exit 1
}

& $gitExe init
& $gitExe config user.name "David"
& $gitExe config user.email "david@domodev.local"
& $gitExe add -A
& $gitExe commit -m "feat: initial release of homebridge-eaton-xstorage plugin"
& $gitExe status

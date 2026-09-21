$hbUrl = "http://192.168.1.200:8581/api"
$username = "davide"
$password = "GUA2026dav!"

Write-Output "--- 1. Authenticating with Homebridge ---"
$loginBody = @{
    username = $username
    password = $password
} | ConvertTo-Json

try {
    $loginRes = Invoke-RestMethod -Uri "$hbUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginRes.access_token
    Write-Output "Login SUCCESSFUL! Token: $($token.Substring(0, 20))..."
} catch {
    Write-Output "Login FAILED: $($_.Exception.Message)"
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
}

Write-Output "`n--- 2. Getting Server Status ---"
try {
    $status = Invoke-RestMethod -Uri "$hbUrl/status/server-information" -Method Get -Headers $headers
    Write-Output ($status | ConvertTo-Json -Depth 3)
} catch {
    Write-Output "Server status error: $($_.Exception.Message)"
}

Write-Output "`n--- 3. Getting Installed Plugins ---"
try {
    $plugins = Invoke-RestMethod -Uri "$hbUrl/plugins" -Method Get -Headers $headers
    foreach ($p in $plugins) {
        Write-Output "Plugin: $($p.name) (v$($p.installedVersion))"
    }
} catch {
    Write-Output "Plugins error: $($_.Exception.Message)"
}

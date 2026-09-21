$hbUrl = "http://192.168.1.200:8581"
$username = "davide"
$password = "GUA2026dav!"

$loginBody = @{ username = $username; password = $password } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Uri "$hbUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginRes.access_token

try {
    $handshake = Invoke-RestMethod -Uri "$hbUrl/socket.io/?EIO=4&transport=polling&token=$token" -Method Get
    Write-Output "Socket.IO handshake response: $handshake"
} catch {
    Write-Output "Handshake error: $($_.Exception.Message)"
}

<#
.SYNOPSIS
    Test script to verify communication with Eaton xStorage inverter.
.EXAMPLE
    .\test_connection.ps1 -HostAddress "192.168.1.73" -Username "user" -Password "..."
#>

param(
    [string]$HostAddress = "192.168.1.73",
    [string]$Username,
    [string]$Password
)

if (-not $Username) {
    $Username = Read-Host "Enter Inverter Username"
}
if (-not $Password) {
    $Password = Read-Host -AsSecureString "Enter Inverter Password"
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
    $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}

$baseUrl = "https://$HostAddress/api"

Write-Host "Connecting to $baseUrl/auth/signin..." -ForegroundColor Cyan
$loginBody = @{
    username = $Username
    pwd = $Password
    userType = "customer"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/signin" -Method Post -Body $loginBody -ContentType "application/json" -TimeoutSec 10
    $token = $loginResponse.result.token
    Write-Host "Authentication Successful! Token acquired." -ForegroundColor Green
} catch {
    Write-Host "Authentication Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{ Authorization = "Bearer $token" }

Write-Host "`nFetching live telemetry from $baseUrl/device/status..." -ForegroundColor Cyan
try {
    $status = Invoke-RestMethod -Uri "$baseUrl/device/status" -Method Get -Headers $headers -TimeoutSec 10
    $flow = $status.result.energyFlow
    
    Write-Host "`n=== EATON XSTORAGE LIVE TELEMETRY ===" -ForegroundColor Yellow
    Write-Host ("Battery SoC:        {0}%" -f $flow.stateOfCharge) -ForegroundColor Green
    Write-Host ("Battery Status:     {0}" -f $flow.batteryStatus)
    Write-Host ("Battery Power:      {0} W" -f $flow.batteryEnergyFlow)
    Write-Host ("Solar PV Power:     {0} W (DC: {1} W, AC: {2} W)" -f ($flow.dcPvValue + $flow.acPvValue), $flow.dcPvValue, $flow.acPvValue) -ForegroundColor Green
    Write-Host ("House Consumption:  {0} W" -f ($flow.criticalLoadValue + $flow.nonCriticalLoadValue))
    Write-Host ("Grid Power:         {0} W (Role: {1})" -f $flow.gridValue, $flow.gridRole)
    Write-Host ("Operation Mode:     {0}" -f $flow.operationMode)
    Write-Host "=====================================" -ForegroundColor Yellow
} catch {
    Write-Host "Failed to fetch device status: $($_.Exception.Message)" -ForegroundColor Red
}

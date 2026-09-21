$content = (Invoke-WebRequest -Uri 'http://192.168.1.200:8581/main-ONDCASUV.js' -UseBasicParsing).Content

$regex = [System.Text.RegularExpressions.Regex]::new('(?:\.emit|\.on)\(["'']([^"'']+)["'']')
$matches = $regex.Matches($content)
$results = @()
foreach ($m in $matches) {
    $results += $m.Groups[1].Value
}
$results | Select-Object -Unique | Sort-Object | Out-File -FilePath "socket_events.txt" -Encoding utf8
Write-Output "Found events: $($results.Count)"

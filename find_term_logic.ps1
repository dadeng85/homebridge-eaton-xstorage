$content = (Invoke-WebRequest -Uri 'http://192.168.1.200:8581/main-ONDCASUV.js' -UseBasicParsing).Content

$idx = $content.IndexOf('getEffectiveTerminalLightingMode')
if ($idx -ge 0) {
    Write-Output $content.Substring([Math]::Max(0, $idx - 500), 2000)
}

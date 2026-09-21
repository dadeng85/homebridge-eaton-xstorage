$content = (Invoke-WebRequest -Uri 'http://192.168.1.200:8581/main-ONDCASUV.js' -UseBasicParsing).Content

$idx = $content.IndexOf('/terminal')
if ($idx -ge 0) {
    Write-Output "Context around /terminal:"
    Write-Output $content.Substring([Math]::Max(0, $idx - 100), 400)
} else {
    Write-Output "/terminal not found directly"
}

$idxTerm = $content.IndexOf('Terminal')
if ($idxTerm -ge 0) {
    Write-Output "Context around Terminal:"
    Write-Output $content.Substring([Math]::Max(0, $idxTerm - 100), 400)
}

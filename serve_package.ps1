$port = 8080
$tgzPath = "c:\Users\david\Desktop\Casa\wrk\DomoDev\homebridge-eaton-xstorage-1.0.0.tgz"
$bytes = [System.IO.File]::ReadAllBytes($tgzPath)

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
$listener.Start()
Write-Output "HTTP server listening on port $port, serving $($bytes.Length) bytes..."

$timeout = 3600 # 1 hour
$startTime = [DateTime]::UtcNow

while (($startTime.AddSeconds($timeout) -gt [DateTime]::UtcNow)) {
    if ($listener.Pending()) {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = [System.IO.StreamReader]::new($stream)
        $requestLine = $reader.ReadLine()
        Write-Output "Received request: $requestLine"

        # Read remaining headers
        while ($line = $reader.ReadLine()) {
            if ($line -eq "") { break }
        }

        $headerStr = "HTTP/1.1 200 OK`r`n" +
                     "Content-Type: application/gzip`r`n" +
                     "Content-Length: $($bytes.Length)`r`n" +
                     "Content-Disposition: attachment; filename=homebridge-eaton-xstorage-1.0.0.tgz`r`n" +
                     "Connection: close`r`n`r`n"
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerStr)

        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush()
        $client.Close()
        Write-Output "File delivered successfully!"
    }
    Start-Sleep -Milliseconds 200
}

$listener.Stop()
Write-Output "Server stopped."

$hbUrl = "http://192.168.1.200:8581/api"
$username = "davide"
$password = "GUA2026dav!"

$loginBody = @{ username = $username; password = $password } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Uri "$hbUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$headers = @{ Authorization = "Bearer $($loginRes.access_token)" }

# Fetch fresh config as raw text
$rawConfig = (Invoke-WebRequest -Uri "$hbUrl/config-editor" -Method Get -Headers $headers -UseBasicParsing).Content

if ($rawConfig -match '"platform":\s*"EatonXStorage"') {
    Write-Output "EatonXStorage platform is already present in config.json!"
    exit 0
}

$eatonBlock = @'
                      },
                      {
                          "platform": "EatonXStorage",
                          "name": "Eaton xStorage",
                          "ip": "192.168.1.73",
                          "username": "user",
                          "password": "GUA2026dav!",
                          "pollInterval": 10,
                          "exposeLuxSensors": true,
                          "exposeEveSensors": true,
                          "lowBatteryThreshold": 10
                      }
                  ]
'@

# Replace the last `}\s*\]` with the eatonBlock
$idx = $rawConfig.LastIndexOf("]")
if ($idx -gt 0) {
    # Find the closing brace of the last platform before ]
    $sub = $rawConfig.Substring(0, $idx)
    $lastBrace = $sub.LastIndexOf("}")
    if ($lastBrace -gt 0) {
        $newConfig = $rawConfig.Substring(0, $lastBrace) + $eatonBlock + $rawConfig.Substring($idx + 1)
        
        # Validate that newConfig is valid JSON
        try {
            $parsed = ConvertFrom-Json $newConfig
            Write-Output "Generated config is valid JSON! Platforms: $($parsed.platforms.Count)"
            
            # Post updated config to Homebridge
            $res = Invoke-RestMethod -Uri "$hbUrl/config-editor" -Method Post -Headers $headers -Body $newConfig -ContentType "application/json"
            Write-Output "Successfully updated config.json on Homebridge!"
        } catch {
            Write-Output "JSON validation failed: $($_.Exception.Message)"
        }
    }
}

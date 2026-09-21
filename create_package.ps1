if (Test-Path "pkg_staging") { Remove-Item -Recurse -Force "pkg_staging" }
New-Item -ItemType Directory -Path "pkg_staging\package" | Out-Null

Copy-Item "package.json" -Destination "pkg_staging\package\"
Copy-Item "config.schema.json" -Destination "pkg_staging\package\"
Copy-Item "README.md" -Destination "pkg_staging\package\"
Copy-Item -Recurse "dist" -Destination "pkg_staging\package\"

tar.exe -czf "homebridge-eaton-xstorage-1.0.0.tgz" -C "pkg_staging" "package"

Remove-Item -Recurse -Force "pkg_staging"

if (Test-Path "homebridge-eaton-xstorage-1.0.0.tgz") {
    $size = (Get-Item "homebridge-eaton-xstorage-1.0.0.tgz").Length
    Write-Output "Package created successfully: homebridge-eaton-xstorage-1.0.0.tgz ($size bytes)"
} else {
    Write-Output "Failed to create package"
}

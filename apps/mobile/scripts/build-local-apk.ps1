# Synap Android GA release APK (public).
# Usage: powershell -File apps/mobile/scripts/build-local-apk.ps1
# QA con auto-login: build-qa-apk.ps1
$ErrorActionPreference = 'Stop'
$env:ANDROID_HOME = 'C:\Android'
$env:ANDROID_SDK_ROOT = 'C:\Android'
$env:JAVA_HOME = 'c:\Java\jdk-17.0.12+7'
$env:ANDROID_NDK_HOME = 'C:\Android\ndk\26.1.10909125'
$env:EXPO_PUBLIC_API_URL = 'https://api.synapmsg.ai'
$env:EXPO_PUBLIC_WS_URL = 'wss://api.synapmsg.ai/ws'
# Public release: no credentials baked in.
$env:EXPO_PUBLIC_AUTO_LOGIN = '0'
$env:EXPO_PUBLIC_ENCLAVE_STRICT = '1'
$env:PATH = "$env:JAVA_HOME\bin;C:\Android\platform-tools;$env:PATH"

$buildRoot = 'C:\build\synapmsg-ga'
$srcRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repoRoot = (Resolve-Path (Join-Path $srcRoot '..\..')).Path

New-Item -ItemType Directory -Force -Path C:\build | Out-Null
if (Test-Path $buildRoot) {
  Remove-Item $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null
robocopy $repoRoot $buildRoot /E /XD .git node_modules android .expo dist build /NFL /NDL /NJH /NJS | Out-Null

Set-Location (Join-Path $buildRoot 'apps\mobile')

@"
EXPO_PUBLIC_API_URL=https://api.synapmsg.ai
EXPO_PUBLIC_WS_URL=wss://api.synapmsg.ai/ws
EXPO_PUBLIC_AUTO_LOGIN=0
EXPO_PUBLIC_ENCLAVE_STRICT=1
"@ | Set-Content -Path '.env' -Encoding utf8

npm install --prefer-offline --no-audit --no-fund

npx expo prebuild --platform android --no-install

$gp = Get-Content 'android\gradle.properties' -Raw
$gp = $gp -replace 'reactNativeArchitectures=.*', 'reactNativeArchitectures=arm64-v8a'
if ($gp -notmatch 'android.ndkVersion=26') { $gp += "`nandroid.ndkVersion=26.1.10909125`n" }
Set-Content 'android\gradle.properties' $gp -Encoding utf8

Push-Location android
.\gradlew.bat assembleRelease --no-daemon
Pop-Location

$apk = Get-ChildItem 'android\app\build\outputs\apk\release\*.apk' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $apk) { throw 'APK not found after assembleRelease' }
Write-Host "APK: $($apk.FullName)"
New-Item -ItemType Directory -Force -Path C:\build\synapmsg | Out-Null
Copy-Item $apk.FullName 'C:\build\synapmsg\synapmsg-android-ga.apk' -Force

adb devices | ForEach-Object {
  if ($_ -match '^(\S+)\s+device') {
    $serial = $Matches[1]
    & adb @('-s', $serial, 'uninstall', 'com.synapmsg.app') 2>$null
    & adb @('-s', $serial, 'install', '-r', $apk.FullName)
    & adb @('-s', $serial, 'shell', 'am', 'start', '-n', 'com.synapmsg.app/.MainActivity')
  }
}

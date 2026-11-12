# Owner QA APK (auto-login). Do NOT upload this build as the public APK.
# Usage:
#   $env:SYNAP_QA_EMAIL='...'; $env:SYNAP_QA_PASSWORD='...'
#   powershell -File apps/mobile/scripts/build-qa-apk.ps1
# Or put secrets in apps/mobile/scripts/qa-secrets.local.ps1 (gitignored).
$ErrorActionPreference = 'Stop'

$localSecrets = Join-Path $PSScriptRoot 'qa-secrets.local.ps1'
if (Test-Path $localSecrets) {
  . $localSecrets
}

if (-not $env:SYNAP_QA_EMAIL -or -not $env:SYNAP_QA_PASSWORD) {
  throw 'Missing SYNAP_QA_EMAIL / SYNAP_QA_PASSWORD (env or qa-secrets.local.ps1). Never hardcode credentials.'
}

$env:ANDROID_HOME = 'C:\Android'
$env:ANDROID_SDK_ROOT = 'C:\Android'
$env:JAVA_HOME = 'c:\Java\jdk-17.0.12+7'
$env:ANDROID_NDK_HOME = 'C:\Android\ndk\26.1.10909125'
$env:EXPO_PUBLIC_API_URL = 'https://api.synapmsg.ai'
$env:EXPO_PUBLIC_WS_URL = 'wss://api.synapmsg.ai/ws'
$env:EXPO_PUBLIC_AUTO_LOGIN = '1'
$env:EXPO_PUBLIC_AUTO_EMAIL = $env:SYNAP_QA_EMAIL
$env:EXPO_PUBLIC_AUTO_PASSWORD = $env:SYNAP_QA_PASSWORD
$env:EXPO_PUBLIC_ENCLAVE_STRICT = '0'
$env:EXPO_PUBLIC_QA_DISABLE_LOCK = '1'
$env:PATH = "$env:JAVA_HOME\bin;C:\Android\platform-tools;$env:PATH"

$buildRoot = 'C:\build\synapmsg-qa'
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
EXPO_PUBLIC_AUTO_LOGIN=1
EXPO_PUBLIC_AUTO_EMAIL=$($env:SYNAP_QA_EMAIL)
EXPO_PUBLIC_AUTO_PASSWORD=$($env:SYNAP_QA_PASSWORD)
EXPO_PUBLIC_ENCLAVE_STRICT=0
EXPO_PUBLIC_QA_DISABLE_LOCK=1
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
$apk = Get-ChildItem 'android\app\build\outputs\apk\release\*.apk' | Select-Object -First 1
if (-not $apk) { throw 'APK not found' }
Write-Host "QA APK: $($apk.FullName)"
adb devices | ForEach-Object {
  if ($_ -match '^(\S+)\s+device') {
    adb -s $Matches[1] install -r $apk.FullName
  }
}

#!/bin/bash
# Android AAB 打包（需要 Android SDK）
# 用法：./store/upload-android.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${ANDROID_SDK_ROOT:-}" ] && [ -z "${ANDROID_HOME:-}" ]; then
  echo "未设置 ANDROID_SDK_ROOT：请先安装 Android Studio 或 SDK 命令行工具"
  exit 1
fi
node node_modules/@capacitor/cli/bin/capacitor sync android
cd android
./gradlew bundleRelease
echo "AAB: android/app/build/outputs/bundle/release/app-release.aab"
echo "首次签名需要：keytool -genkey -v -keystore lizzread.keystore -alias lizzread -keyalg RSA -keysize 2048 -validity 10000"

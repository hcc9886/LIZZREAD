#!/bin/bash
# 一键构建 LIZZREAD 安装包（网页 + Android APK + iOS 工程）
set -e
cd "$(dirname "$0")"
echo "== 1/4 同步网页到 www/ ==="
rsync -a --delete \
  --exclude node_modules --exclude android --exclude ios --exclude .git \
  --exclude .trae-html-share-packages --exclude extension --exclude scripts \
  --exclude .screenshots --exclude www --exclude ".backup" \
  --exclude redemptions.json --exclude "*.part-*" --exclude .DS_Store ./ www/
echo "== 2/4 Capacitor sync android =="
node node_modules/@capacitor/cli/bin/capacitor sync android
echo "== 3/4 Gradle 构建 APK =="
if [ -n "$ANDROID_SDK_ROOT" ] || [ -n "$ANDROID_HOME" ]; then
  (cd android && ./gradlew assembleDebug)
  echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
else
  echo "未检测到 Android SDK。请先安装 Android Studio，或设置 ANDROID_SDK_ROOT 后重跑本脚本。"
  echo "工程已就绪：android/（用 Android Studio 打开即可构建）"
fi
echo "== 4/4 完成：iOS 工程在 ios/，需在 Mac 上用 Xcode 打开 =="

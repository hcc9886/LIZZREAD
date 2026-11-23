#!/bin/bash
# 一键构建 LIZZREAD 安装包（网页 + Android APK + iOS 工程）
# 本机已内置：Android SDK(.sdk/) + JDK21(.sdk/amazon-corretto-21.jdk) + Gradle 8.10.2(.sdk/gradle-8.10.2)
set -e
cd "$(dirname "$0")"

echo "== 1/4 同步网页到 www/ =="
rsync -a --delete \
  --exclude node_modules --exclude android --exclude ios --exclude .git \
  --exclude .trae-html-share-packages --exclude extension --exclude scripts \
  --exclude .screenshots --exclude www --exclude ".backup" --exclude ".sdk" --exclude "dist" --exclude "*.original" \
  --exclude redemptions.json --exclude "*.part-*" --exclude .DS_Store ./ www/

echo "== 2/4 Capacitor sync android =="
node node_modules/@capacitor/cli/bin/capacitor sync android

echo "== 3/4 Gradle 构建 APK =="
SDK="$(pwd)/.sdk"
if [ -d "$SDK/platforms/android-34" ]; then
  export JAVA_HOME="$SDK/amazon-corretto-21.jdk/Contents/Home"
  export ANDROID_HOME="$SDK"
  export ANDROID_SDK_ROOT="$SDK"
  export ANDROID_USER_HOME="$SDK/android-home"
  export GRADLE_USER_HOME="$SDK/gradle-user-home"
  export PATH="$SDK/gradle-8.10.2/bin:$PATH"
  ( cd android && /usr/bin/arch -x86_64 gradle --no-daemon --console=plain assembleDebug )
  echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
  ( cd android && /usr/bin/arch -x86_64 gradle --no-daemon --console=plain bundleRelease ) || echo "AAB（正式包）需要签名密钥，见 store/README-AppStore.md"
elif [ -n "$ANDROID_SDK_ROOT" ] || [ -n "$ANDROID_HOME" ]; then
  (cd android && ./gradlew assembleDebug)
  echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
else
  echo "未检测到 Android SDK。请先安装 Android Studio，或设置 ANDROID_SDK_ROOT 后重跑本脚本。"
  echo "工程已就绪：android/（用 Android Studio 打开即可构建）"
fi
echo "== 4/4 完成：iOS 工程在 ios/，需在 Mac 上用 Xcode 打开（store/upload-ios.sh） =="

echo "== 5/5 版本号 =="
APPVER="${APPVER:-2.0.0}"
BUILDNUM="${BUILDNUM:-$(date +%Y%m%d%H)}"
echo "版本 $APPVER ($BUILDNUM)  — iOS 用 xcodebuild MARKETING_VERSION=$APPVER CURRENT_PROJECT_VERSION=$BUILDNUM"
echo "  Android 已写入 android/app/build.gradle（versionName/versionCode）"

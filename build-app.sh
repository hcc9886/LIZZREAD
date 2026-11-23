#!/bin/bash
# 一键构建 LIZZREAD 安装包（网页 + Android APK + iOS 工程）
# 本机已内置：Android SDK(.sdk/) + JDK21(.sdk/amazon-corretto-21.jdk) + Gradle 8.10.2(.sdk/gradle-8.10.2)
set -e
cd "$(dirname "$0")"

echo "== 1/4 同步网页到 www/ =="
rm -rf ./www
mkdir -p ./www
rsync -a --delete \
  --exclude node_modules --exclude android --exclude ios --exclude .git \
  --exclude .github --exclude store --exclude .sdk --exclude dist --exclude .backup \
  --exclude scripts --exclude .screenshots --exclude extension --exclude .trae-html-share-packages \
  --exclude covers --exclude covers-pick --exclude covers-app --exclude www \
  --exclude 'PUSH-COMMAND.md' --exclude 'README.md' --exclude 'codemagic.yaml' \
  --exclude 'capacitor.config.json' --exclude 'package*.json' --exclude 'build*' \
  --exclude 'server.js' --exclude 'start.*' --exclude 'redemptions.json' --exclude 'download' --exclude 'dist-web' --exclude 'Dockerfile' --exclude '.dockerignore' --exclude 'render.yaml' --exclude 'fly.toml' \
  --exclude '*.part-*' --exclude '*.original' --exclude '.DS_Store' \
  ./ www/

echo "== 1.5 精简封面（APK 只带热门书封面，其余走网络） =="
if [ -d covers ]; then
  node scripts/pack-covers.js >/dev/null
  mkdir -p covers-app
  rsync -a --delete covers-pick/ covers-app/
  cp covers/index.js covers-app/index.js    # 清单仍为全量（App 内缺失的走镜像）
fi

# 精简封面作为 www/covers 发布
mkdir -p www/covers
rsync -a covers-app/ www/covers/

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
  echo "-- 正式签名包（release） --"
  ( cd android && /usr/bin/arch -x86_64 gradle --no-daemon --console=plain assembleRelease bundleRelease )
  echo "APK: android/app/build/outputs/apk/release/app-release.apk"
  echo "AAB: android/app/build/outputs/bundle/release/app-release.aab"
  mkdir -p dist
  cp -f android/app/build/outputs/apk/release/app-release.apk "dist/LIZZREAD-${VER:-2.0.0}-release.apk" 2>/dev/null || true
  cp -f android/app/build/outputs/bundle/release/app-release.aab "dist/LIZZREAD-${VER:-2.0.0}.aab" 2>/dev/null || true
  mkdir -p download
  cp -f android/app/build/outputs/apk/release/app-release.apk download/LIZZREAD.apk 2>/dev/null || true
elif [ -n "$ANDROID_SDK_ROOT" ] || [ -n "$ANDROID_HOME" ]; then
  (cd android && ./gradlew assembleDebug)
  echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
else
  echo "未检测到 Android SDK。请先安装 Android Studio，或设置 ANDROID_SDK_ROOT 后重跑本脚本。"
  echo "工程已就绪：android/（用 Android Studio 打开即可构建）"
fi
echo "== 4/4 完成：iOS 工程在 ios/，需在 Mac 上用 Xcode 打开（store/upload-ios.sh） =="

echo "== 4.5 写入版本信息（App 内「检查更新」与 /api/version 用） =="
VER="${APPVER:-2.0.0}"
BUILD="$(date +%Y-%m-%dT%H:%M:%S%z)"
VER="$VER" BUILD="$BUILD" node -e '
const fs=require("fs");
const ver=process.env.VER||"2.0.0", build=process.env.BUILD||"";
const f="data/app-version.json";
let j={}; try{ j=JSON.parse(fs.readFileSync(f,"utf8")); }catch(e){}
j.latest=ver; j.build=build; if(!j.min) j.min=ver;
fs.writeFileSync(f, JSON.stringify(j,null,2));
fs.mkdirSync("www/data",{recursive:true});
fs.writeFileSync("data/app-version.js", "window.LZ_BUILD="+JSON.stringify({version:ver,build:build})+";\n");
fs.writeFileSync("www/data/app-version.js", "window.LZ_BUILD="+JSON.stringify({version:ver,build:build})+";\n");
fs.copyFileSync(f, "www/data/app-version.json");
console.log("版本写入:", ver, build);
'

echo "== 5/5 版本号 =="
APPVER="${APPVER:-2.0.0}"
BUILDNUM="${BUILDNUM:-$(date +%Y%m%d%H)}"
echo "版本 $APPVER ($BUILDNUM)  — iOS 用 xcodebuild MARKETING_VERSION=$APPVER CURRENT_PROJECT_VERSION=$BUILDNUM"
echo "  Android 已写入 android/app/build.gradle（versionName/versionCode）"

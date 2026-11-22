#!/bin/bash
# iOS 打包上传（需要在完整 Xcode 环境运行）
# 用法：ASC_KEY_ID=xxx ASC_ISSUER_ID=yyy ./store/upload-ios.sh [TeamID]
set -euo pipefail
cd "$(dirname "$0")/.."
TEAM="${1:-YOUR_TEAM_ID}"
mkdir -p build

echo "== 1/4 同步网页资源 =="
node node_modules/@capacitor/cli/bin/capacitor sync ios

echo "== 2/4 归档 =="
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -configuration Release -destination generic/platform=iOS \
  -archivePath build/LIZZREAD.xcarchive \
  DEVELOPMENT_TEAM="$TEAM" -allowProvisioningUpdates archive

echo "== 3/4 导出 =="
sed "s/YOUR_TEAM_ID/$TEAM/" store/ExportOptions.plist > build/ExportOptions.plist
xcodebuild -exportArchive -archivePath build/LIZZREAD.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist -exportPath build/ -allowProvisioningUpdates

echo "== 4/4 上传 App Store Connect =="
IPA=$(ls build/*.ipa | head -1)
if [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ]; then
  xcrun altool --upload-app -f "$IPA" --type ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
else
  echo "已生成 $IPA ；请用 Transporter.app 上传，或设置 ASC_KEY_ID / ASC_ISSUER_ID 后重跑本脚本"
fi

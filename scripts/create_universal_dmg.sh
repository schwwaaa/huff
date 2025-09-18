VOL_NAME="huff-v2"
OUT="artifacts"
STAGE="$OUT/dmg-stage"
UNI_APP="$OUT/universal-app/huff-v2.app"
DMG="$OUT/huff-v2-universal.dmg"

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$UNI_APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

hdiutil create -volname "$VOL_NAME" \
  -srcfolder "$STAGE" \
  -ov -format UDZO "$DMG"

echo "DMG created at: $DMG"

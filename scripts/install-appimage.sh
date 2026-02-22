#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Aether"
APP_ID="aether"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

APPIMAGE_DIR="${HOME}/.local/appimages"
DESKTOP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/512x512/apps"
BIN_DIR="${HOME}/.local/bin"

APPIMAGE_DEST="${APPIMAGE_DIR}/${APP_ID}.AppImage"
DESKTOP_FILE="${DESKTOP_DIR}/${APP_ID}.desktop"
ICON_SOURCE="${REPO_ROOT}/assets/icon.png"
ICON_DEST="${ICON_DIR}/${APP_ID}.png"
BIN_LINK="${BIN_DIR}/${APP_ID}"

find_default_appimage() {
  local candidates=()

  shopt -s nullglob
  candidates+=("${REPO_ROOT}"/out/make/AppImage/*/*.AppImage)
  candidates+=("${REPO_ROOT}"/out/make/AppImage/*.AppImage)
  shopt -u nullglob

  if [ "${#candidates[@]}" -eq 0 ]; then
    return 1
  fi

  ls -1t "${candidates[@]}" | head -n 1
}

APPIMAGE_SOURCE="${1:-}"

if [ -z "${APPIMAGE_SOURCE}" ]; then
  if ! APPIMAGE_SOURCE="$(find_default_appimage)"; then
    echo "No AppImage found. Build one first with: npm run make" >&2
    echo "Or pass a path manually: ./scripts/install-appimage.sh /path/to/Aether.AppImage" >&2
    exit 1
  fi
fi

if [ ! -f "${APPIMAGE_SOURCE}" ]; then
  echo "AppImage not found: ${APPIMAGE_SOURCE}" >&2
  exit 1
fi

mkdir -p "${APPIMAGE_DIR}" "${DESKTOP_DIR}" "${ICON_DIR}" "${BIN_DIR}"

install -m 755 "${APPIMAGE_SOURCE}" "${APPIMAGE_DEST}"
ln -sfn "${APPIMAGE_DEST}" "${BIN_LINK}"

if [ -f "${ICON_SOURCE}" ]; then
  install -m 644 "${ICON_SOURCE}" "${ICON_DEST}"
else
  echo "Warning: icon not found at ${ICON_SOURCE}. Desktop icon may not display correctly." >&2
fi

cat > "${DESKTOP_FILE}" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=${APP_NAME}
Comment=Modern file transfer app for AWS S3 and SFTP
Exec=${APPIMAGE_DEST} %U
Icon=${ICON_DEST}
Terminal=false
Categories=Network;FileTransfer;Utility;
StartupNotify=true
StartupWMClass=${APP_NAME}
X-AppImage-Integrate=false
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${DESKTOP_DIR}" >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t "${HOME}/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

echo "Installed ${APP_NAME} AppImage:"
echo "  AppImage: ${APPIMAGE_DEST}"
echo "  Desktop:  ${DESKTOP_FILE}"
echo "  Icon:     ${ICON_DEST}"
echo
echo "If your launcher still does not show the icon, log out/in or run:"
echo "  gio set \"${DESKTOP_FILE}\" metadata::trusted true 2>/dev/null || true"

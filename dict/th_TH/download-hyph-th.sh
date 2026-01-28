#!/bin/bash
# ดาวน์โหลดไฟล์ hyphenation ภาษาไทย เต็มจาก LibreOffice
# รันจากโฟลเดอร์ only-office/dict/th_TH/ หรือจาก repo root

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
URL="https://raw.githubusercontent.com/LibreOffice/dictionaries/master/th_TH/hyph_th_TH.dic"
echo "Downloading $URL ..."
curl -sL -o hyph_th_TH.dic "$URL"
echo "Saved to $(pwd)/hyph_th_TH.dic ($(wc -l < hyph_th_TH.dic) lines)"
echo "Restart OnlyOffice container to apply."

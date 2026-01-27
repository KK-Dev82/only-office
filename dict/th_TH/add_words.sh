#!/bin/bash
# Script สำหรับเพิ่มคำเข้า th_TH.dic
# Usage: ./add_words.sh word1 word2 word3 ...
# หรือ: echo "word1\nword2" | ./add_words.sh

DIC_FILE="th_TH.dic"
TEMP_FILE=$(mktemp)

if [ ! -f "$DIC_FILE" ]; then
  echo "Error: $DIC_FILE not found" >&2
  exit 1
fi

# อ่านคำจาก arguments หรือ stdin
if [ $# -gt 0 ]; then
  WORDS="$@"
else
  WORDS=$(cat)
fi

# อ่านจำนวนคำปัจจุบัน (บรรทัดแรก)
CURRENT_COUNT=$(head -n 1 "$DIC_FILE")
if ! [[ "$CURRENT_COUNT" =~ ^[0-9]+$ ]]; then
  echo "Error: Invalid dictionary format (first line should be word count)" >&2
  exit 1
fi

# เก็บคำที่มีอยู่แล้ว (skip บรรทัดแรก)
EXISTING_WORDS=$(tail -n +2 "$DIC_FILE")

# เพิ่มคำใหม่ (กรองคำที่ซ้ำ)
NEW_WORDS=""
ADDED_COUNT=0
for word in $WORDS; do
  # ตรวจสอบว่ามีคำนี้อยู่แล้วหรือไม่ (case-insensitive)
  if ! echo "$EXISTING_WORDS" | grep -qi "^${word}$"; then
    NEW_WORDS="${NEW_WORDS}${word}\n"
    ADDED_COUNT=$((ADDED_COUNT + 1))
    echo "Added: $word"
  else
    echo "Skipped (already exists): $word"
  fi
done

if [ $ADDED_COUNT -eq 0 ]; then
  echo "No new words to add"
  exit 0
fi

# คำนวณจำนวนคำใหม่
NEW_COUNT=$((CURRENT_COUNT + ADDED_COUNT))

# สร้างไฟล์ใหม่
echo "$NEW_COUNT" > "$TEMP_FILE"
echo -e "$EXISTING_WORDS" >> "$TEMP_FILE"
echo -e -n "$NEW_WORDS" >> "$TEMP_FILE"

# เรียงคำตามตัวอักษร (skip บรรทัดแรก)
head -n 1 "$TEMP_FILE" > "$DIC_FILE"
tail -n +2 "$TEMP_FILE" | sort -u >> "$DIC_FILE"

# อัปเดตจำนวนคำให้ถูกต้อง
ACTUAL_COUNT=$(tail -n +2 "$DIC_FILE" | wc -l | tr -d ' ')
sed -i "1s/.*/$ACTUAL_COUNT/" "$DIC_FILE"

rm -f "$TEMP_FILE"

echo "Done! Added $ADDED_COUNT word(s). Total words: $ACTUAL_COUNT"

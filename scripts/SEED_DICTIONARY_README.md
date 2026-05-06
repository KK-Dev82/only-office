# Bulk Seed Dictionary

Bulk import คำเข้า Spellcheck Dictionary (Global scope) ผ่าน backend API

## สิ่งที่ทำ

ใช้ endpoint `POST /api/word-management/spellcheck/add-words` (refactored ให้ persist DB) เพื่อ:

- Persist คำเข้า `WordEntry` + `DictionaryWord` (Type=Dictionary, Scope=Global)
- Auto-detect language ต่อคำ (มีอักษรไทย → `thai`, มีแต่ Latin → `english`)
- Skip duplicates (return ใน `skipped[]`)
- Sync ไป PyThaiNLP สำหรับคำใหม่

## วิธีใช้

### 1. Dry-run ก่อน (แนะนำ)

```bash
cd only-office/scripts
node seed-dictionary.js \
  --server http://localhost:5000 \
  --file seed-words.json \
  --dry-run
```

แสดงรายการคำที่จะส่ง — ไม่ POST จริง

### 2. Run จริง

```bash
node seed-dictionary.js \
  --server http://localhost:5000 \
  --file seed-words.json
```

ส่งเป็น batch (ค่าเริ่มต้น 200 คำต่อ request) แล้ว print:

```
=== Summary ===
Requested:  99
Added:      87
Skipped:    12  (already in dict)
Failed:     0

--- Added (first 30) ---
  + กกต [thai]
  + DSI [english]
  ...

--- Skipped (already exist) ---
  = ตำแหน่ง [thai]
  ...
```

### 3. ปรับ batch size

```bash
node seed-dictionary.js --server <url> --file <words.json> --batch 50
```

ลด batch size ถ้า server timeout บ่อย หรือเพิ่มถ้าต้องการเร็ว

## Format ของ seed-words.json

### แบบ grouped (แนะนำ — comment-friendly)

```json
{
  "groups": [
    {
      "name": "ตัวย่อหน่วยงาน",
      "words": ["กกต", "คสช", "สส"]
    },
    {
      "name": "ชื่อบุคคล",
      "words": ["ภิญญดา", "ปัณณิตา"]
    }
  ]
}
```

### แบบ flat array

```json
["กกต", "คสช", "DSI", "OWASP"]
```

### หรือ object แบบเรียบ

```json
{
  "words": ["กกต", "คสช"]
}
```

Script จะ flatten + dedupe (case-insensitive) อัตโนมัติ

## Backend behavior — สำคัญ

### ✅ จะไม่กระทบข้อมูล M0106 ที่มีอยู่

- ใช้ `DictionaryWordExistsAsync` check ก่อน insert
- ถ้าคำมีอยู่ใน Global scope แล้ว → return ใน `skipped[]`
- **ไม่ overwrite** Phonetic / EnglishWord / FullWord / Variants ที่ M0106 ใส่ไว้
- Personal scope ของ user ไม่ถูกแตะ

### Auto-detect language

| Input | Detected | หมายเหตุ |
|---|---|---|
| `"ภิญญดา"` | `thai` | มีอักษรไทย |
| `"DSI"` | `english` | Latin only |
| `"คอมพิวเตอร์"` | `thai` | TH+Latin → primary thai |
| `"123"` | `thai` | fallback |

ถ้าต้องการ force ให้ส่ง `language: "thai"` หรือ `"english"` ใน request body

### Response shape

```json
{
  "requestedCount": 99,
  "addedCount": 87,
  "skippedCount": 12,
  "failedCount": 0,
  "added": [
    { "word": "กกต", "language": "thai" }
  ],
  "skipped": [
    { "word": "ตำแหน่ง", "language": "thai", "reason": "already_exists" }
  ],
  "failed": []
}
```

## Workflow แนะนำสำหรับ deploy production

1. **Backup DB ก่อน** (safety net):
   ```bash
   ./postgresSQL/scripts/backup-selective.sh
   ```
2. **Dry-run บน staging**:
   ```bash
   node seed-dictionary.js --server https://staging.example.com --file seed-words.json --dry-run
   ```
3. **Run บน staging**:
   ```bash
   node seed-dictionary.js --server https://staging.example.com --file seed-words.json
   ```
4. **Verify** ผ่าน M0106 UI หรือ plugin v2 ว่าคำใหม่อยู่ใน dict
5. **Run บน production**:
   ```bash
   node seed-dictionary.js --server https://senate.example.com --file seed-words.json
   ```

## ตัวอย่างการขยาย seed-words.json

เมื่อพบ MISS list ใหม่ใน plugin console:

1. Filter `[SpellCheckTHEN-V2][Check] MISS` ใน DevTools
2. Copy คำที่ควร whitelist (proper noun + ตัวย่อ + ทับศัพท์)
3. เพิ่มใน group ที่เหมาะสม (สร้าง group ใหม่ได้)
4. Run `--dry-run` → verify
5. Run จริง

## Exit codes

- `0` — ทุก batch สำเร็จ (มี added หรือ skipped เท่านั้น)
- `1` — File error / parsing error
- `2` — Some words failed to insert (ดูใน `--- Failed ---` section)

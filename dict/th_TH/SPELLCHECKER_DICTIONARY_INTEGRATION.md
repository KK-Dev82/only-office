# การผสาน SpellChecker + Dictionary จาก Database

## ภาพรวม

ระบบนี้จะผสาน **SpellChecker** (คำตามไวยากรณ์) กับ **Dictionary** (คำเฉพาะ) จาก Database เข้ากับ OnlyOffice DocumentEditor

## สถาปัตยกรรม

```
┌─────────────────────────────────────────────────────────┐
│  OnlyOffice DocumentEditor                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │  SpellChecker (Hunspell)                         │  │
│  │  - th_TH.dic (base dictionary)                   │  │
│  │  - th_TH.aff (affix rules)                       │  │
│  │  └─ Custom words จาก Database (sync)             │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Dictionary Plugin (M0106)                       │  │
│  │  - คำเฉพาะ (Custom words)                       │  │
│  │  - API: /api/word-management/dictionary          │  │
│  │  - CRUD: Add, Edit, Remove                      │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                    ↕ API Sync
┌─────────────────────────────────────────────────────────┐
│  Backend Database (PostgreSQL)                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  DictionaryWords Table                           │  │
│  │  - id, word, language, scope, ownerUserId        │  │
│  │  - description, variants, createdAt, updatedAt   │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## การทำงาน

### 1. Dictionary (คำเฉพาะ) - M0106
- **ที่มา**: Database (`api/word-management/dictionary`)
- **การใช้งาน**: ใช้ใน Dictionary Plugin สำหรับค้นหาและแสดงคำเฉพาะ
- **CRUD**: Add, Edit, Remove ผ่าน M0106 UI
- **Scope**: Global หรือ Personal

### 2. SpellChecker (คำตามไวยากรณ์)
- **ที่มา**: 
  - Base: `th_TH.dic` + `th_TH.aff` (Hunspell format)
  - Custom: คำจาก Database (sync เข้า `th_TH.dic`)
- **การใช้งาน**: OnlyOffice SpellChecker ใช้ตรวจสอบการสะกดคำ
- **Sync**: คำจาก Database จะถูก sync เข้า `th_TH.dic` อัตโนมัติ

## API Endpoints

### 1. Get Dictionary Words (มีอยู่แล้ว)
```
GET /api/word-management/dictionary
Query Params:
  - scope: "Global" | "Personal"
  - includeGlobal: boolean
  - keyword: string (search)
  - offset: number
  - limit: number
```

### 2. Add Dictionary Word (มีอยู่แล้ว)
```
POST /api/word-management/dictionary
Body:
{
  "word": "คำใหม่",
  "language": "thai" | "english",
  "scope": "Global" | "Personal",
  "ownerUserId": number | null,
  "description": string | null,
  "variants": []
}
```

### 3. Update Dictionary Word (มีอยู่แล้ว)
```
PUT /api/word-management/dictionary/{id}
Body: (same as POST)
```

### 4. Delete Dictionary Word (มีอยู่แล้ว)
```
DELETE /api/word-management/dictionary/{id}
```

### 5. Sync Words to SpellChecker (ใหม่ - ต้องสร้าง)
```
POST /api/word-management/dictionary/sync-spellchecker
Body:
{
  "language": "thai" | "english",
  "words": ["คำ1", "คำ2", ...] // optional: ถ้าไม่ส่งจะ sync ทั้งหมด
}
Response:
{
  "success": true,
  "syncedCount": 10,
  "message": "Synced 10 words to th_TH.dic"
}
```

## การ Sync คำจาก Database เข้า SpellChecker

### วิธีที่ 1: Sync แบบ Manual (แนะนำสำหรับเริ่มต้น)
1. User เพิ่มคำใน M0106 Dictionary
2. User กดปุ่ม "Sync to SpellChecker" ใน M0106
3. Backend ดึงคำจาก Database (scope: Global, language: thai)
4. Backend อัปเดต `th_TH.dic` โดยเพิ่มคำใหม่
5. Backend restart DocumentServer หรือ reload dictionary

### วิธีที่ 2: Sync แบบอัตโนมัติ (สำหรับ production)
1. User เพิ่ม/แก้ไข/ลบคำใน M0106 Dictionary
2. Backend trigger sync อัตโนมัติ
3. Background job อัปเดต `th_TH.dic`
4. DocumentServer reload dictionary (ไม่ต้อง restart)

## Implementation Plan

### Phase 1: Backend API
1. ✅ Dictionary CRUD API (มีอยู่แล้ว)
2. ⏳ Sync API endpoint (`/api/word-management/dictionary/sync-spellchecker`)
3. ⏳ Service สำหรับอัปเดต `th_TH.dic` file
4. ⏳ Background job สำหรับ auto-sync (optional)

### Phase 2: Frontend Integration
1. ✅ M0106 Dictionary UI (มีอยู่แล้ว)
2. ⏳ ปุ่ม "Sync to SpellChecker" ใน M0106
3. ⏳ แสดงสถานะ sync (last sync time, synced count)
4. ⏳ Auto-sync notification (เมื่อมีคำใหม่)

### Phase 3: DocumentServer Integration
1. ✅ Custom dictionary mount (`/opt/kk-dict-src` → `/var/www/onlyoffice/documentserver/dictionaries/th_TH`)
2. ⏳ Script สำหรับอัปเดต `th_TH.dic` จาก Database
3. ⏳ Dictionary reload mechanism (ไม่ต้อง restart DocumentServer)

## ไฟล์ที่ต้องแก้ไข

### Backend
- `src/Shorthand.Api/Controllers/WordManagementController.cs` (เพิ่ม sync endpoint)
- `src/Shorthand.Infrastructure/Services/DictionarySyncService.cs` (ใหม่ - service สำหรับ sync)

### Frontend
- `senate-vite/src/pages/M/M0106/index.tsx` (เพิ่มปุ่ม sync)
- `senate-vite/src/components/DocumentOffice/DocumentOffice.tsx` (อาจต้องอัปเดต)

### Docker/Infrastructure
- `file-service/FileService/docker-compose.staging.yml` (อาจต้องเพิ่ม volume สำหรับ sync)
- `only-office/compose/community.docker-compose.yml` (อาจต้องเพิ่ม sync script)

## ตัวอย่างการใช้งาน

### 1. เพิ่มคำใน Dictionary (M0106)
```typescript
// User เพิ่มคำ "วุฒิสภา" ใน M0106
const response = await http.post("api/word-management/dictionary", {
  word: "วุฒิสภา",
  language: "thai",
  scope: "Global",
  description: "สภาสูงของประเทศไทย"
});
```

### 2. Sync คำเข้า SpellChecker
```typescript
// User กดปุ่ม "Sync to SpellChecker"
const syncResponse = await http.post("api/word-management/dictionary/sync-spellchecker", {
  language: "thai"
});
// Response: { success: true, syncedCount: 1, message: "Synced 1 words to th_TH.dic" }
```

### 3. ใช้ใน OnlyOffice
- SpellChecker จะตรวจสอบคำ "วุฒิสภา" ว่าเขียนถูกต้อง
- Dictionary Plugin จะแสดงคำ "วุฒิสภา" พร้อมคำอธิบาย

## หมายเหตุ

1. **Dictionary vs SpellChecker**:
   - Dictionary = คำเฉพาะ (custom words) สำหรับค้นหาและแสดงคำอธิบาย
   - SpellChecker = คำตามไวยากรณ์ (grammar-based) สำหรับตรวจสอบการสะกด

2. **Sync Frequency**:
   - Manual sync: เมื่อ user กดปุ่ม
   - Auto sync: ทุกครั้งที่มีการเพิ่ม/แก้ไข/ลบคำ (optional)

3. **Performance**:
   - Sync ควรทำแบบ batch (ไม่ sync ทีละคำ)
   - Cache dictionary file เพื่อลด I/O

4. **Security**:
   - ตรวจสอบ permission ก่อน sync (เฉพาะ admin หรือ owner)
   - Validate words ก่อนเพิ่มเข้า dictionary file

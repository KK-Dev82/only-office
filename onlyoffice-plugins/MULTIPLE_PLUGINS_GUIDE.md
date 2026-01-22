# คู่มือการใช้งาน Multiple Plugins ใน OnlyOffice

## ภาพรวม

ตอนนี้รองรับ 2 แบบ:

1. **Plugin เดียว (Default)**: `document-office` plugin ที่มี SpeechToText feature รวมอยู่แล้ว
2. **2 Plugins แยกกัน**: `document-office` + `speech-to-text` (แยกเป็น plugin ต่างหาก)

## วิธีใช้งาน

### แบบที่ 1: Plugin เดียว (Default - แนะนำ)

```tsx
<DocumentOffice
  documentServerUrl="http://143.198.77.135:8082"
  documentUrl="http://143.198.77.135/example/files/sample.docx"
  fileType="docx"
  documentKey="doc-123"
  title="เอกสารทดสอบ"
  pluginAssetsBaseUrl="http://143.198.77.135"
  // enableSpeechToTextPlugin={false} // default: false
/>
```

**ข้อดี:**
- ง่ายต่อการจัดการ (plugin เดียว)
- SpeechToText อยู่ใน tab เดียวกับ Clipboard, Dictionary
- ไม่ต้อง configure หลาย plugins

### แบบที่ 2: 2 Plugins แยกกัน

```tsx
<DocumentOffice
  documentServerUrl="http://143.198.77.135:8082"
  documentUrl="http://143.198.77.135/example/files/sample.docx"
  fileType="docx"
  documentKey="doc-123"
  title="เอกสารทดสอบ"
  pluginAssetsBaseUrl="http://143.198.77.135"
  enableSpeechToTextPlugin={true} // เปิดใช้งาน SpeechToText plugin แยก
/>
```

**ข้อดี:**
- แยกความรับผิดชอบ (separation of concerns)
- SpeechToText plugin เป็น panel แยก (ไม่ใช่ tab)
- ง่ายต่อการ maintain แยกกัน

## โครงสร้าง Plugins

### Plugin 1: DocumentOffice
- **GUID**: `asc.{C6A86F5A-5A0F-49F8-9E72-9E8E1E2F86A1}`
- **Path**: `/onlyoffice-plugins/document-office/config.json`
- **Features**: Clipboard, Dictionary, SpeechToText (tab), Macros, Abbreviation, RedundantWord

### Plugin 2: SpeechToText (เมื่อ enableSpeechToTextPlugin=true)
- **GUID**: `asc.{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}`
- **Path**: `/onlyoffice-plugins/speech-to-text/config.json`
- **Features**: Speech Recognition (panel แยก)

## การ Deploy

### สำหรับ Plugin เดียว (Default)
```
/onlyoffice-plugins/document-office/
├── config.json
├── index.html
├── styles.css
├── core/
├── features/
│   ├── clipboard.js
│   ├── dictionary.js
│   ├── speechtotext.js  ← รวมอยู่แล้ว
│   └── ...
└── ...
```

### สำหรับ 2 Plugins
```
/onlyoffice-plugins/
├── document-office/
│   ├── config.json
│   ├── index.html
│   └── ...
└── speech-to-text/
    ├── config.json
    ├── index.html
    ├── core.js
    ├── speech-recognition.js
    └── ...
```

## หมายเหตุ

- **Community License**: ทั้ง 2 แบบใช้ `callCommand` ภายใน plugin ซึ่งควรทำงานได้
- **SpeechToText Feature**: ถ้าใช้ plugin เดียว SpeechToText จะเป็น tab ใน document-office plugin
- **SpeechToText Plugin**: ถ้าใช้ 2 plugins SpeechToText จะเป็น panel แยก (เปิดจากเมนู Plugins)

## การเลือกใช้

- **ใช้ Plugin เดียว**: เมื่อต้องการความเรียบง่าย และ SpeechToText เป็น feature หนึ่งในหลายๆ features
- **ใช้ 2 Plugins**: เมื่อต้องการแยก SpeechToText ออกมาเป็น plugin อิสระ หรือต้องการให้เป็น panel แยก

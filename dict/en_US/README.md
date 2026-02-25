# Hunspell English (en_US) Dictionary

Dictionary ภาษาอังกฤษ (American English) จาก LibreOffice Dictionaries

## แหล่งที่มา

- **Repository**: [LibreOffice/dictionaries](https://github.com/LibreOffice/dictionaries)
- **License**: MPL 2.0 / LGPL 3.0

## ไฟล์

- `en_US.aff` - Affix rules
- `en_US.dic` - Word list (~49,500 คำ)

## การใช้งานกับ OnlyOffice

1. Mount โฟลเดอร์ `dict/en_US` เข้า DocumentServer (เช่น `/var/www/onlyoffice/documentserver/dictionaries/en_US`)
2. OnlyOffice จะใช้ Hunspell spellcheck อัตโนมัติเมื่อเปิดเอกสารที่ตั้งภาษาอังกฤษ

## การอัปเดต

```bash
curl -sL "https://raw.githubusercontent.com/LibreOffice/dictionaries/master/en/en_US.aff" -o en_US.aff
curl -sL "https://raw.githubusercontent.com/LibreOffice/dictionaries/master/en/en_US.dic" -o en_US.dic
```

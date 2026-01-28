# พจนานุกรมแยกคำ (Hyphenation) ภาษาไทย

OnlyOffice ใช้ไฟล์ `hyph_th_TH.dic` สำหรับการแยกคำเมื่อขึ้นบรรทัดใหม่ (word wrap)

## ไฟล์เต็มจาก LibreOffice

ไฟล์เต็มมี pattern การแยกคำหลายพันบรรทัด จาก LibreOffice:

- **URL**: https://raw.githubusercontent.com/LibreOffice/dictionaries/master/th_TH/hyph_th_TH.dic
- **วิธีดาวน์โหลด**: รันจากโฟลเดอร์ `only-office/dict/th_TH/`:
  ```bash
  curl -sL -o hyph_th_TH.dic "https://raw.githubusercontent.com/LibreOffice/dictionaries/master/th_TH/hyph_th_TH.dic"
  ```
- หลังดาวน์โหลด ให้ restart OnlyOffice container เพื่อให้ init script copy ไฟล์เข้าไป

## รูปแบบไฟล์

- บรรทัดแรก: `UTF-8` (encoding)
- บรรทัดถัดไป: pattern การแยกคำ (ตัวเลขคือจุดที่อนุญาตให้แยก)

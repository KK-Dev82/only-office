# วิธีเพิ่มคำเข้า Thai Dictionary (th_TH.dic)

## วิธีที่ 1: ใช้ Script (แนะนำ)

```bash
cd /path/to/only-office/dict/th_TH
./add_words.sh คำ1 คำ2 คำ3
```

หรือเพิ่มจากไฟล์:
```bash
echo -e "คำ1\nคำ2\nคำ3" | ./add_words.sh
```

## วิธีที่ 2: แก้ไขด้วยมือ

1. เปิดไฟล์ `th_TH.dic` ด้วย text editor ที่รองรับ UTF-8
2. เพิ่มคำใหม่ที่ท้ายไฟล์ (หนึ่งคำต่อหนึ่งบรรทัด)
3. อัปเดตจำนวนคำในบรรทัดแรก (เช่น จาก `51683` เป็น `51684`)
4. เรียงคำตามตัวอักษร (optional แต่แนะนำ)

**ตัวอย่าง:**
```
51684
กก
กกกอด
...
คำใหม่ที่เพิ่ม
```

## หมายเหตุ

- **Encoding**: ไฟล์ใช้ UTF-8 (ดูจาก `SET UTF-8` ใน `th_TH.aff`)
- **Format**: บรรทัดแรกต้องเป็นจำนวนคำ (approximate count)
- **Flags**: คำสามารถมี flags หลัง `/` ได้ (เช่น `คำ/AB`) แต่สำหรับคำไทยส่วนใหญ่ไม่จำเป็น
- **Duplicate**: Script จะตรวจสอบและข้ามคำที่ซ้ำอัตโนมัติ

## ตัวอย่างการใช้งาน

```bash
# เพิ่มคำเดียว
./add_words.sh "วุฒิสภา"

# เพิ่มหลายคำ
./add_words.sh "วุฒิสภา" "สภาผู้แทนราษฎร" "รัฐสภา"

# เพิ่มจากไฟล์
cat words.txt | ./add_words.sh
```

## หลังจากเพิ่มคำ

1. **Local**: Restart DocumentServer container
2. **Production**: 
   - อัปโหลด `th_TH.dic` ใหม่ไปที่ `/home/kscdev/deploy/only-office/dict/th_TH/`
   - Restart container: `docker compose -f /home/kscdev/deploy/docker-compose.yml restart onlyoffice-documentserver`
   - หรือรอให้ script ใน docker-compose copy ใหม่ (ถ้ามี volume mount)

## ตรวจสอบผลลัพธ์

```bash
# ดูจำนวนคำทั้งหมด
wc -l th_TH.dic

# ตรวจสอบว่ามีคำที่ต้องการ
grep -i "คำที่ต้องการ" th_TH.dic
```

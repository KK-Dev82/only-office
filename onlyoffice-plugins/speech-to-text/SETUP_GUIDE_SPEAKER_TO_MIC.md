# คู่มือตั้งค่า Speaker-to-Mic สำหรับ Speech-to-Text Plugin

## ทำไมต้องตั้งค่า Speaker-to-Mic?

Speech-to-Text Plugin ใช้ **Web Speech API** ซึ่งรับเสียงจาก **Microphone** เท่านั้น
หากต้องการถอดเสียงจากลำโพง (เช่น เสียงจากวิดีโอประชุม, ไฟล์เสียง) จำเป็นต้อง **ส่งเสียง Speaker กลับเข้า Mic**
เอกสารนี้อธิบาย 2 วิธี เรียงจากง่ายไปยาก

---

## สารบัญ

- [วิธีที่ 1: Stereo Mix (ลองก่อน)](#วิธีที่-1-stereo-mix-ลองก่อน)
- [วิธีที่ 2: VoiceMeeter Banana](#วิธีที่-2-voicemeeter-banana)
- [ตั้งค่า Microphone ใน Browser](#ตั้งค่า-microphone-ใน-browser)
- [เครื่องที่มีหลาย Audio Devices](#เครื่องที่มีหลาย-audio-devices)
- [Troubleshooting](#troubleshooting)

---

## วิธีที่ 1: Stereo Mix (ลองก่อน)

Stereo Mix เป็นฟีเจอร์ในตัว Windows ที่ส่งเสียง Output กลับเป็น Input ได้โดยไม่ต้องลง software เพิ่ม

> **หมายเหตุ:** ไม่ใช่ทุกเครื่องที่จะมี Stereo Mix ขึ้นอยู่กับ Audio Driver (Realtek มักจะมี)
> ถ้าเครื่องไม่มี Stereo Mix ให้ข้ามไป [วิธีที่ 2](#วิธีที่-2-voicemeeter-banana)

### ขั้นตอนที่ 1: เปิด Sound Control Panel

1. **คลิกขวา** ที่ไอคอนลำโพง (มุมขวาล่างของ Taskbar)
2. เลือก **Sound settings**
3. เลื่อนลงไปคลิก **More sound settings**

หรืออีกวิธี:
- กด `Win + R` พิมพ์ `mmsys.cpl` แล้วกด Enter

### ขั้นตอนที่ 2: เปิดใช้งาน Stereo Mix

1. ไปที่แท็บ **Recording**
2. **คลิกขวา** ในพื้นที่ว่าง → ติ๊กเลือก **Show Disabled Devices**
3. ถ้าเห็น **Stereo Mix** (อาจจะเป็นสีเทาและเขียนว่า Disabled)
   - คลิกขวาที่ **Stereo Mix** → เลือก **Enable**
4. คลิกขวาที่ **Stereo Mix** อีกครั้ง → เลือก **Set as Default Device**

### ขั้นตอนที่ 3: ปรับระดับเสียง

1. ดับเบิลคลิกที่ **Stereo Mix**
2. ไปแท็บ **Levels**
3. ตั้ง Volume ที่ **80-100%**
4. กด **OK**

### ขั้นตอนที่ 4: ทดสอบ

1. เปิดเพลงหรือวิดีโอในเครื่อง
2. กลับไปดูที่ Recording tab
3. ถ้า Stereo Mix มี **แถบสีเขียวกระเพื่อม** ตามจังหวะเสียง = ใช้งานได้

### ข้อจำกัดของ Stereo Mix

- บางเครื่อง/บาง Driver ไม่มี Stereo Mix
- ถ้า Mute ลำโพง เสียงจะไม่ส่งเข้า Stereo Mix
- ไม่สามารถเลือกแยกเสียงจาก App เฉพาะได้

---

## วิธีที่ 2: VoiceMeeter Banana

VoiceMeeter Banana เป็น Virtual Audio Mixer ฟรี ที่สร้าง Virtual Audio Device ให้ Browser เห็นเป็น Microphone
**ใช้ได้กับทุกเครื่อง** ไม่ว่าจะมี Stereo Mix หรือไม่

### ขั้นตอนที่ 1: ดาวน์โหลดและติดตั้ง

1. ไปที่ **https://vb-audio.com/Voicemeeter/banana.htm**
2. คลิก **Download** (ปุ่มสีแดง Install)
3. แตกไฟล์ zip แล้ว **คลิกขวา** ที่ Installer → เลือก **Run as administrator**
4. ทำตามขั้นตอนจนติดตั้งเสร็จ
5. **Restart เครื่อง** (สำคัญมาก ห้ามข้าม)

### ขั้นตอนที่ 2: ตั้งค่า Windows Default Audio

หลัง Restart แล้ว:

1. เปิด **Sound settings** (คลิกขวาไอคอนลำโพง → Sound settings)
2. ตั้ง **Output device** เป็น:
   ```
   VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)
   ```
3. ตั้ง **Input device** เป็น:
   ```
   VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)
   ```

> **สำคัญ:** หลังตั้งค่านี้ เสียงจะยังไม่ออกลำโพง จนกว่าจะตั้งค่า VoiceMeeter ในขั้นตอนถัดไป

### ขั้นตอนที่ 3: ตั้งค่า VoiceMeeter Banana

เปิดโปรแกรม **VoiceMeeter Banana**

#### 3.1 ตั้ง Hardware Output (ลำโพงจริง)

- ที่มุม **ขวาบน** จะเห็น **A1** → คลิก
- เลือกลำโพง/หูฟังจริงของเครื่อง เช่น:
  ```
  WDM: Speakers (Realtek High Definition Audio)
  ```
  หรือ
  ```
  WDM: Headphones (ชื่อหูฟัง)
  ```

> **เลือก WDM เป็นหลัก** เพราะมี latency ต่ำกว่า MME

#### 3.2 ตั้งค่าปุ่ม Routing

ดูที่แถบ **VIRTUAL INPUTS** (ตรงกลาง) จะเห็น:
- **Voicemeeter VAIO** — รับเสียงจาก Windows (เพลง, วิดีโอ, ประชุม)
- **Voicemeeter AUX** — ช่องเสริม

ที่ช่อง **Voicemeeter VAIO**:
- เปิดปุ่ม **A1** (ให้สว่างเป็นสีเขียว) → เสียงจะออกลำโพงจริง
- เปิดปุ่ม **B1** (ให้สว่าง) → เสียงจะส่งไป VoiceMeeter Output (Browser เห็นเป็น Mic)

#### 3.3 แผนภาพการไหลของเสียง

```
เสียงจาก Windows App (วิดีโอ, ประชุม, ไฟล์เสียง)
    │
    ▼
VoiceMeeter Input (Virtual Speaker - Windows เห็นเป็น Output)
    │
    ├── A1 ──► ลำโพง/หูฟังจริง (คุณได้ยินเสียง)
    │
    └── B1 ──► VoiceMeeter Output (Virtual Mic - Browser เห็นเป็น Mic)
                    │
                    ▼
              Web Speech API รับเสียง → ถอดเป็นข้อความ
```

### ขั้นตอนที่ 4: ทดสอบ

1. เปิดเพลงหรือวิดีโอ → ต้อง **ได้ยินเสียงจากลำโพงปกติ**
2. ดูใน VoiceMeeter → แถบ meter ที่ Virtual Input ต้อง **กระเพื่อม**
3. เปิด Browser → ทดสอบกับ Plugin (ดูหัวข้อ [ตั้งค่า Microphone ใน Browser](#ตั้งค่า-microphone-ใน-browser))

### VoiceMeeter: ตั้งค่าเปิดอัตโนมัติตอนเปิดเครื่อง

เพื่อไม่ต้องเปิด VoiceMeeter เองทุกครั้ง:

1. ใน VoiceMeeter → เมนู **Menu** (มุมขวาบน)
2. ติ๊ก **System Tray (Run at Startup)**

---

## ตั้งค่า Microphone ใน Browser

หลังตั้งค่า Stereo Mix หรือ VoiceMeeter แล้ว ต้องเลือก Microphone ที่ถูกต้องใน Browser

### Google Chrome

1. คลิกไอคอน **แม่กุญแจ** (หรือ tune icon) ที่ Address Bar ของหน้า OnlyOffice
2. คลิก **Site settings**
3. ที่ **Microphone** → เลือก:
   - `Stereo Mix` (ถ้าใช้วิธีที่ 1)
   - `VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)` (ถ้าใช้วิธีที่ 2)

หรือตั้งค่า Default:
1. ไปที่ `chrome://settings/content/microphone`
2. เลือก Microphone ที่ต้องการใช้เป็น Default

### Microsoft Edge

1. คลิกไอคอน **แม่กุญแจ** ที่ Address Bar
2. คลิก **Permissions for this site**
3. ที่ **Microphone** → เลือก device ที่ต้องการ

หรือตั้งค่า Default:
1. ไปที่ `edge://settings/content/microphone`
2. เลือก Microphone ที่ต้องการ

---

## เครื่องที่มีหลาย Audio Devices

สำหรับเครื่อง PC เก่า, All-in-One, หรือเครื่องที่ต่อจอ/ลำโพงหลายตัว:

### Checklist ก่อนเริ่มตั้งค่า

1. **สำรวจ Audio Devices ทั้งหมด**
   - เปิด Sound Control Panel (`mmsys.cpl`)
   - แท็บ **Playback**: จดรายชื่อ output devices ทั้งหมด
   - แท็บ **Recording**: จดรายชื่อ input devices ทั้งหมด

2. **ปิด Device ที่ไม่ใช้**
   - คลิกขวาที่ device ที่ไม่ใช้ → **Disable**
   - ช่วยลดความสับสนในการเลือก device

3. **ระบุ Device ที่ใช้จริง**
   - ลำโพง/หูฟังที่ใช้ฟังเสียง = ตั้งเป็น Default Playback
   - ไมค์ที่ใช้จริง (ถ้ามี) = ตั้งเป็น Default Communication Device

### เครื่องที่ต่อจอผ่าน HDMI

- HDMI จะสร้าง Audio Output เพิ่ม → อาจทำให้เสียงไปออกจอแทนลำโพง
- ถ้าไม่ได้ใช้เสียงจากจอ → **Disable** audio output ของ HDMI ใน Playback tab
- ถ้าใช้ VoiceMeeter → เลือก A1 ให้ชี้ไปลำโพงที่ถูกต้อง (ไม่ใช่ HDMI)

---

## Troubleshooting

### ปัญหาทั่วไป

| ปัญหา | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|--------|-------------------|---------|
| ไม่เห็น Stereo Mix | Driver ไม่รองรับ | อัพเดท Realtek Driver หรือใช้ VoiceMeeter แทน |
| ติดตั้ง VoiceMeeter แล้วไม่มีเสียง | ยังไม่ได้ Restart | **Restart เครื่อง** หลังติดตั้ง |
| ได้ยินเสียงแต่ Plugin ไม่รับ | Browser เลือก Mic ผิดตัว | ตรวจสอบ Microphone setting ใน Browser |
| ไม่ได้ยินเสียงจากลำโพง (VoiceMeeter) | A1 ยังไม่ได้ตั้งค่า | ตั้ง A1 → ลำโพงจริง และเปิดปุ่ม A1 |
| เสียงเบามากหรือ Distort | Gain สูง/ต่ำเกินไป | ปรับ Gain ใน VoiceMeeter ให้ meter อยู่ช่วง -12 ถึง 0 dB |
| มี Echo ซ้ำ | Physical Mic เปิดอยู่ด้วย | Mute หรือ Disable physical mic ที่ไม่ใช้ |
| VoiceMeeter ค้าง/ไม่ตอบสนอง | ปัญหา Audio Engine | เมนู Menu → Restart Audio Engine |
| ถอน VoiceMeeter แล้วไม่มีเสียง | Windows ยังชี้ไป Virtual Device | ตั้ง Output/Input กลับเป็นลำโพง/ไมค์จริงใน Sound settings |

### วิธีรีเซ็ตกลับสู่สถานะปกติ (ถอน VoiceMeeter)

ถ้าต้องการถอน VoiceMeeter:

1. เปิด **Sound settings** → ตั้ง Output/Input กลับเป็น device จริง **ก่อน**
2. ไปที่ **Settings → Apps → Installed apps**
3. ค้นหา **VoiceMeeter** → **Uninstall**
4. **Restart เครื่อง**
5. ตรวจสอบว่าเสียงทำงานปกติ

---

## สรุปขั้นตอนอย่างรวดเร็ว

```
1. ลอง Stereo Mix ก่อน
   └── มี Stereo Mix? → Enable → Set Default → ตั้ง Browser Mic → ใช้งานได้
   └── ไม่มี? → ไปข้อ 2

2. ติดตั้ง VoiceMeeter Banana
   └── ติดตั้ง → Restart → ตั้ง Windows Audio → ตั้ง VoiceMeeter → ตั้ง Browser Mic → ใช้งานได้
```

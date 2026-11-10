import { describe, expect, it } from 'vitest';
import { eventTime, timeInText, TIMES } from '../src/engine/timeOfDay';
import { loadContent } from '../scripts/content';

describe('เวลาของภาพฉากจากคำบอกเวลาในเนื้อเรื่อง', () => {
  it.each([
    ['คืนนั้นไฟไหม้โรงนา เจ้าจะทำอย่างไร', 'night'],
    ['เด็กเกิดตอนบ่ายสาม แดดส่องเข้าหน้าต่าง', 'day'],
    ['ตกค่ำ ฝูงนกบินกลับรัง', 'dusk'],
    // คำสุดท้ายชนะ: ตัวเลือกเกิดตอนท้ายข้อความ
    ['คืนนั้นไฟไหม้ พอรุ่งเช้า ชาวบ้านมาถาม', 'day'],
    ['ตั้งแต่เช้าจนดึก', 'night'],
    // คำยาวชนะคำสั้นที่ซ้อนอยู่
    ['ค่ำคืนนั้นเงียบ', 'night'],
    ['เขามาถึงตอนเที่ยงคืน', 'night'],
    ['เขามาถึงตอนเที่ยง', 'day'],
    ['ห้ามเดินทางนั้นตอนเช้ามืด', 'night'],
    // ก่อน จน ตั้งแต่ เปลี่ยนความหมาย
    ['ต้องไปให้ถึงก่อนค่ำ', 'day'],
    ['นั่งเฝ้าไข้จนเช้า', 'night'],
    ['ร้านเหล้าเล่นกันมาตั้งแต่หัวค่ำ', 'night'],
    ['ทหารเรียกทุกคนตั้งแต่ก่อนรุ่งสาง', 'day'],
    ['ล้างตัวให้แม่เป็นครั้งสุดท้าย ก่อนไก่ขันรุ่งเช้า', 'night'],
    // คำชัดชนะคำอ่อน (ช่วงยาว กิจวัตร)
    ['เช้าวันนั้นทุกคนตื่นสาย เขาหลับสนิททั้งคืน', 'day'],
    ['ผนังห้องอุ่นทั้งคืน', 'night'],
  ] as const)('%s → %s', (text, want) => {
    expect(timeInText(text)).toBe(want);
  });

  it.each([
    ['"คืนนี้ฝนจะตก" เขาว่า', 'คำในเครื่องหมายคำพูด'],
    ['พรุ่งนี้เช้าเราจะออกเดินทาง', 'ล่วงหน้า'],
    ['เขาบอกว่าพรุ่งนี้ฝนจะตกตอนบ่าย', 'ล่วงหน้าในวลีเดียวกัน'],
    ['เขาตายเมื่อวานตอนบ่าย', 'เล่าย้อน'],
    ['เมื่อคืนฝันร้าย', 'เล่าย้อน'],
    ['ทุกคืนเขาฝึกดาบ ทุกเช้าเขาตักน้ำ', 'กิจวัตร'],
    ['คนงานกะดึกไม่ยอมเข้ากะ', 'ชื่อกะงาน'],
    ['ผีเสื้อกลางคืนบินวนรอบตะเกียง', 'ชื่อสัตว์'],
    ['ใจเย็นไว้ ดื่มน้ำเย็นก่อน เขาทุ่มเทให้งานนี้', 'คำที่ไม่ได้บอกเวลา'],
    ['เรื่องเล่าจากยุคดึกดำบรรพ์', 'คำที่ไม่ได้บอกเวลา'],
  ])('%s → ไม่บอกเวลา (%s)', (text) => {
    expect(timeInText(text)).toBeNull();
  });

  it('time ที่ผู้เขียนใส่ชนะคำในเนื้อเรื่อง ไม่มีทั้งคู่ก็สุ่มคงที่จาก id', () => {
    expect(eventTime({ id: 'adult.x', text: 'คืนนั้นเงียบ', time: 'day' }, 'arvel_village')).toBe('day');
    expect(eventTime({ id: 'adult.x', text: 'คืนนั้นเงียบ' }, 'arvel_village')).toBe('night');
    const a = eventTime({ id: 'adult.quiet', text: 'ไม่มีคำบอกเวลา' }, 'arvel_village');
    expect(eventTime({ id: 'adult.quiet', text: 'ไม่มีคำบอกเวลา' }, 'ileth')).toBe(a);
    expect(TIMES).toContain(eventTime(undefined, 'arvel_village'));
  });

  it('ทุกเหตุการณ์จริงได้เวลาที่มีภาพ และเหตุการณ์ที่บอกเวลาไว้ได้ตามนั้น', () => {
    const { events } = loadContent();
    for (const e of events) expect(TIMES).toContain(eventTime(e, e.id));
    const byId = Object.fromEntries(events.map((e) => [e.id, eventTime(e, e.id)]));
    // ตัวอย่างที่อ่านแล้วตรวจด้วยตา
    expect(byId['infancy.birth_elf']).toBe('night'); // คืนนั้นเอลฟ์ทั้งหมู่บ้าน...
    expect(byId['infancy.birth_marked_kept']).toBe('day'); // เด็กเกิดตอนบ่ายสาม
    expect(byId['childhood.elf_logging_camp']).toBe('dusk'); // พาไปดูตอนพลบค่ำ
    expect(byId['childhood.hidden_no_dream']).toBe('day'); // เช้าวันนั้น ... หลับสนิททั้งคืน
  });
});

import { EquipmentPanel, StatsPanel } from './Panels';
import { SpriteView } from './SpriteView';
import { Story } from './Story';
import { exportLife, importLife, menuOpen, startLife } from '../store';

function Menu() {
  return (
    <div class="menu panel" role="dialog" aria-label="เมนู">
      <button onClick={() => { startLife(); menuOpen.value = false; }}>เริ่มชีวิตใหม่</button>
      <button onClick={() => prompt('คัดลอกรหัสเซฟ', exportLife())}>ส่งออกรหัสเซฟ</button>
      <button onClick={() => { const c = prompt('วางรหัสเซฟ'); if (c) { try { importLife(c); } catch { alert('รหัสไม่ถูกต้อง'); } } menuOpen.value = false; }}>นำเข้ารหัสเซฟ</button>
      <button onClick={() => (menuOpen.value = false)}>ปิด</button>
    </div>
  );
}

/** One DOM, three layouts: CSS grid areas change by orientation and width (see styles.css). */
export function App() {
  return (
    <main class="game">
      <header class="top">
        <h1>VisualNovel</h1>
        <button aria-label="เมนู" onClick={() => (menuOpen.value = !menuOpen.value)}>☰</button>
      </header>
      {menuOpen.value && <Menu />}
      <div class="portrait-box"><SpriteView /></div>
      <StatsPanel />
      <Story />
      <EquipmentPanel />
    </main>
  );
}

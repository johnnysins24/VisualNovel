import { render } from 'preact';
import { App } from './ui/App';
import { boot } from './store';
import './ui/styles.css';

boot().finally(() => render(<App />, document.getElementById('app')!));

// เล่นออฟไลน์ได้หลังเปิดครั้งแรก (เฉพาะตัว build ตอน dev ไม่ใช้ จะได้ไม่ติดไฟล์เก่า)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// เล่นออฟไลน์: หน้าเว็บใช้เน็ตก่อน (ได้เวอร์ชันใหม่เสมอ) ไฟล์อื่นใช้ที่เก็บไว้ก่อน
// ไฟล์ใน assets/ มี hash ในชื่อ เปลี่ยนเวอร์ชันแล้วชื่อเปลี่ยน จึงเก็บแบบ cache-first ได้
const CACHE = 'vn-v1';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch {
    return (await c.match(req)) || (await c.match('./'));
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') c.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !FONT_HOSTS.includes(url.hostname)) return;
  if (req.mode === 'navigate') e.respondWith(networkFirst(req));
  else e.respondWith(cacheFirst(req));
});

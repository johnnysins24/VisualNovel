import { useEffect } from 'preact/hooks';
import { CharacterPanel, DebugPanel, Equipment, MorePanel, PeoplePanel, StatGrid, WorldPanel } from './Panels';
import { BottomNav, Scene, StatRow, TopBar } from './Hud';
import { ChoiceSheet, StoryLog, playableChoices } from './Story';
import { choose, tab } from '../store';

const PAGES = { character: CharacterPanel, people: PeoplePanel, world: WorldPanel, more: MorePanel } as const;

/** ปุ่มลัดเดสก์ท็อป: เลข 1–9 เลือกตัวเลือก */
function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || tab.value !== 'story') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const c = playableChoices()[n - 1];
      if (c) {
        e.preventDefault();
        choose(c.id);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}

/**
 * DOM ชุดเดียว จัดวาง 3 แบบด้วย CSS grid (styles.css):
 * มือถือแนวตั้ง · มือถือแนวนอน (เมนูเป็นแถบซ้าย) · เดสก์ท็อป 3 คอลัมน์
 */
export function App() {
  useHotkeys();
  const t = tab.value;
  const Page = t === 'story' ? null : PAGES[t];
  return (
    <main class="game" data-tab={t}>
      <TopBar />
      <Scene />
      <StatRow />
      <aside class="side left" aria-label="ตัวละคร">
        <section class="sec">
          <h3>ค่าสถานะ</h3>
          <StatGrid />
        </section>
        <Equipment />
      </aside>
      <section class="read">
        {Page ? (
          <div class="page"><Page /></div>
        ) : (
          <>
            <StoryLog />
            <ChoiceSheet />
          </>
        )}
      </section>
      <aside class="side right" aria-label="ผู้คนและโลก">
        <PeoplePanel />
        <WorldPanel />
      </aside>
      <BottomNav />
      {new URLSearchParams(location.search).has('debug') && <DebugPanel />}
    </main>
  );
}

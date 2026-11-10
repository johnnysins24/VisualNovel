import { useEffect } from 'preact/hooks';
import { CharacterPanel, DebugPanel, Equipment, MorePanel, SlotGrid, StatGrid, WorldMap, WorldPanel } from './Panels';
import { CloseList, PeoplePage } from './People';
import { RollDialog } from './Endings';
import { Icon } from './icons';
import { BottomNav, Scene, StatRow, TopBar } from './Hud';
import { ChoiceSheet, StoryLog, playableChoices } from './Story';
import { bigRoll, choose, life, tab } from '../store';
import { revealNext, revealing, scrolledBack } from './reading';

const PAGES = { character: CharacterPanel, people: PeoplePage, world: WorldPanel, more: MorePanel } as const;

/** ปุ่มลัดเดสก์ท็อป: เลข 1–9 เลือกตัวเลือก Space/Enter อ่านย่อหน้าต่อ */
function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || tab.value !== 'story') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      if (bigRoll.value) return;
      if ((e.key === ' ' || e.key === 'Enter') && revealing.value && t?.tagName !== 'BUTTON') {
        e.preventDefault();
        revealNext();
        return;
      }
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
 * มือถือแนวตั้ง · มือถือแนวนอน (เมนูเป็นแถบซ้าย) · เดสก์ท็อป 2 คอลัมน์ (เวทีซ้าย หนังสือขวา)
 */
export function App() {
  useHotkeys();
  const t = tab.value;
  const Page = t === 'story' ? null : PAGES[t];
  return (
    <main class="game" data-tab={t} data-back={t === 'story' && scrolledBack.value ? '' : undefined}>
      <TopBar />
      <StatRow />
      {/* เวที: ฉาก ค่าสถานะ ผู้คน (เดสก์ท็อปเป็นคอลัมน์ซ้าย มือถือแตกเป็นแถวของ grid หลัก) */}
      <div class="stage">
        <Scene />
        <aside class="side left" aria-label="ตัวละคร">
          <section class="sec">
            <h3>ค่าสถานะ</h3>
            <StatGrid />
          </section>
          <section class="sec">
            <h3>สวมใส่</h3>
            <SlotGrid />
          </section>
          <Equipment />
        </aside>
        <aside class="side right" aria-label="ผู้คนและโลก">
          <CloseList />
          <section class="sec">
            <h3><Icon name="place" />ที่อยู่</h3>
            <WorldMap here={life.value.locationTag} small />
          </section>
        </aside>
      </div>
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
      <BottomNav />
      <RollDialog />
      {new URLSearchParams(location.search).has('debug') && <DebugPanel />}
    </main>
  );
}

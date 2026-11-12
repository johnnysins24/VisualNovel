/**
 * ของสวมใส่บนหน้าจอ: ช่องไอคอนของกระเป๋า การ์ดของ กรอบสีตามระดับ และร้านค้าของถิ่น
 * ไอคอนของทุกชิ้นมาจาก public/items/<id>.png (สร้างตอน npm run content จากชุดภาพที่นำเข้า ดู scripts/item-icons.ts)
 * แตะช่องของแล้วการ์ดเปิดใต้แถว แบบเดียวกับสิ่งติดตัว (Traits.tsx)
 */
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ENCOUNTER, FOE_TAGS, GEAR, ITEM_TAG_TH, MATERIALS, MOVE_TH, RARITIES, RARITY_TH, STAT_TH, type ItemTag, type Rarity } from '../engine/balance';
import { buyBlock, greetOf, isSupply, sellPrice, shelfOf, shopClosedLine, shopOpen, shopsHere, supplyCount, usableInFight } from '../engine/gear';
import { canChangeGear, maxHp } from '../engine/items';
import { STATS, type Item, type Passive, type Shop, type Slot } from '../engine/schema';
import type { LifeState } from '../engine/state';
import { render } from '../engine/text';
import { buyItem, equip, game, life, sellItem, tab, unequip, useItem } from '../store';
import { Icon } from './icons';

export const SLOT_TH: Record<Slot, string> = {
  head: 'หัว', body: 'ตัว', hands: 'มือ', legs: 'ขา', feet: 'เท้า',
  weapon: 'อาวุธ', offhand: 'มือรอง', cloak: 'ผ้าคลุม', accessory: 'เครื่องประดับ',
};

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const isFoeTag = (t: ItemTag) => (FOE_TAGS as readonly string[]).includes(t);
const tagsTh = (tags: ItemTag[]) => tags.map((t) => ITEM_TAG_TH[t]).join(' ');

/** การ์ดของที่เปิดอยู่: ของในกระเป๋า หรือของบนแผงของร้าน (shop = รหัสร้าน) */
export const openItem = signal<{ id: string; shop?: string } | null>(null);

/** เปิดการ์ดของชิ้นนี้ในแท็บตัวละคร (ช่องสวมใส่และแถวเล็กในคอลัมน์ซ้ายเรียกใช้) */
export function showItem(id: string) {
  openItem.value = { id };
  tab.value = 'character';
}

/** รูปของของหนึ่งชิ้น ไม่มีไฟล์ภาพ = ไอคอนของช่องสวม */
export function ItemIcon({ item }: { item: Item }) {
  const [gone, setGone] = useState<string | null>(null);
  if (gone === item.id) return <Icon name={item.slot ?? 'bag'} />;
  return <img class="iart" src={`items/${item.id}.png`} alt="" onError={() => setGone(item.id)} />;
}

const kindTh = (item: Item) => (isSupply(item) ? 'ของใช้แล้วหมด' : RARITY_TH[item.rarity]);

const passiveBrief = (p: Passive): string => {
  switch (p.kind) {
    case 'check_bonus': return `ทอย${STAT_TH[p.stat]} ${signed(p.amount)}`;
    case 'max_hp': return `พลังชีวิตสูงสุด ${signed(p.amount)}`;
    case 'armor': return `เกราะ ${p.amount}`;
    case 'shield': return 'โล่กันหนึ่งครั้ง';
    case 'reroll_failed_check': return 'ทอยใหม่หนึ่งครั้ง';
    case 'winter': return `กันหนาว +${p.amount}`;
  }
};

/** สิ่งที่ของชิ้นนี้ให้ แบบสั้น ใช้ในแถวของร้านและบรรทัดเทียบกับของที่สวมอยู่ */
export function brief(item: Item): string[] {
  const out = STATS.filter((s) => item.stats[s]).map((s) => `${STAT_TH[s]} ${signed(item.stats[s]!)}`);
  for (const p of [item.passive, item.also]) if (p) out.push(passiveBrief(p.effect));
  if (item.use?.heal) out.push(`ฟื้นพลังชีวิต ${item.use.heal}`);
  if (item.use?.boost) out.push(`${item.use.boost.kinds.map((k) => MOVE_TH[k]).join(' ')} +${item.use.boost.amount}`);
  const tags = item.tags.filter(isFoeTag);
  if (tags.length) out.push(tagsTh(tags));
  return out;
}

interface Held { item: Item; count: number }

const isWorn = (l: LifeState, item: Item) => !!item.slot && l.equipped[item.slot] === item.id;

/** ของในกระเป๋า: ของสวมใส่ที่ไม่ได้สวมอยู่ ตามลำดับที่ได้มา แล้วของใช้แล้วหมด (ของที่สวมอยู่อยู่ในช่องสวมใส่) */
export function heldItems(l: LifeState): Held[] {
  const gear = l.inventory
    .map((id) => game.items.get(id))
    .filter((i): i is Item => !!i && !isWorn(l, i))
    .map((item) => ({ item, count: 0 }));
  const supplies = Object.keys(l.supplies ?? {})
    .map((id) => ({ item: game.items.get(id), count: supplyCount(l, id) }))
    .filter((s): s is Held => !!s.item && s.count > 0);
  return [...gear, ...supplies];
}

function Tile({ item, on, count, small, onPick }: { item: Item; on?: boolean; count?: number; small?: boolean; onPick: (id: string) => void }) {
  return (
    <button
      class={`itile r-${item.rarity} ${on ? 'on' : ''} ${small ? 'small' : ''}`}
      title={item.name}
      aria-label={`${kindTh(item)} ${item.name}${count ? ` มี ${count}` : ''}`}
      aria-pressed={on}
      onClick={() => onPick(item.id)}
    >
      <ItemIcon item={item} />
      {count ? <span class="count num">{count}</span> : null}
    </button>
  );
}

function RarityLegend({ items }: { items: Item[] }) {
  const have = RARITIES.filter((r) => items.some((i) => !isSupply(i) && i.rarity === r));
  if (!have.length) return null;
  return (
    <p class="kind-legend">
      {have.map((r: Rarity) => <span key={r} class={`r-${r}`}><i />{RARITY_TH[r]}</span>)}
    </p>
  );
}

/** สิ่งที่ของชิ้นนี้ให้และสิ่งที่ต้องแลก บรรทัดละเรื่อง */
function Lines({ item }: { item: Item }) {
  const mat = item.material ? MATERIALS[item.material] : null;
  const foeTags = item.tags.filter(isFoeTag);
  const otherTags = item.tags.filter((t) => !isFoeTag(t));
  const plus = (key: string, text: string) => <p key={key} class="plus"><Icon name="plus" label="ได้" /><span>{text}</span></p>;
  const minus = (key: string, text: string) => <p key={key} class="minus"><Icon name="minus" label="เสีย" /><span>{text}</span></p>;
  return (
    <>
      {STATS.filter((s) => (item.stats[s] ?? 0) > 0).map((s) => plus(s, `${STAT_TH[s]} ${signed(item.stats[s]!)}`))}
      {item.passive && plus('p', item.passive.description)}
      {item.also && plus('a', item.also.description)}
      {item.use?.heal ? plus('h', `ฟื้นพลังชีวิต ${item.use.heal}`) : null}
      {item.use?.boost && plus('b', `${item.use.boost.kinds.map((k) => MOVE_TH[k]).join(' ')} +${item.use.boost.amount} ในจังหวะที่ใช้`)}
      {isSupply(item) && foeTags.length > 0 && plus('t', `${tagsTh(foeTags)}: ตรงจุดอ่อนของศัตรู +${ENCOUNTER.weak} ไม่ตรง +${GEAR.thrown}`)}
      {mat?.gives && plus('mg', `${mat.th}: ${mat.gives}`)}
      {STATS.filter((s) => (item.stats[s] ?? 0) < 0).map((s) => minus(s, `${STAT_TH[s]} ${signed(item.stats[s]!)}`))}
      {mat?.costs && (!mat.costsOn || mat.costsOn === item.slot) && minus('mc', `${mat.th}: ${mat.costs}`)}
      {item.caveat && minus('c', item.caveat)}
      {!isSupply(item) && foeTags.length > 0 && (
        <p class="note">
          <Icon name="target" />
          <span>
            นับเป็น{tagsTh(foeTags)}
            {item.slot === 'weapon' ? 'เมื่อบุกหรือชิงจังหวะ' : item.slot === 'offhand' ? 'เมื่อตั้งรับหรือใช้ของ' : ''} ได้เปรียบศัตรูที่แพ้ของแบบนี้
          </span>
        </p>
      )}
      {otherTags.length > 0 && <p class="note"><Icon name="key" /><span>ใช้เป็น{tagsTh(otherTags)}ได้</span></p>}
      {item.lore && <p class="note lore-line"><Icon name="quill" /><span>{item.lore}</span></p>}
    </>
  );
}

/** ปุ่มของของในกระเป๋า: สวม ถอด ใช้ ขาย */
function BagActions({ item }: { item: Item }) {
  const l = life.value;
  const [msg, setMsg] = useState('');
  const [sure, setSure] = useState(false);
  const worn = !!item.slot && l.equipped[item.slot] === item.id;
  const busy = !canChangeGear(l);
  const price = sellPrice(item);
  const buyer = !busy && price !== null && shopsHere(game, l).some((s) => shopOpen(game, l, s));
  const full = l.hp >= maxHp(l, game.items);
  const act = (ok: boolean, fail: string, done = '') => {
    setSure(false);
    setMsg(ok ? done : busy ? 'กลางการปะทะ เปลี่ยนของไม่ได้' : fail);
  };
  return (
    <>
      <div class="row-buttons card-actions">
        {item.slot && !worn && <button onClick={() => act(equip(item.id), 'เปลี่ยนไม่ได้ ร่างกายยังพึ่งของที่สวมอยู่ในช่องนี้')}><Icon name={item.slot} />สวม</button>}
        {item.slot && worn && <button onClick={() => act(unequip(item.id), 'ถอดไม่ได้ ร่างกายยังพึ่งของชิ้นนี้อยู่')}><Icon name="close" />ถอด</button>}
        {item.use?.heal ? (
          <button
            disabled={busy || full}
            onClick={() => {
              const healed = useItem(item.id);
              setSure(false);
              setMsg(healed ? `${render(item.use?.text ?? '', life.value)} (พลังชีวิต +${healed})` : '');
              if (!supplyCount(life.value, item.id)) openItem.value = null;
            }}
          >
            <Icon name="heart" />ใช้
          </button>
        ) : null}
        {buyer && (
          <button
            class={sure ? 'sure' : ''}
            onClick={() => {
              if (!sure) return setSure(true);
              const ok = sellItem(item.id);
              act(ok, 'ขายไม่ได้ ร่างกายยังพึ่งของชิ้นนี้อยู่');
              const now = life.value;
              if (ok && !now.inventory.includes(item.id) && !supplyCount(now, item.id)) openItem.value = null;
            }}
          >
            <Icon name="coin" />{sure ? 'แตะอีกครั้งเพื่อขาย' : 'ขาย'} <span class="num">{price}</span>
          </button>
        )}
      </div>
      {usableInFight(item) && !item.use?.heal && <p class="note act-note">ใช้ได้ในการปะทะ จังหวะละชิ้น</p>}
      {item.use?.heal && full && !busy ? <p class="note act-note">พลังชีวิตเต็มอยู่แล้ว</p> : null}
      {msg && <p class="note act-note said">{msg}</p>}
    </>
  );
}

/** ปุ่มของของบนแผง: ซื้อ หรือเหตุที่ยังซื้อไม่ได้ ซื้อแล้วสวมต่อได้เลย */
function ShopActions({ item, shop }: { item: Item; shop: Shop }) {
  const l = life.value;
  const block = buyBlock(game, l, shop, item);
  const price = item.price ?? 0;
  const owned = !isSupply(item) && l.inventory.includes(item.id);
  const worn = !!item.slot && l.equipped[item.slot] === item.id;
  const cur = item.slot ? game.items.get(l.equipped[item.slot] ?? '') : undefined;
  const why =
    block === 'closed' ? render(shopClosedLine(game, l, shop), l)
    : block === 'owned' ? (worn ? 'มีชิ้นนี้แล้ว และสวมอยู่' : 'มีชิ้นนี้อยู่ในกระเป๋าแล้ว')
    : block === 'full' ? `พกได้ ${GEAR.stack} ชิ้น เต็มแล้ว`
    : block === 'needs' ? render(item.needs_text ?? '', l)
    : block === 'gold' ? `เงินไม่พอ ขาดอีก ${price - l.gold}`
    : '';
  return (
    <>
      {cur && cur.id !== item.id && (
        <p class="note act-note"><Icon name={item.slot!} /><span>ตอนนี้สวม {cur.name}{brief(cur).length ? ` (${brief(cur).join(' · ')})` : ''}</span></p>
      )}
      <div class="row-buttons card-actions">
        {!owned && (
          <button class="primary" disabled={!!block} onClick={() => buyItem(shop.id, item.id)}>
            <Icon name="coin" />ซื้อ <span class="num">{price}</span>
          </button>
        )}
        {owned && !worn && item.slot && <button onClick={() => equip(item.id)}><Icon name={item.slot} />สวม</button>}
      </div>
      {why && <p class="note act-note said">{why}</p>}
    </>
  );
}

/** การ์ดของ: รูป ชื่อ ระดับ วัสดุ ช่อง สิ่งที่ให้และสิ่งที่ต้องแลก เรื่องของชิ้นนี้ และปุ่ม */
function Card({ item, shop, onClose }: { item: Item; shop?: Shop; onClose: () => void }) {
  const l = life.value;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [item.id]);
  const have = supplyCount(l, item.id);
  return (
    <div ref={box} class={`trait-card icard r-${item.rarity}`} role="group" aria-label={item.name}>
      <span class="art"><ItemIcon item={item} /></span>
      <div class="tc-head">
        <b>{item.name}</b>
        <span class="tc-kind">
          <span class="k">{kindTh(item)}</span>
          {item.material && <span>{MATERIALS[item.material].th}</span>}
          {item.slot && <span>{SLOT_TH[item.slot]}</span>}
          {isSupply(item) && <span>พกอยู่ <span class="num">{have}/{GEAR.stack}</span></span>}
        </span>
      </div>
      <button class="icon-btn" onClick={onClose} aria-label="ปิด"><Icon name="close" /></button>
      <div class="tc-body">
        <Lines item={item} />
        {shop ? <ShopActions item={item} shop={shop} /> : <BagActions item={item} />}
      </div>
    </div>
  );
}

function Purse() {
  return <span class="purse" title="เงิน"><Icon name="coin" label="เงิน" /><span class="num">{life.value.gold}</span></span>;
}

/** การ์ดของของที่สวมอยู่ เปิดใต้ช่องสวมใส่ในแท็บตัวละคร เมื่อแตะช่องนั้น */
export function WornCard() {
  const l = life.value;
  const at = openItem.value;
  const item = at && !at.shop ? game.items.get(at.id) : undefined;
  if (!item || !isWorn(l, item)) return null;
  return <Card key={item.id} item={item} onClose={() => (openItem.value = null)} />;
}

/** ของชิ้นนี้เปิดการ์ดอยู่ไหม (ช่องสวมใส่ใช้ขึ้นวงรอบช่อง) */
export const isOpenItem = (id: string) => !!openItem.value && !openItem.value.shop && openItem.value.id === id;

/** หัวข้อกระเป๋าในแท็บตัวละคร: ช่องไอคอนของของที่ไม่ได้สวม แตะแล้วการ์ดเปิดใต้แถว */
export function BagSection() {
  const l = life.value;
  const rows = heldItems(l);
  const at = openItem.value;
  const open = at && !at.shop ? rows.find((r) => r.item.id === at.id) : undefined;
  const pick = (id: string) => (openItem.value = isOpenItem(id) ? null : { id });
  const all = [...l.inventory.map((id) => game.items.get(id)).filter((i): i is Item => !!i)];
  return (
    <section class="sec bag" aria-label="กระเป๋า">
      <h3><Icon name="bag" />กระเป๋า <span class="num">{rows.length}</span><Purse /></h3>
      {rows.length === 0 ? <p class="muted">กระเป๋าว่าง</p> : (
        <div class="bag-row">
          {rows.map((r) => <Tile key={r.item.id} item={r.item} count={r.count} on={open?.item.id === r.item.id} onPick={pick} />)}
        </div>
      )}
      <RarityLegend items={all} />
      {open && <Card key={open.item.id} item={open.item} onClose={() => (openItem.value = null)} />}
    </section>
  );
}

/** แถวช่องเล็กในคอลัมน์ซ้ายบนเดสก์ท็อป: แตะแล้วไปเปิดการ์ดในแท็บตัวละคร */
export function BagStrip() {
  const l = life.value;
  const rows = heldItems(l);
  const shop = l.encounter ? undefined : shopsHere(game, l)[0];
  return (
    <section class="sec bag" aria-label="กระเป๋า">
      <h3><Icon name="bag" />กระเป๋า <span class="num">{rows.length}</span></h3>
      {rows.length === 0 && <p class="muted">กระเป๋าว่าง</p>}
      <div class="bag-row small">
        {rows.map((r) => <Tile key={r.item.id} item={r.item} count={r.count} small onPick={showItem} />)}
      </div>
      {shop && (
        <button
          class="shop-link"
          onClick={() => {
            openItem.value = null;
            tab.value = 'character';
            requestAnimationFrame(() => document.querySelector('.sec.shop')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
          }}
        >
          <Icon name="shop" />{shop.name}
        </button>
      )}
    </section>
  );
}

function ShopView({ shop }: { shop: Shop }) {
  const l = life.value;
  const at = openItem.value;
  const openHere = at?.shop === shop.id ? at.id : null;
  const pick = (id: string) => (openItem.value = openHere === id ? null : { id, shop: shop.id });
  const close = () => (openItem.value = null);
  const shelf = shelfOf(game, l, shop);
  const open = shelf.find((i) => i.id === openHere);
  const blockOf = (item: Item) => buyBlock(game, l, shop, item);
  // ใต้ช่องของบนแผง: ราคา หรือเหตุที่ไม่ต้องซื้อ (มีแล้ว พกเต็มแล้ว)
  const Price = ({ item }: { item: Item }) => {
    const b = blockOf(item);
    if (b === 'owned') return <span class="price have">มีแล้ว</span>;
    if (b === 'full') return <span class="price have">เต็ม</span>;
    return <span class="price"><Icon name="coin" /><span class="num">{item.price}</span></span>;
  };
  return (
    <section class="sec shop" aria-label={shop.name}>
      <h3><Icon name="shop" />{shop.name}<Purse /></h3>
      {!shopOpen(game, l, shop) ? <p class="greet closed">{render(shopClosedLine(game, l, shop), l)}</p> : (
        <>
          <p class="greet">{greetOf(l, shop)}</p>
          <div class="bag-row shelf">
            {shelf.map((item) => (
              <span key={item.id} class={`shelf-cell ${blockOf(item) ? 'cant' : ''}`}>
                <Tile item={item} on={openHere === item.id} onPick={pick} />
                <Price item={item} />
              </span>
            ))}
          </div>
          {open && <Card key={open.id} item={open} shop={shop} onClose={close} />}
        </>
      )}
    </section>
  );
}

/** ร้านของถิ่นที่ตัวละครอยู่ ต่อจากกระเป๋าในแท็บตัวละคร กลางการปะทะและตอนใกล้ตายไม่มีร้าน */
export function ShopSection() {
  const l = life.value;
  if (!canChangeGear(l)) return null;
  return <>{shopsHere(game, l).map((s) => <ShopView key={s.id} shop={s} />)}</>;
}

/** ป้ายของในบรรทัดสิ่งที่เปลี่ยน (ได้ของจากเหตุการณ์ ร้าน หรือศัตรู) */
export function ItemChip({ id }: { id: string }) {
  const item = game.items.get(id);
  if (!item) return <span class="gold"><Icon name="bag" label="ได้ของ" />{id}</span>;
  return <span class={`ichip r-${item.rarity}`}><ItemIcon item={item} />{item.name}</span>;
}

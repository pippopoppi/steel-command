/* Steel Command — a tiny real-time strategy game. MIT licence. */
(() => {
'use strict';

// ---------- constants & balance ----------
const W = 400, H = 720;           // viewport (logical px)
const MW = 1000, MH = 1500;       // world size
const PANEL_H = 118;              // DOM panel height at the bottom
const VIEW_H = H - PANEL_H;
const SAVE_KEY = 'steelcommand.v1';
const SITE_URL = (location.origin + location.pathname).replace(/index\.html$/, '');
const TAU = 6.2832;
const BUILD_RANGE = 260;

const BUILDINGS = {
  cc:       { name: 'Command Center', w: 100, h: 84, hp: 3200, cost: 0,    time: 0,  builds: ['dozer'], color: '#64748b' },
  supply:   { name: 'Supply Center',  w: 84,  h: 66, hp: 1500, cost: 800,  time: 12, builds: ['harvester'], color: '#ca8a04' },
  barracks: { name: 'Barracks',       w: 76,  h: 66, hp: 1200, cost: 500,  time: 10, builds: ['rifle', 'rocket'], color: '#16a34a' },
  factory:  { name: 'War Factory',    w: 100, h: 76, hp: 2000, cost: 1200, time: 16, builds: ['tank', 'buggy'], color: '#7c3aed' },
  turret:   { name: 'Gun Turret',     w: 44,  h: 44, hp: 900,  cost: 600,  time: 8,  range: 210, dps: 36, color: '#dc2626' },
};
const UNITS = {
  dozer:     { name: 'Dozer',          cost: 600, hp: 400, speed: 70,  time: 8,  r: 11, builder: true, vehicle: true },
  harvester: { name: 'Harvester',      cost: 800, hp: 600, speed: 85,  time: 10, r: 12, harvester: true, vehicle: true, cargo: 150 },
  rifle:     { name: 'Rifleman',       cost: 150, hp: 110, speed: 60,  time: 4,  r: 6,  range: 115, dps: 14, vsVeh: 0.35 },
  rocket:    { name: 'Rocket Trooper', cost: 300, hp: 100, speed: 55,  time: 6,  r: 6,  range: 150, dps: 24, vsVeh: 1.6, vsInf: 0.45 },
  tank:      { name: 'Battle Tank',    cost: 800, hp: 720, speed: 75,  time: 10, r: 13, range: 140, dps: 36, vsInf: 0.6, vehicle: true },
  buggy:     { name: 'Rocket Buggy',   cost: 600, hp: 300, speed: 125, time: 7,  r: 10, range: 165, dps: 26, vsVeh: 1.3, vsInf: 0.5, vehicle: true },
};
const GENERALS = {
  armor:    { name: 'General Steele',  title: 'Armor',    desc: 'Tanks and buggies have +25% hull. War Factory costs 20% less.', icon: '🛡️' },
  infantry: { name: 'General Reyes',   title: 'Infantry', desc: 'Infantry costs 30% less and trains twice as fast.', icon: '🪖' },
  defense:  { name: 'General Okafor',  title: 'Defense',  desc: 'Turrets cost 40% less with +30% range. Buildings have +25% hull.', icon: '🏰' },
};

// ---------- save ----------
function loadSave() {
  const d = { level: 1, best: 1, wins: 0, general: 'armor', sound: true };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) Object.assign(d, s); } catch (e) { /* no storage */ }
  return d;
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

// ---------- helpers ----------
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rectOf = b => ({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });
function circleRect(cx, cy, r, rc) { const nx = clamp(cx, rc.x, rc.x + rc.w), ny = clamp(cy, rc.y, rc.y + rc.h); return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r; }
function rectsOverlap(a, b, pad) { return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y; }
let AC = null;
function beep(freq, dur, type, vol, slide) {
  if (!save.sound) return;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, AC.currentTime + dur);
    g.gain.value = vol || 0.04; g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
  } catch (e) { /* no audio */ }
}

// ---------- state ----------
let L = null, nextId = 1;
const G = {
  state: 'menu', t: 0, units: [], bldgs: [], piles: [], shots: [], parts: [], floats: [], toasts: [],
  cam: { x: MW / 2 - W / 2, y: MH - VIEW_H }, credits: { blue: 0, red: 0 }, sel: [], placing: null, ghost: null,
  ai: { t: 0, waveT: 0, mix: 0 }, lost: false, won: false, stats: { built: 0, trained: 0, kills: 0, lost: 0 }, panelDirty: true, shake: 0,
};
const gen = () => GENERALS[save.general] ? save.general : 'armor';
function unitCost(type, team) {
  let c = UNITS[type].cost;
  if (team === 'blue' && gen() === 'infantry' && !UNITS[type].vehicle) c = Math.round(c * 0.7);
  return c;
}
function bldgCost(type, team) {
  let c = BUILDINGS[type].cost;
  if (team === 'blue') { if (gen() === 'armor' && type === 'factory') c = Math.round(c * 0.8); if (gen() === 'defense' && type === 'turret') c = Math.round(c * 0.6); }
  return c;
}

function mkBldg(team, type, x, y, built) {
  const B = BUILDINGS[type];
  let hp = B.hp; if (team === 'blue' && gen() === 'defense') hp = Math.round(hp * 1.25);
  const b = { id: nextId++, kind: 'bldg', team, type, x, y, w: B.w, h: B.h, hp: built ? hp : 1, maxHp: hp, progress: built ? 1 : 0, queue: [], prodT: 0, cd: 0, hit: 0, dead: false, range: B.range ? B.range * (team === 'blue' && gen() === 'defense' ? 1.3 : 1) : 0, dps: B.dps || 0, aim: 0 };
  G.bldgs.push(b); return b;
}
function mkUnit(team, type, x, y) {
  const U = UNITS[type];
  let hp = U.hp; if (team === 'blue' && gen() === 'armor' && U.vehicle && !U.builder && !U.harvester) hp = Math.round(hp * 1.25);
  const u = { id: nextId++, kind: 'unit', team, type, x, y, hp, maxHp: hp, r: U.r, speed: U.speed, range: U.range || 0, dps: U.dps || 0,
    order: null, tx: null, ty: null, target: null, cd: Math.random() * 0.5, hit: 0, dead: false, cargo: 0, state: 'idle', pile: null, build: null, face: -Math.PI / 2, ph: Math.random() * TAU };
  G.units.push(u); return u;
}
const alive = e => !e.dead;
const own = team => ({ units: G.units.filter(u => u.team === team && !u.dead), bldgs: G.bldgs.filter(b => b.team === team && !b.dead) });

function startLevel(n) {
  L = { n };
  nextId = 1;
  G.state = 'play'; G.t = 0; G.units = []; G.bldgs = []; G.piles = []; G.shots = []; G.parts = []; G.floats = []; G.toasts = [];
  G.sel = []; G.placing = null; G.ghost = null; G.lost = false; G.won = false; G.shake = 0;
  G.stats = { built: 0, trained: 0, kills: 0, lost: 0 };
  G.credits = { blue: 2500, red: 400 + n * 200 };
  G.ai = { t: 0, waveT: 150 - Math.min(60, n * 5), mix: 0, income: 0.5 + n * 0.3, waveSize: 6 + n * 2 };
  // player base (bottom)
  mkBldg('blue', 'cc', 500, 1370, true);
  mkBldg('blue', 'supply', 360, 1390, true);
  mkBldg('blue', 'barracks', 650, 1380, true);
  mkUnit('blue', 'dozer', 560, 1290);
  mkUnit('blue', 'harvester', 380, 1310);
  mkUnit('blue', 'harvester', 300, 1330);
  // enemy base (top)
  mkBldg('red', 'cc', 500, 140, true);
  mkBldg('red', 'supply', 650, 130, true);
  mkBldg('red', 'barracks', 350, 150, true);
  if (n >= 2) mkBldg('red', 'factory', 500, 262, true);
  if (n >= 3) { mkBldg('red', 'turret', 380, 300, true); mkBldg('red', 'turret', 620, 300, true); }
  if (n >= 5) { mkBldg('red', 'turret', 500, 360, true); mkBldg('red', 'barracks', 800, 200, true); }
  mkUnit('red', 'harvester', 650, 210); mkUnit('red', 'harvester', 700, 230);
  for (let i = 0; i < Math.min(4, n); i++) mkUnit('red', i % 3 === 2 && n >= 2 ? 'tank' : i % 2 ? 'rocket' : 'rifle', 440 + i * 30, 330);
  // supply piles
  const piles = [[220, 1300], [250, 1420], [760, 1420], [120, 1180], [880, 1180], [300, 760], [700, 760], [500, 640], [500, 880], [220, 230], [820, 320], [900, 140]];
  piles.forEach(([x, y], i) => G.piles.push({ x, y, amount: i < 3 || i > 8 ? 2400 : 3600, max: 3600 }));
  G.cam = { x: MW / 2 - W / 2, y: MH - VIEW_H };
  G.panelDirty = true;
  toast('Level ' + n + ' — ' + GENERALS[gen()].name, 2.4);
  showScreen(null);
}

// ---------- orders ----------
function orderMove(units, x, y, attack) {
  const n = units.length, cols = Math.ceil(Math.sqrt(n));
  units.forEach((u, i) => {
    const ox = (i % cols - (cols - 1) / 2) * 22, oy = (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * 22;
    u.order = attack ? 'amove' : 'move'; u.tx = clamp(x + ox, 10, MW - 10); u.ty = clamp(y + oy, 10, MH - 10); u.target = null;
    if (UNITS[u.type].harvester) { u.state = 'manual'; u.pile = null; }
    if (UNITS[u.type].builder) u.build = null;
  });
}
function orderAttack(units, target) { for (const u of units) { if (u.dps > 0) { u.order = 'attack'; u.target = target; } else { u.order = 'move'; u.tx = target.x; u.ty = target.y; } } }
function selected() { return G.sel.map(id => G.units.find(u => u.id === id) || G.bldgs.find(b => b.id === id)).filter(e => e && !e.dead); }
function selectedUnits() { return selected().filter(e => e.kind === 'unit'); }
function selectArmy() { G.sel = own('blue').units.filter(u => u.dps > 0).map(u => u.id); G.panelDirty = true; }

function queueUnit(b, type) {
  const cost = unitCost(type, b.team);
  if (G.credits[b.team] < cost || b.queue.length >= 5) return false;
  G.credits[b.team] -= cost; b.queue.push(type); if (b.queue.length === 1) b.prodT = 0;
  return true;
}
function placeBuilding(type, x, y, team) {
  const B = BUILDINGS[type], rc = { x: x - B.w / 2, y: y - B.h / 2, w: B.w, h: B.h };
  if (rc.x < 10 || rc.y < 10 || rc.x + rc.w > MW - 10 || rc.y + rc.h > MH - 10) return 'Out of bounds';
  for (const o of G.bldgs) if (!o.dead && rectsOverlap(rc, rectOf(o), 10)) return 'Too close to a building';
  for (const p of G.piles) if (p.amount > 0 && circleRect(p.x, p.y, 30, rc)) return 'On top of supplies';
  const near = G.bldgs.some(o => !o.dead && o.team === team && dist(o, { x, y }) < BUILD_RANGE);
  if (!near) return 'Too far from your base';
  const dozer = own(team).units.find(u => UNITS[u.type].builder);
  if (!dozer) return 'You need a Dozer';
  const cost = bldgCost(type, team);
  if (G.credits[team] < cost) return 'Not enough credits';
  G.credits[team] -= cost;
  const b = mkBldg(team, type, x, y, false);
  const free = own(team).units.filter(u => UNITS[u.type].builder && !u.build);
  const d = (free.length ? free : [dozer]).sort((a, c) => dist(a, b) - dist(c, b))[0];
  d.build = b; d.order = null;
  return null;
}

// ---------- simulation ----------
function nearestEnemy(e, range, team) {
  let best = null, bd = range * range;
  for (const u of G.units) { if (u.dead || u.team === team) continue; const d2 = (u.x - e.x) ** 2 + (u.y - e.y) ** 2; if (d2 < bd) { bd = d2; best = u; } }
  for (const b of G.bldgs) { if (b.dead || b.team === team) continue; const rc = rectOf(b); const nx = clamp(e.x, rc.x, rc.x + rc.w), ny = clamp(e.y, rc.y, rc.y + rc.h); const d2 = (nx - e.x) ** 2 + (ny - e.y) ** 2; if (d2 < bd) { bd = d2; best = b; } }
  return best;
}
function edgeDist(a, b) {
  if (b.kind === 'bldg') { const rc = rectOf(b); const nx = clamp(a.x, rc.x, rc.x + rc.w), ny = clamp(a.y, rc.y, rc.y + rc.h); return Math.hypot(nx - a.x, ny - a.y); }
  return dist(a, b) - b.r;
}
function damage(target, amount, from) {
  if (target.dead) return;
  if (target.kind === 'unit') {
    const U = UNITS[target.type], F = from && from.kind === 'unit' ? UNITS[from.type] : null;
    if (F) { if (U.vehicle && F.vsVeh) amount *= F.vsVeh; if (!U.vehicle && F.vsInf) amount *= F.vsInf; }
  } else if (from && from.kind === 'unit' && UNITS[from.type].vsVeh) amount *= UNITS[from.type].vsVeh > 1 ? 1.25 : 0.6;
  target.hp -= amount; target.hit = 0.1;
  if (target.hp <= 0) {
    target.dead = true;
    if (target.kind === 'unit') { boom(target.x, target.y, UNITS[target.type].vehicle ? 18 : 8); if (target.team === 'red') G.stats.kills++; else G.stats.lost++; }
    else { boom(target.x, target.y, 40); G.shake = 1; if (target.team === 'blue') toast(BUILDINGS[target.type].name + ' destroyed!', 1.6); else toast('Enemy ' + BUILDINGS[target.type].name + ' destroyed!', 1.6); }
    beep(target.kind === 'bldg' ? 60 : 140, 0.3, 'sawtooth', 0.06, 30);
  }
}
function fireAt(src, tgt, dt) {
  src.cd -= dt;
  if (src.cd > 0) return;
  src.cd = 0.55;
  const tx = tgt.kind === 'bldg' ? clamp(src.x, tgt.x - tgt.w / 2, tgt.x + tgt.w / 2) : tgt.x, ty = tgt.kind === 'bldg' ? clamp(src.y, tgt.y - tgt.h / 2, tgt.y + tgt.h / 2) : tgt.y;
  src.face = Math.atan2(ty - src.y, tx - src.x);
  const heavy = src.kind === 'bldg' || UNITS[src.type].vehicle;
  G.shots.push({ x: src.x, y: src.y, tx, ty, life: heavy ? 0.25 : 0.12, heavy, team: src.team });
  damage(tgt, src.dps * 0.55, src);
  if (Math.random() < 0.5) beep(heavy ? 120 : 900, heavy ? 0.12 : 0.04, heavy ? 'sawtooth' : 'square', 0.025, heavy ? 50 : 300);
}
function moveToward(u, x, y, dt, stopAt) {
  const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy);
  if (d <= stopAt) return true;
  const sp = Math.min(d, u.speed * dt);
  u.x += dx / d * sp; u.y += dy / d * sp; u.face = Math.atan2(dy, dx);
  return false;
}

function updateUnit(u, dt) {
  const U = UNITS[u.type];
  if (u.hit > 0) u.hit -= dt;
  const team = u.team;
  if (U.harvester) {
    if (u.state === 'manual') { if (u.order && moveToward(u, u.tx, u.ty, dt, 4)) { u.order = null; u.state = 'idle'; } return; }
    const depots = G.bldgs.filter(b => !b.dead && b.team === team && (b.type === 'supply' || b.type === 'cc') && b.progress >= 1);
    if (u.cargo >= U.cargo || (u.state === 'return')) {
      u.state = 'return';
      const depot = depots.sort((a, b) => dist(a, u) - dist(b, u))[0];
      if (!depot) { u.state = 'idle'; return; }
      if (moveToward(u, depot.x, depot.y + depot.h / 2 + 14, dt, 6)) { const v = u.cargo; u.cargo = 0; G.credits[team] += v; if (team === 'blue') G.floats.push({ x: u.x, y: u.y - 14, text: '+' + v, life: 0.9, color: '#fde047' }); u.state = 'idle'; }
      return;
    }
    if (!u.pile || u.pile.amount <= 0) { u.pile = G.piles.filter(p => p.amount > 0).sort((a, b) => dist(a, u) - dist(b, u))[0] || null; if (!u.pile) { u.state = 'idle'; return; } }
    u.state = 'gather';
    if (moveToward(u, u.pile.x, u.pile.y, dt, 26)) { const take = Math.min(60 * dt, u.pile.amount, U.cargo - u.cargo); u.cargo += take; u.pile.amount -= take; }
    return;
  }
  if (U.builder) {
    if (u.build) {
      const b = u.build;
      if (b.dead || b.progress >= 1) { u.build = null; return; }
      if (moveToward(u, b.x, b.y + b.h / 2 + 18, dt, 8)) {
        b.progress = Math.min(1, b.progress + dt / BUILDINGS[b.type].time);
        b.hp = Math.max(b.hp, b.maxHp * b.progress);
        if (b.progress >= 1) { u.build = null; if (team === 'blue') { G.stats.built++; toast(BUILDINGS[b.type].name + ' complete', 1.3); beep(660, 0.2, 'triangle', 0.05); G.panelDirty = true; } const pend = G.bldgs.find(o => !o.dead && o.team === team && o.progress < 1 && !G.units.some(d => d.build === o)); if (pend) u.build = pend; }
      }
      return;
    }
    if (u.order === 'move' && moveToward(u, u.tx, u.ty, dt, 4)) u.order = null;
    return;
  }
  // combat units
  if (u.order === 'attack') {
    if (!u.target || u.target.dead) { u.order = null; u.target = null; return; }
    // While marching on a building, shoot back at any enemy unit already in range.
    if (u.target.kind === 'bldg') {
      let foe = null, bd = u.range * u.range;
      for (const e of G.units) { if (e.dead || e.team === team || e.dps <= 0) continue; const d2 = (e.x - u.x) ** 2 + (e.y - u.y) ** 2; if (d2 < bd) { bd = d2; foe = e; } }
      if (foe) { fireAt(u, foe, dt); return; }
    }
    if (edgeDist(u, u.target) > u.range) moveToward(u, u.target.x, u.target.y, dt, u.range - 4);
    else fireAt(u, u.target, dt);
    return;
  }
  const aggro = u.order === 'move' ? 0 : u.range * 1.4 + 40;
  let foe = aggro > 0 ? nearestEnemy(u, aggro, team) : null;
  if (foe) {
    if (edgeDist(u, foe) > u.range) moveToward(u, foe.x, foe.y, dt, u.range - 4);
    else fireAt(u, foe, dt);
    return;
  }
  if (u.order === 'move' || u.order === 'amove') { if (moveToward(u, u.tx, u.ty, dt, 4)) u.order = null; }
}

function updateBuilding(b, dt) {
  if (b.hit > 0) b.hit -= dt;
  if (b.progress < 1) return;
  if (b.queue.length) {
    const type = b.queue[0];
    let time = UNITS[type].time; if (b.team === 'blue' && gen() === 'infantry' && !UNITS[type].vehicle) time *= 0.5;
    b.prodT += dt;
    if (b.prodT >= time) {
      b.prodT = 0; b.queue.shift();
      const u = mkUnit(b.team, type, b.x + (Math.random() - 0.5) * 30, b.y + (b.team === 'blue' ? b.h / 2 + 16 : b.h / 2 + 16));
      if (b.team === 'blue') { G.stats.trained++; G.panelDirty = true; orderMove([u], b.x, b.y + b.h / 2 + 60 - (type === 'harvester' ? 0 : 0), false); if (UNITS[type].harvester) u.state = 'idle', u.order = null; }
      else orderMove([u], 500 + (Math.random() - 0.5) * 200, 470, true);
    }
  }
  if (b.range) {
    const foe = nearestEnemy(b, b.range, b.team);
    if (foe) { b.aim = Math.atan2(foe.y - b.y, foe.x - b.x); fireAt(b, foe, dt); }
  }
}

function updateAI(dt) {
  const ai = G.ai; ai.t += dt; ai.waveT -= dt;
  G.credits.red += ai.income * dt;
  if (ai.t < 1) return; ai.t = 0;
  const mine = own('red');
  const harvesters = mine.units.filter(u => UNITS[u.type].harvester).length;
  const supply = mine.bldgs.find(b => b.type === 'supply' && b.queue.length === 0 && b.progress >= 1);
  if (harvesters < 2 && supply) queueUnit(supply, 'harvester');
  const barracks = mine.bldgs.filter(b => b.type === 'barracks' && b.progress >= 1 && b.queue.length < 1);
  const factory = mine.bldgs.filter(b => b.type === 'factory' && b.progress >= 1 && b.queue.length < 1);
  const army = mine.units.filter(u => u.dps > 0);
  const cap = 6 + L.n * 3;
  if (army.length + mine.bldgs.reduce((a, b) => a + b.queue.length, 0) < cap) {
    ai.mix++;
    if (factory.length && ai.mix % 3 === 0) queueUnit(factory[0], Math.random() < 0.7 ? 'tank' : 'buggy');
    else if (barracks.length) queueUnit(barracks[ai.mix % barracks.length], Math.random() < 0.55 ? 'rifle' : 'rocket');
  }
  if (ai.waveT <= 0 || army.filter(u => !u.order).length >= ai.waveSize) {
    const idle = army.filter(u => !u.order || u.order === 'amove');
    if (idle.length >= Math.min(ai.waveSize, 3)) {
      const target = own('blue').bldgs.sort((a, b) => (a.type === 'cc' ? 1 : 0) - (b.type === 'cc' ? 1 : 0))[0];
      if (target) { orderMove(idle, target.x, target.y - 60, true); ai.waveSize += 1; }
    }
    ai.waveT = Math.max(45, 90 - L.n * 5);
  }
}

function update(dt) {
  G.t += dt;
  G.shake = Math.max(0, G.shake - dt * 3);
  for (const u of G.units) if (!u.dead) updateUnit(u, dt);
  for (const b of G.bldgs) if (!b.dead) updateBuilding(b, dt);
  updateAI(dt);
  // separation & building collision
  const us = G.units.filter(alive);
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    for (let j = i + 1; j < us.length; j++) {
      const b = us[j]; const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, md = a.r + b.r + 2;
      if (d2 < md * md && d2 > 0.01) { const d = Math.sqrt(d2), push = (md - d) / 2; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; }
      else if (d2 <= 0.01) { a.x += Math.random() - 0.5; a.y += Math.random() - 0.5; }
    }
    for (const bl of G.bldgs) {
      if (bl.dead) continue; const rc = rectOf(bl);
      if (!circleRect(a.x, a.y, a.r, rc)) continue;
      const pl = a.x + a.r - rc.x, pr = rc.x + rc.w - (a.x - a.r), pt = a.y + a.r - rc.y, pb = rc.y + rc.h - (a.y - a.r);
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) a.x = rc.x - a.r; else if (m === pr) a.x = rc.x + rc.w + a.r; else if (m === pt) a.y = rc.y - a.r; else a.y = rc.y + rc.h + a.r;
    }
    a.x = clamp(a.x, 8, MW - 8); a.y = clamp(a.y, 8, MH - 8);
  }
  G.units = G.units.filter(alive); G.bldgs = G.bldgs.filter(alive);
  G.sel = G.sel.filter(id => G.units.some(u => u.id === id) || G.bldgs.some(b => b.id === id));
  for (let i = G.shots.length - 1; i >= 0; i--) { G.shots[i].life -= dt; if (G.shots[i].life <= 0) G.shots.splice(i, 1); }
  for (let i = G.parts.length - 1; i >= 0; i--) { const p = G.parts[i]; p.life -= dt; if (p.life <= 0) { G.parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; }
  for (let i = G.floats.length - 1; i >= 0; i--) { const f = G.floats[i]; f.life -= dt; f.y -= 25 * dt; if (f.life <= 0) G.floats.splice(i, 1); }
  for (let i = G.toasts.length - 1; i >= 0; i--) { G.toasts[i].t -= dt; if (G.toasts[i].t <= 0) G.toasts.splice(i, 1); }
  if (!G.bldgs.some(b => b.team === 'blue' && b.type === 'cc')) endLevel(false);
  else if (!G.bldgs.some(b => b.team === 'red')) endLevel(true);
}
function boom(x, y, r) {
  for (let i = 0; i < Math.min(50, r * 1.5); i++) { const a = Math.random() * TAU, v = 30 + Math.random() * r * 6; G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.4, r: 1.5 + Math.random() * 3, color: i % 3 === 0 ? '#fde047' : i % 3 === 1 ? '#fb923c' : '#475569' }); }
}
function toast(msg, t) { G.toasts.push({ msg, t: t || 1.5, max: t || 1.5 }); }
function endLevel(win) {
  G.state = win ? 'win' : 'lose';
  if (win) { save.wins++; save.level = L.n + 1; save.best = Math.max(save.best, L.n + 1); }
  persist();
  beep(win ? 660 : 110, 0.6, win ? 'triangle' : 'sawtooth', 0.07);
  showEnd(win);
}

// ---------- rendering ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('wrap');
let scale = 1;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  const cw = Math.round(W * scale), ch = Math.round(H * scale);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px'; wrap.style.setProperty('--u', scale + 'px');
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
}
window.addEventListener('resize', resize); resize();
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const TEAM = { blue: { main: '#3b82f6', dark: '#1e3a8a', light: '#93c5fd' }, red: { main: '#ef4444', dark: '#7f1d1d', light: '#fca5a5' } };

function drawBuilding(b) {
  const B = BUILDINGS[b.type], T = TEAM[b.team], rc = rectOf(b);
  const col = b.hit > 0 ? '#fff' : B.color;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(ctx, rc.x + 4, rc.y + 6, rc.w, rc.h, 8); ctx.fill();
  ctx.fillStyle = '#334155'; roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 8); ctx.fill();
  ctx.fillStyle = col; roundRect(ctx, rc.x + 4, rc.y + 4, rc.w - 8, rc.h - 8, 6); ctx.fill();
  ctx.fillStyle = T.main; ctx.fillRect(rc.x + 4, rc.y + 4, rc.w - 8, 6);
  if (b.type === 'cc') { ctx.fillStyle = '#1e293b'; roundRect(ctx, b.x - 22, b.y - 18, 44, 30, 5); ctx.fill(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y - 2, 12, 0, TAU); ctx.stroke(); ctx.fillStyle = '#e2e8f0'; ctx.fillRect(b.x - 1, b.y - 16, 2, 14); }
  else if (b.type === 'supply') { ctx.fillStyle = '#854d0e'; for (let i = 0; i < 3; i++) { ctx.fillRect(b.x - 26 + i * 18, b.y - 6, 14, 18); } ctx.fillStyle = '#fde68a'; ctx.fillRect(b.x - 30, b.y - 12, 60, 4); }
  else if (b.type === 'barracks') { ctx.fillStyle = '#14532d'; roundRect(ctx, b.x - 24, b.y - 10, 48, 26, 4); ctx.fill(); ctx.fillStyle = '#86efac'; ctx.fillRect(b.x - 4, b.y - 2, 8, 18); }
  else if (b.type === 'factory') { ctx.fillStyle = '#3b0764'; roundRect(ctx, b.x - 36, b.y - 12, 72, 30, 4); ctx.fill(); ctx.fillStyle = '#c4b5fd'; ctx.fillRect(b.x - 30, b.y - 24, 10, 14); ctx.fillRect(b.x - 14, b.y - 24, 10, 14); ctx.fillStyle = '#1e1b4b'; ctx.fillRect(b.x - 12, b.y + 2, 24, 14); }
  else if (b.type === 'turret') { ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(b.x, b.y, 14, 0, TAU); ctx.fill(); ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.aim); ctx.fillStyle = '#9ca3af'; ctx.fillRect(0, -4, 26, 8); ctx.restore(); ctx.fillStyle = T.main; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, TAU); ctx.fill(); }
  if (b.progress < 1) {
    ctx.fillStyle = 'rgba(15,23,42,0.6)'; ctx.fillRect(rc.x, rc.y, rc.w, rc.h * (1 - b.progress));
    ctx.fillStyle = '#fde047'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(Math.round(b.progress * 100) + '%', b.x, b.y);
  }
  if (b.queue.length && b.team === 'blue') {
    const time = UNITS[b.queue[0]].time * (gen() === 'infantry' && !UNITS[b.queue[0]].vehicle ? 0.5 : 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(rc.x, rc.y + rc.h + 3, rc.w, 5); ctx.fillStyle = '#38bdf8'; ctx.fillRect(rc.x, rc.y + rc.h + 3, rc.w * clamp(b.prodT / time, 0, 1), 5);
  }
  if (b.hp < b.maxHp || G.sel.includes(b.id)) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(rc.x, rc.y - 8, rc.w, 5); ctx.fillStyle = b.hp / b.maxHp > 0.5 ? '#4ade80' : '#f87171'; ctx.fillRect(rc.x, rc.y - 8, rc.w * clamp(b.hp / b.maxHp, 0, 1), 5);
  }
  if (G.sel.includes(b.id)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); roundRect(ctx, rc.x - 4, rc.y - 4, rc.w + 8, rc.h + 8, 10); ctx.stroke(); ctx.setLineDash([]); }
}
function drawUnit(u) {
  const U = UNITS[u.type], T = TEAM[u.team], hit = u.hit > 0;
  const sel = G.sel.includes(u.id);
  if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 5, 0, TAU); ctx.stroke(); }
  ctx.save(); ctx.translate(u.x, u.y);
  if (U.vehicle) {
    ctx.rotate(u.face + Math.PI / 2);
    const w = u.r * 1.6, h = u.r * 2.2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(ctx, -w / 2 + 2, -h / 2 + 3, w, h, 4); ctx.fill();
    ctx.fillStyle = hit ? '#fff' : (U.builder ? '#eab308' : U.harvester ? '#f59e0b' : T.dark); roundRect(ctx, -w / 2, -h / 2, w, h, 4); ctx.fill();
    ctx.fillStyle = hit ? '#fff' : T.main; roundRect(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 3); ctx.fill();
    if (u.type === 'tank') { ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(0, 2, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#94a3b8'; ctx.fillRect(-2, -h / 2 - 8, 4, 16); }
    else if (u.type === 'buggy') { ctx.fillStyle = '#1e293b'; ctx.fillRect(-6, -2, 12, 6); ctx.fillStyle = '#fca5a5'; ctx.fillRect(-5, -h / 2 - 4, 3, 8); ctx.fillRect(2, -h / 2 - 4, 3, 8); }
    else if (u.type === 'harvester') { ctx.fillStyle = u.cargo > 0 ? '#a16207' : '#1e293b'; roundRect(ctx, -w / 2 + 3, -2, w - 6, h / 2 - 3, 2); ctx.fill(); }
    else if (u.type === 'dozer') { ctx.fillStyle = '#1e293b'; ctx.fillRect(-w / 2 - 2, -h / 2 - 5, w + 4, 5); }
    ctx.fillStyle = '#0f172a'; ctx.fillRect(-w / 2 - 2, -h / 2 + 2, 2, h - 4); ctx.fillRect(w / 2, -h / 2 + 2, 2, h - 4);
  } else {
    const k = Math.sin(G.t * 10 + u.ph) * (u.order || u.target ? 2 : 0);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(1, 6, 6, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = T.dark; ctx.fillRect(-4, 2 + k, 3, 5); ctx.fillRect(1, 2 - k, 3, 5);
    ctx.fillStyle = hit ? '#fff' : T.main; roundRect(ctx, -5, -5, 10, 9, 3); ctx.fill();
    ctx.fillStyle = hit ? '#fff' : (u.type === 'rocket' ? '#1e293b' : T.dark); ctx.beginPath(); ctx.arc(0, -8, 4, 0, TAU); ctx.fill();
    ctx.save(); ctx.rotate(u.face); ctx.fillStyle = '#111827'; ctx.fillRect(2, -1, u.type === 'rocket' ? 12 : 9, 2); ctx.restore();
  }
  ctx.restore();
  if (u.hp < u.maxHp || sel) { const w = u.r * 2.4; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(u.x - w / 2, u.y - u.r - 9, w, 3); ctx.fillStyle = u.hp / u.maxHp > 0.5 ? '#4ade80' : '#f87171'; ctx.fillRect(u.x - w / 2, u.y - u.r - 9, w * clamp(u.hp / u.maxHp, 0, 1), 3); }
}

function draw() {
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, VIEW_H); ctx.clip();
  if (G.shake > 0) ctx.translate((Math.random() - 0.5) * G.shake * 8, (Math.random() - 0.5) * G.shake * 8);
  ctx.translate(-G.cam.x, -G.cam.y);
  // terrain
  ctx.fillStyle = '#b7a06a'; ctx.fillRect(G.cam.x - 10, G.cam.y - 10, W + 20, VIEW_H + 20);
  const x0 = Math.floor(G.cam.x / 80) * 80, y0 = Math.floor(G.cam.y / 80) * 80;
  for (let y = y0; y < G.cam.y + VIEW_H; y += 80) for (let x = x0; x < G.cam.x + W; x += 80) { if (((x / 80 + y / 80) % 2 + 2) % 2 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.04)'; ctx.fillRect(x, y, 80, 80); } }
  ctx.fillStyle = '#9a8657'; for (let i = 0; i < 24; i++) { const rx = (i * 173) % MW, ry = (i * 389) % MH; if (rx > G.cam.x - 40 && rx < G.cam.x + W + 40 && ry > G.cam.y - 40 && ry < G.cam.y + VIEW_H + 40) { ctx.beginPath(); ctx.ellipse(rx, ry, 18 + (i % 3) * 8, 9 + (i % 2) * 5, i, 0, TAU); ctx.fill(); } }
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(MW, 0); ctx.lineTo(MW, MH); ctx.lineTo(0, MH); ctx.closePath(); ctx.stroke();
  // piles
  for (const p of G.piles) {
    if (p.amount <= 0) continue;
    const s = 0.5 + 0.5 * p.amount / p.max;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 4, 26 * s, 14 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#92400e'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 26 * s, 14 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fbbf24'; for (let i = 0; i < 5; i++) { ctx.fillRect(p.x - 18 * s + i * 8 * s, p.y - 8 * s - (i % 2) * 5 * s, 6 * s, 10 * s); }
  }
  // build range when placing
  if (G.placing) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5; for (const b of G.bldgs) if (b.team === 'blue') { ctx.beginPath(); ctx.arc(b.x, b.y, BUILD_RANGE, 0, TAU); ctx.stroke(); } ctx.setLineDash([]); }
  for (const b of G.bldgs) drawBuilding(b);
  // orders
  for (const id of G.sel) { const u = G.units.find(x => x.id === id); if (u && u.order && u.tx != null && u.kind === 'unit') { ctx.strokeStyle = u.order === 'amove' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.tx, u.ty); ctx.stroke(); ctx.setLineDash([]); } }
  for (const u of G.units) if (!UNITS[u.type].vehicle) drawUnit(u);
  for (const u of G.units) if (UNITS[u.type].vehicle) drawUnit(u);
  for (const s of G.shots) { ctx.strokeStyle = s.heavy ? 'rgba(253,224,71,0.9)' : (s.team === 'blue' ? 'rgba(191,219,254,0.9)' : 'rgba(254,202,202,0.9)'); ctx.lineWidth = s.heavy ? 3 : 1.2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.tx, s.ty); ctx.stroke(); if (s.heavy) { ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.arc(s.tx, s.ty, 5 * (s.life / 0.25), 0, TAU); ctx.fill(); } }
  for (const p of G.parts) { ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const f of G.floats) { ctx.globalAlpha = clamp(f.life, 0, 1); ctx.fillStyle = f.color; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.text, f.x, f.y); }
  ctx.globalAlpha = 1;
  // placement ghost
  if (G.placing && G.ghost) {
    const B = BUILDINGS[G.placing], err = placementError(G.placing, G.ghost.x, G.ghost.y);
    ctx.fillStyle = err ? 'rgba(239,68,68,0.45)' : 'rgba(74,222,128,0.45)'; roundRect(ctx, G.ghost.x - B.w / 2, G.ghost.y - B.h / 2, B.w, B.h, 8); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(err || B.name, G.ghost.x, G.ghost.y - B.h / 2 - 12);
  }
  ctx.restore();

  // HUD
  ctx.fillStyle = 'rgba(2,6,23,0.7)'; roundRect(ctx, 8, 8, 236, 34, 10); ctx.fill();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047'; ctx.font = 'bold 17px system-ui, sans-serif'; ctx.fillText('$ ' + Math.floor(G.credits.blue).toLocaleString(), 18, 25);
  if (L) { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillText('LVL ' + L.n + '  ·  ' + GENERALS[gen()].icon + ' ' + GENERALS[gen()].title, 120, 25); }
  // minimap
  const mm = { x: W - 108, y: 8, w: 100, h: 150 };
  ctx.fillStyle = 'rgba(2,6,23,0.75)'; roundRect(ctx, mm.x - 3, mm.y - 3, mm.w + 6, mm.h + 6, 8); ctx.fill();
  ctx.fillStyle = '#b7a06a'; ctx.fillRect(mm.x, mm.y, mm.w, mm.h);
  const sx = mm.w / MW, sy = mm.h / MH;
  for (const p of G.piles) if (p.amount > 0) { ctx.fillStyle = '#fbbf24'; ctx.fillRect(mm.x + p.x * sx - 2, mm.y + p.y * sy - 1, 4, 3); }
  for (const b of G.bldgs) { ctx.fillStyle = TEAM[b.team].main; ctx.fillRect(mm.x + (b.x - b.w / 2) * sx, mm.y + (b.y - b.h / 2) * sy, Math.max(3, b.w * sx), Math.max(3, b.h * sy)); }
  for (const u of G.units) { ctx.fillStyle = TEAM[u.team].light; ctx.fillRect(mm.x + u.x * sx - 1, mm.y + u.y * sy - 1, 2, 2); }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(mm.x + G.cam.x * sx, mm.y + G.cam.y * sy, W * sx, VIEW_H * sy);
  // toasts
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  G.toasts.forEach((t, i) => {
    const a = clamp(t.t * 2, 0, 1) * clamp((t.max - t.t) * 4, 0, 1);
    ctx.globalAlpha = a; ctx.font = 'bold 16px system-ui, sans-serif';
    const tw = Math.max(200, ctx.measureText(t.msg).width + 30);
    ctx.fillStyle = 'rgba(2,6,23,0.7)'; roundRect(ctx, W / 2 - tw / 2, 200 + i * 34 - 15, tw, 30, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(t.msg, W / 2, 200 + i * 34);
  });
  ctx.globalAlpha = 1;
  // selection summary
  const su = selectedUnits();
  if (su.length) { ctx.fillStyle = 'rgba(2,6,23,0.7)'; roundRect(ctx, 8, VIEW_H - 30, 170, 24, 8); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(su.length + ' selected · tap ground to move, enemy to attack', 16, VIEW_H - 18); }
}
function placementError(type, x, y) {
  const B = BUILDINGS[type], rc = { x: x - B.w / 2, y: y - B.h / 2, w: B.w, h: B.h };
  if (rc.x < 10 || rc.y < 10 || rc.x + rc.w > MW - 10 || rc.y + rc.h > MH - 10) return 'Out of bounds';
  for (const o of G.bldgs) if (!o.dead && rectsOverlap(rc, rectOf(o), 10)) return 'Too close to a building';
  for (const p of G.piles) if (p.amount > 0 && circleRect(p.x, p.y, 30, rc)) return 'On top of supplies';
  if (!G.bldgs.some(o => !o.dead && o.team === 'blue' && dist(o, { x, y }) < BUILD_RANGE)) return 'Too far from base';
  if (G.credits.blue < bldgCost(type, 'blue')) return 'Not enough credits';
  return null;
}

// ---------- panel (DOM) ----------
const panel = document.getElementById('panel');
function renderPanel() {
  G.panelDirty = false;
  if (!panel || G.state !== 'play') return;
  const sel = selected(), su = sel.filter(e => e.kind === 'unit'), sb = sel.find(e => e.kind === 'bldg');
  let html = '';
  if (G.placing) {
    const B = BUILDINGS[G.placing], err = G.ghost ? placementError(G.placing, G.ghost.x, G.ghost.y) : 'Tap the map to position';
    html = `<div class="ptitle">Placing ${B.name} · $${bldgCost(G.placing, 'blue')}</div><div class="pmsg">${err || 'Ready to build'}</div><div class="prow"><button class="pb ok" data-act="confirm" ${err ? 'disabled' : ''}>BUILD HERE</button><button class="pb" data-act="cancel">CANCEL</button></div>`;
  } else if (sb && sb.team === 'blue' && BUILDINGS[sb.type].builds) {
    html = `<div class="ptitle">${BUILDINGS[sb.type].name}${sb.progress < 1 ? ' (under construction)' : ''}</div><div class="prow">`;
    for (const t of BUILDINGS[sb.type].builds) { const U = UNITS[t], n = sb.queue.filter(q => q === t).length; html += `<button class="pb" data-train="${t}" ${sb.progress < 1 || G.credits.blue < unitCost(t, 'blue') ? 'disabled' : ''}><b>${U.name}</b><span>$${unitCost(t, 'blue')}${n ? ' · ×' + n : ''}</span></button>`; }
    html += `<button class="pb" data-act="army">SELECT ARMY</button></div>`;
  } else if (sb) {
    html = `<div class="ptitle">${BUILDINGS[sb.type].name}</div><div class="prow"><button class="pb" data-act="army">SELECT ARMY</button></div>`;
  } else {
    const hasDozer = own('blue').units.some(u => UNITS[u.type].builder);
    html = `<div class="ptitle">${su.length ? su.length + ' unit' + (su.length > 1 ? 's' : '') + ' selected' : 'Build (needs a Dozer)'}</div><div class="prow">`;
    if (!su.length || su.some(u => UNITS[u.type].builder)) {
      for (const t of ['supply', 'barracks', 'factory', 'turret']) { const B = BUILDINGS[t]; html += `<button class="pb" data-build="${t}" ${!hasDozer || G.credits.blue < bldgCost(t, 'blue') ? 'disabled' : ''}><b>${B.name}</b><span>$${bldgCost(t, 'blue')}</span></button>`; }
    }
    if (su.length) html += `<button class="pb" data-act="stop">STOP</button>`;
    html += `<button class="pb" data-act="army">SELECT ARMY</button>${su.length ? '<button class="pb" data-act="clear">DESELECT</button>' : ''}</div>`;
  }
  panel.innerHTML = html;
}
panel && panel.addEventListener('pointerdown', e => {
  const b = e.target.closest('button'); if (!b || b.disabled || G.state !== 'play') return;
  e.preventDefault(); e.stopPropagation();
  if (b.dataset.build) { G.placing = b.dataset.build; G.ghost = null; G.sel = []; }
  else if (b.dataset.train) { const sb = selected().find(x => x.kind === 'bldg'); if (sb && queueUnit(sb, b.dataset.train)) beep(600, 0.08, 'triangle', 0.04); }
  else if (b.dataset.act === 'confirm') { const err = placeBuilding(G.placing, G.ghost.x, G.ghost.y, 'blue'); if (err) toast(err, 1.2); else { beep(500, 0.1, 'triangle', 0.05); G.placing = null; G.ghost = null; } }
  else if (b.dataset.act === 'cancel') { G.placing = null; G.ghost = null; }
  else if (b.dataset.act === 'army') selectArmy();
  else if (b.dataset.act === 'stop') { for (const u of selectedUnits()) { u.order = null; u.target = null; if (UNITS[u.type].harvester) u.state = 'idle'; } }
  else if (b.dataset.act === 'clear') G.sel = [];
  G.panelDirty = true;
});

// ---------- input ----------
let press = null;
function pointerPos(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
canvas.addEventListener('pointerdown', e => {
  if (!AC) beep(1, 0.01, 'sine', 0.0001);
  if (G.state !== 'play') return;
  const p = pointerPos(e); press = { x: p.x, y: p.y, cx: G.cam.x, cy: G.cam.y, moved: false, id: e.pointerId };
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
canvas.addEventListener('pointermove', e => {
  if (!press || G.state !== 'play') return;
  const p = pointerPos(e);
  if (!press.moved && Math.hypot(p.x - press.x, p.y - press.y) > 8) press.moved = true;
  if (press.moved) { G.cam.x = clamp(press.cx - (p.x - press.x), 0, MW - W); G.cam.y = clamp(press.cy - (p.y - press.y), 0, MH - VIEW_H); }
});
canvas.addEventListener('pointerup', e => {
  if (!press) return;
  const p = pointerPos(e), moved = press.moved; press = null;
  if (moved || G.state !== 'play') return;
  tap(p.x, p.y);
});
canvas.addEventListener('pointercancel', () => { press = null; });
function tap(sx, sy) {
  const mm = { x: W - 108, y: 8, w: 100, h: 150 };
  if (sx >= mm.x && sx <= mm.x + mm.w && sy >= mm.y && sy <= mm.y + mm.h) {
    G.cam.x = clamp((sx - mm.x) / mm.w * MW - W / 2, 0, MW - W); G.cam.y = clamp((sy - mm.y) / mm.h * MH - VIEW_H / 2, 0, MH - VIEW_H); return;
  }
  if (sy > VIEW_H) return;
  const wx = sx + G.cam.x, wy = sy + G.cam.y;
  if (G.placing) { G.ghost = { x: wx, y: wy }; G.panelDirty = true; return; }
  let hitU = null, hd = 22;
  for (const u of G.units) { const d = dist(u, { x: wx, y: wy }); if (d < u.r + 10 && d < hd) { hd = d; hitU = u; } }
  const hitB = hitU ? null : G.bldgs.find(b => circleRect(wx, wy, 1, rectOf(b)));
  const su = selectedUnits();
  if (hitU && hitU.team === 'blue') { G.sel = G.sel.includes(hitU.id) && su.length === 1 ? [] : [hitU.id]; beep(700, 0.04, 'triangle', 0.02); }
  else if (hitB && hitB.team === 'blue') { G.sel = [hitB.id]; beep(500, 0.04, 'triangle', 0.02); }
  else if ((hitU || hitB) && su.length) { orderAttack(su, hitU || hitB); beep(300, 0.06, 'square', 0.03); }
  else if (su.length) { orderMove(su, wx, wy, true); beep(420, 0.05, 'square', 0.025); }
  else G.sel = [];
  G.panelDirty = true;
}
window.addEventListener('keydown', e => {
  if (G.state !== 'play') return;
  if (e.key === 'Escape') { G.placing = null; G.ghost = null; G.sel = []; G.panelDirty = true; }
  if (e.key === 'a' || e.key === 'A') selectArmy();
  const sp = 40;
  if (e.key === 'ArrowLeft') G.cam.x = clamp(G.cam.x - sp, 0, MW - W); if (e.key === 'ArrowRight') G.cam.x = clamp(G.cam.x + sp, 0, MW - W);
  if (e.key === 'ArrowUp') G.cam.y = clamp(G.cam.y - sp, 0, MH - VIEW_H); if (e.key === 'ArrowDown') G.cam.y = clamp(G.cam.y + sp, 0, MH - VIEW_H);
});

// ---------- screens ----------
const $ = id => document.getElementById(id);
function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id)); if (panel) panel.classList.toggle('hidden', G.state !== 'play'); }
function showMenu() {
  G.state = 'menu';
  $('menu-level').textContent = 'DEPLOY  ·  LEVEL ' + save.level;
  $('menu-best').textContent = save.wins > 0 ? save.wins + ' victories  ·  best level ' + (save.best - 1) + ' cleared' : 'Build. Harvest. Crush the enemy base.';
  $('btn-sound').textContent = save.sound ? '🔊 Sound on' : '🔇 Sound off';
  let html = '';
  for (const k in GENERALS) { const g = GENERALS[k]; html += `<button class="gen ${save.general === k ? 'sel' : ''}" data-gen="${k}"><span class="gi">${g.icon}</span><b>${g.title}</b><span>${g.desc}</span></button>`; }
  $('generals').innerHTML = html;
  showScreen('menu');
}
$('generals').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; save.general = b.dataset.gen; persist(); showMenu(); beep(600, 0.06, 'triangle', 0.04); });
function showEnd(win) {
  $('end-title').textContent = win ? 'VICTORY' : 'BASE LOST';
  $('end-title').className = win ? 'win' : 'lose';
  $('end-sub').textContent = win ? 'Level ' + L.n + ' — enemy base destroyed in ' + Math.round(G.t) + 's' : 'Your Command Center fell on level ' + L.n;
  $('end-stats').innerHTML = `<div><b>${G.stats.kills}</b><span>enemies destroyed</span></div><div><b>${G.stats.trained}</b><span>units trained</span></div><div><b>${G.stats.lost}</b><span>units lost</span></div>`;
  $('btn-next').textContent = win ? 'NEXT LEVEL ▶' : 'RETRY ↻';
  const text = win ? `${GENERALS[gen()].name} crushed the enemy base on level ${L.n} of Steel Command in ${Math.round(G.t)}s! ⚙️🪖 Can you do it faster?` : `My base fell on level ${L.n} of Steel Command. ⚙️🪖 Think you can command better?`;
  $('btn-share').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(SITE_URL) + '&hashtags=SteelCommand';
  showScreen('end');
}
$('btn-play').addEventListener('click', () => startLevel(save.level));
$('btn-howto').addEventListener('click', () => $('howto').classList.toggle('hidden'));
$('btn-sound').addEventListener('click', () => { save.sound = !save.sound; persist(); $('btn-sound').textContent = save.sound ? '🔊 Sound on' : '🔇 Sound off'; });
$('btn-next').addEventListener('click', () => startLevel(save.level));
$('btn-end-menu').addEventListener('click', showMenu);
$('btn-reset').addEventListener('click', () => { if (!confirm('Reset all progress?')) return; try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } location.reload(); });

// ---------- main loop ----------
let last = performance.now(), panelT = 0;
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  if (G.state === 'play') {
    update(dt);
    panelT += dt;
    if (G.panelDirty || panelT > 0.5) { panelT = 0; renderPanel(); }
  }
  draw();
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { last = performance.now(); });
showMenu();
requestAnimationFrame(frame);

window.SteelCommand = { G, save, startLevel, update, draw, placeBuilding, queueUnit, orderMove, orderAttack, selectArmy, own, UNITS, BUILDINGS, GENERALS, get level() { return L; } };
})();

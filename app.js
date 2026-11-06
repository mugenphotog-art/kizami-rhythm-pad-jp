'use strict';
const $ = (id) => document.getElementById(id);

const LANE = {
  kick: ['ロングキック', '#ff6a3d'], kick_punch: ['キック', '#ff6a3d'], snare: ['スネア', '#f2c14e'], clap: ['クラップ', '#e86aa8'],
  hat_closed: ['ハイハット', '#3dd6c6'], hat_open: ['オープンハット', '#5aa9ff'], sub: ['サブ808', '#a58bff'], dive: ['ダイブ', '#a58bff'], bass: ['プラックベース', '#7a6bff'],
  tom_low: ['ロータム', '#8bd450'], tom_high: ['ハイタム', '#6fc2a0'], shaker: ['シェイカー', '#d8d36a'], clave: ['クラベス', '#e0915a'], conga: ['コンガ', '#e8c4ff'], snap: ['スナップ', '#7fd0e8'], rim: ['リム', '#ffb347'], cowbell: ['カウベル', '#c9a227'],
};
const GENRE = { trap: 'トラップ', drill: 'ドリル', boombap: 'ブームバップ', perc: 'パーカッション', house: 'ハウス', techno: 'テクノ' };
// 横3 × 縦6。上が高い音、下が低い音。上3つが高い音、中の9つが中くらいの音（上から金属・木の小物／手拍子系／皮もの）、下の6つが低い音。[ジャンル, 音]
const PADS = [
  ['perc', 'shaker'], ['trap', 'hat_closed'], ['trap', 'hat_open'],     // 高い音: ハット・シェイカー
  ['perc', 'clave'], ['perc', 'cowbell'], ['perc', 'rim'],               // 中の上: 金属・木の小物
  ['perc', 'snap'], ['trap', 'clap'], ['house', 'clap'],                 // 中: 手拍子系
  ['perc', 'tom_high'], ['perc', 'conga'], ['trap', 'snare'],            // 中の下: 皮もの
  ['perc', 'tom_low'], ['perc', 'kick_punch'], ['house', 'kick'],        // 低い音: 低いタムとキック
  ['perc', 'dive'], ['perc', 'bass'], ['trap', 'sub'],                   // 低い音: 低域のシンセ（ダイブ・ベース・808）
];
// 同時に鳴らさない組。ハットは閉が開を止める、サブは1音ずつ
const groupOf = (lane) => (lane === 'hat_closed' || lane === 'hat_open' ? 'hat' : lane === 'sub' || lane === 'dive' || lane === 'bass' ? 'sub' : null);

let ctx = null, master = null;
const buffers = new Array(PADS.length).fill(null);
const active = { hat: null, sub: null };

/* ---------- 音を鳴らす ---------- */
function fire(i, vel, when) {
  const buf = buffers[i];
  if (!buf) return;
  const lane = PADS[i][1], grp = groupOf(lane), t = Math.max(when, ctx.currentTime);
  if (grp && active[grp]) { try { active[grp].g.gain.setTargetAtTime(0, t, 0.005); active[grp].s.stop(t + 0.03); } catch (_) { /* 止まっている */ } }
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf; g.gain.value = vel;
  s.connect(g); g.connect(master); s.start(t);
  if (grp) { const me = { s, g }; active[grp] = me; s.onended = () => { if (active[grp] === me) active[grp] = null; }; }
}
function click(when, accent) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = accent ? 1600 : 1100;
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.25, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  o.connect(g); g.connect(master); o.start(when); o.stop(when + 0.06);
}

/* ---------- ループ ---------- */
const loop = { running: false, recording: false, start: 0, scheduled: 0, layers: [], cur: null };
const bpm = () => Math.min(200, Math.max(60, Number($('bpm').value) || 120));
const beat = () => 60 / bpm();
const loopLen = () => Number($('bars').value) * 4 * beat();
const lookahead = 0.12;

function pos() { return loop.running ? (((ctx.currentTime - loop.start) % loopLen()) + loopLen()) % loopLen() : 0; }

function tick() {
  if (!loop.running) return;
  const len = loopLen(), now = ctx.currentTime, until = now + lookahead;
  const k0 = Math.floor((loop.scheduled - loop.start) / len);
  for (let k = Math.max(0, k0); loop.start + k * len < until; k++) {
    const base = loop.start + k * len;
    for (const layer of loop.layers) for (const e of layer) {
      const at = base + e.t;
      if (at >= loop.scheduled && at < until) fire(e.pad, e.vel, at);
    }
    if ($('metro').checked) {
      for (let b = 0; b < Number($('bars').value) * 4; b++) {
        const at = base + b * beat();
        if (at >= loop.scheduled && at < until) click(at, b % 4 === 0);
      }
    }
  }
  loop.scheduled = until;
}
setInterval(tick, 25);

function startLoop() {
  loop.start = ctx.currentTime + 0.05; loop.scheduled = loop.start; loop.running = true;
  $('play').classList.add('on'); $('play').textContent = '■ 停止';
}
function stopLoop() {
  loop.running = false; stopRec();
  $('play').classList.remove('on'); $('play').textContent = '▶ 再生'; $('posbar').style.width = '0';
}
function startRec() {
  if (!loop.running) startLoop();
  loop.recording = true; loop.cur = []; loop.layers.push(loop.cur);
  $('rec').classList.add('on'); $('rec').textContent = '● 録音中';
  msg('録音中。叩いた音はループの今の位置に入ります');
}
function stopRec() {
  if (!loop.recording) return;
  loop.recording = false;
  if (loop.cur && loop.cur.length === 0) loop.layers.pop();   // 何も叩かなかった層は残さない
  loop.cur = null;
  $('rec').classList.remove('on'); $('rec').textContent = '● 録音';
  msg(loop.layers.length ? `${loop.layers.length}層。もう一度「録音」を押すと重ね録りできます` : '');
}
function record(i, vel, hitTime) {
  const len = loopLen();
  let t = (((hitTime - loop.start) % len) + len) % len;
  if ($('quant').checked) {
    const step = beat() / 4;                       // 16分音符
    t = (Math.round(t / step) * step) % len;
  }
  loop.cur.push({ t, pad: i, vel });
}

/* ---------- 書き出し ---------- */
// 録音したループを WAV にして保存する。ループの長さ＋余韻で描き、余韻は頭に重ねて、つないで再生しても切れ目が出ないようにする
const TAIL = 2;
async function renderLoop() {
  const len = loopLen(), sr = ctx.sampleRate, n = Math.ceil((len + TAIL) * sr);
  const off = new OfflineAudioContext(2, n, sr), out = off.createGain();
  out.gain.value = 0.9; out.connect(off.destination);
  const act = { hat: null, sub: null };
  const hits = loop.layers.flat().sort((a, b) => a.t - b.t);
  for (const e of hits) {
    const buf = buffers[e.pad]; if (!buf) continue;
    const grp = groupOf(PADS[e.pad][1]), s = off.createBufferSource(), g = off.createGain();
    if (grp && act[grp]) { act[grp].g.gain.setTargetAtTime(0, e.t, 0.005); act[grp].s.stop(e.t + 0.03); }   // ライブ再生と同じ止め方
    s.buffer = buf; g.gain.value = e.vel; s.connect(g); g.connect(out); s.start(e.t);
    if (grp) act[grp] = { s, g };
  }
  const r = await off.startRendering(), L = r.getChannelData(0), R = r.getChannelData(1), m = Math.floor(len * sr);
  for (let i = m; i < n && i - m < m; i++) { L[i - m] += L[i]; R[i - m] += R[i]; }
  return [L.subarray(0, m), R.subarray(0, m), sr];
}
function wavBlob(L, R, sr) {
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak > 0.98 ? 0.98 / peak : 1;                  // 重なりで割れないように、はみ出す時だけ下げる
  const dv = new DataView(new ArrayBuffer(44 + L.length * 4));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + L.length * 4, true); w(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, L.length * 4, true);
  const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * k * 32767)));
  for (let i = 0; i < L.length; i++) { dv.setInt16(44 + i * 4, q(L[i]), true); dv.setInt16(46 + i * 4, q(R[i]), true); }
  return new Blob([dv], { type: 'audio/wav' });
}
async function saveWav() {
  if (!loop.layers.length) { msg('先に何か録音してください'); return; }
  stopRec();
  $('save').disabled = true;
  try {
    const [L, R, sr] = await renderLoop();
    const url = URL.createObjectURL(wavBlob(L, R, sr)), a = document.createElement('a');
    a.href = url; a.download = `kizami-pad-jp-${bpm()}bpm-${$('bars').value}bar.wav`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    msg(`${a.download} を保存しました（${(L.length / sr).toFixed(1)}秒のループ）`);
  } catch (e) { msg('保存できませんでした: ' + e); }
  $('save').disabled = false;
}

/* ---------- パッド ---------- */
function build() {
  const box = $('pads');
  PADS.forEach(([g, lane], i) => {
    const el = document.createElement('div');
    el.className = 'pad'; el.style.setProperty('--c', LANE[lane][1]); el.dataset.i = i;
    el.innerHTML = `<b>${LANE[lane][0]}</b><small>${GENRE[g]}</small>`;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!ctx) return;
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* 合成イベントなど。鳴らす処理は続ける */ }
      const r = el.getBoundingClientRect();
      const vel = 1 - 0.5 * Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));   // 上ほど強く
      const now = ctx.currentTime;
      fire(i, vel, now);
      el.classList.add('on');
      if (loop.recording) record(i, vel, now);
    });
    const up = () => el.classList.remove('on');
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    box.appendChild(el);
  });
}
async function load() {
  await Promise.all(PADS.map(async ([g, lane], i) => {
    const r = await fetch(`samples/${g}-${lane}.wav`);
    const b = await ctx.decodeAudioData(await r.arrayBuffer());
    buffers[i] = lane === 'sub' ? withHarmonics(b) : b;
  }));
}
// Sub 808 は音のほぼ全部が100Hz未満で、スマホの小さなスピーカーでは鳴らない。
// 歪ませて3倍・5倍の高さの音（130Hz・220Hz付近）を足し、元の低音も残す（イヤホンでは従来どおり深く鳴る）
function withHarmonics(buf) {
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  const D = 10, MIX = 0.1;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c), y = out.getChannelData(c);
    let env = 0, peak = 0;
    for (let n = 0; n < x.length; n++) {
      env = Math.max(Math.abs(x[n]), env * 0.9995);                  // 音の大きさの外形（尾の減衰を保つため）
      const e = Math.max(env, 1e-4);
      y[n] = MIX * x[n] + (1 - MIX) * e * Math.tanh(D * x[n] / e);
      peak = Math.max(peak, Math.abs(y[n]));
    }
    const k = peak > 0 ? 0.89 / peak : 1;
    for (let n = 0; n < y.length; n++) y[n] *= k;
  }
  return out;
}

/* ---------- つなぎ ---------- */
let msgTimer = null;
function msg(t) { $('msg').textContent = t; clearTimeout(msgTimer); if (t) msgTimer = setTimeout(() => { $('msg').textContent = ''; }, 4000); }

function frame() {
  if (loop.running) $('posbar').style.width = (pos() / loopLen() * 100) + '%';
  requestAnimationFrame(frame);
}

async function begin() {
  $('startbtn').disabled = true; $('startbtn').textContent = '読み込み中…';
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  await ctx.resume();
  try { await load(); } catch (e) { msg('音の読み込みに失敗しました: ' + e); }
  $('start').classList.add('hide');
}

build();
$('startbtn').onclick = begin;
$('play').onclick = () => (loop.running ? stopLoop() : startLoop());
$('rec').onclick = () => (loop.recording ? stopRec() : startRec());
$('undo').onclick = () => {
  if (loop.recording) stopRec();
  if (loop.layers.pop()) msg(`取り消しました（残り${loop.layers.length}層）`);
};
$('save').onclick = saveWav;
$('clear').onclick =() => { stopRec(); loop.layers = []; msg('録音をすべて消しました'); };
['bpm', 'bars'].forEach((id) => $(id).addEventListener('change', () => {
  // 長さやテンポを変えると録音の位置がずれるので、録音は消す
  if (loop.layers.length) { loop.layers = []; stopRec(); msg('テンポか小節数を変えたので、録音を消しました'); }
  if (loop.running) { loop.start = ctx.currentTime + 0.05; loop.scheduled = loop.start; }
}));
document.addEventListener('contextmenu', (e) => e.preventDefault());
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
requestAnimationFrame(frame);

// Router multi-bot: semua bot memakai prefix yang sama (a!), tapi hanya SATU bot yang menjawab tiap pesan.
//
// Aturan:
//  1. Ada bot yang sudah di voice channel user (atau baru saja dipesan untuk channel itu)  -> bot itu yang jalan.
//  2. Command kontrol (skip, pause, queue, dst.) tanpa bot di channel user                -> bot yang sedang aktif di server
//     (supaya muncul pesan "masuk ke voice yang sama"), atau bot pertama.
//  3. Command panggil (play, join, 247) dan belum ada bot di channel user                 -> bot BEBAS pertama.
//     Bot dianggap sibuk kalau sedang tersambung dan memutar lagu / mode 24/7.
//  4. Semua bot sibuk                                                                     -> bot pertama membalas "semua bot dipakai".
const { PermissionFlagsBits } = require('discord.js');

const entries = new Map(); // botId -> { bot, client, music, store }  (urutan = prioritas)
const decisions = new Map(); // messageId -> keputusan (supaya semua bot memakai keputusan yang sama)
const reservations = new Map(); // `${guildId}:${botId}` -> { vcId, until }  (cegah 2 user rebutan bot yang sama)
const RESERVE_MS = 20000;

const register = (entry) => entries.set(entry.bot.id, entry);

const guildOf = (e, gid) => (e.client.isReady() ? e.client.guilds.cache.get(gid) : null);

function canSend(e, gid, channelId) {
  const g = guildOf(e, gid);
  if (!g) return false; // bot ini tidak ada di server tsb
  const me = g.members.me;
  const ch = g.channels.cache.get(channelId);
  if (!me || !ch) return true;
  return Boolean(ch.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages));
}

function reserved(e, gid) {
  const key = `${gid}:${e.bot.id}`;
  const r = reservations.get(key);
  if (!r) return null;
  if (r.until < Date.now()) {
    reservations.delete(key);
    return null;
  }
  return r;
}

const isBusy = (e, gid) => {
  const p = e.music.getPlayer(gid);
  return Boolean(reserved(e, gid)) || Boolean(p?.connected && (p.queue.current || e.store.getVc(gid)));
};

function compute(message, cmd) {
  const gid = message.guild.id;
  const vc = message.member?.voice?.channel || null;
  const cands = [...entries.values()].filter((e) => canSend(e, gid, message.channelId));
  if (!cands.length) return { botId: null };

  const pick = (e, extra = {}) => ({ botId: e.bot.id, ...extra });
  const kind = cmd.kind || 'control';

  if (kind === 'info') return pick(cands[0]);

  // 1) bot yang sudah di channel user
  if (vc) {
    const here = cands.find((e) => {
      const p = e.music.getPlayer(gid);
      return (p?.connected && p.voiceChannelId === vc.id) || reserved(e, gid)?.vcId === vc.id;
    });
    if (here) return pick(here);
  }

  // 2) command kontrol tanpa bot di channel user
  if (kind === 'control') {
    const active = cands.find((e) => e.music.getPlayer(gid)?.connected);
    return pick(active || cands[0]);
  }

  // 3) command panggil: cari bot bebas
  if (!vc) return pick(cands[0]); // akan dijawab "masuk voice dulu"
  const free = cands.filter((e) => !isBusy(e, gid));
  if (!free.length) return pick(cands[0], { allBusy: true });

  const canJoin = (e) => {
    const ch = guildOf(e, gid)?.channels.cache.get(vc.id);
    return Boolean(ch?.joinable && ch?.speakable);
  };
  // utamakan bot yang benar-benar nganggur (tidak tersambung), lalu urutan bot
  const sorted = [...free].sort((a, b) => Number(Boolean(a.music.getPlayer(gid)?.connected)) - Number(Boolean(b.music.getPlayer(gid)?.connected)));
  const chosen = sorted.find(canJoin) || sorted[0];
  if (canJoin(chosen)) reservations.set(`${gid}:${chosen.bot.id}`, { vcId: vc.id, until: Date.now() + RESERVE_MS });
  return pick(chosen);
}

// Keputusan dihitung sekali per pesan (oleh bot mana pun yang menerima pesan lebih dulu)
function decide(message, cmd) {
  const cached = decisions.get(message.id);
  if (cached) return cached;
  const d = compute(message, cmd);
  decisions.set(message.id, d);
  setTimeout(() => decisions.delete(message.id), 30000).unref?.();
  return d;
}

module.exports = { register, decide };

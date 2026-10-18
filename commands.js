// Command prefix (a!play, a!p, a!skip, a!s, dst.)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const cfg = require('./config');
const store = require('./store');
const M = require('./music');

const { fmt, durOf, COLOR } = M;
const LOOP_LABEL = { off: 'mati', track: 'lagu ini', queue: 'seluruh queue' };
const LOOP_ORDER = ['off', 'track', 'queue'];
const LOOP_INPUT = {
  off: 'off', mati: 'off', '0': 'off',
  track: 'track', song: 'track', lagu: 'track', one: 'track', '1': 'track',
  queue: 'queue', all: 'queue', semua: 'queue', '2': 'queue',
};

const commands = new Map(); // nama / alias -> command
const list = []; // untuk a!help
const def = (meta, execute) => {
  const cmd = { ...meta, execute };
  list.push(cmd);
  commands.set(meta.name, cmd);
  (meta.aliases || []).forEach((a) => commands.set(a, cmd));
};

// ------------------------------------------------------------------ helper
function parseTime(s) {
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(':').map(Number);
  if (parts.length > 3 || parts.some((n) => Number.isNaN(n) || n < 0)) return null;
  return parts.reduce((a, x) => a * 60 + x, 0);
}

// Player aktif + user harus di voice channel yang sama. Mengembalikan player atau null (sudah membalas).
async function needPlayer(c) {
  const p = M.getPlayer(c.guild.id);
  if (!p || !p.queue.current) {
    await c.reply('❌ Tidak ada lagu yang sedang diputar.');
    return null;
  }
  if (!c.vc || c.vc.id !== p.voiceChannelId) {
    await c.reply('❌ Kamu harus berada di voice channel yang sama dengan bot.');
    return null;
  }
  return p;
}

// ------------------------------------------------------------------ play / join / leave / 24-7
def(
  { name: 'play', aliases: ['p'], usage: '<judul / link>', desc: 'Putar lagu (YouTube / link / playlist)' },
  async (c) => {
    const query = c.args.join(' ').trim();
    if (!c.vc) return c.reply('❌ Masuk ke voice channel dulu.');
    if (!query) return c.reply(`Pakai: \`${cfg.prefix}play <judul / link>\``);
    if (!c.vc.joinable || !c.vc.speakable) return c.reply('❌ Bot tidak punya izin **Connect / Speak** di voice channel itu.');
    if (!M.isReady()) return c.reply('❌ Server Lavalink belum terhubung, coba lagi sebentar.');

    const existing = M.getPlayer(c.guild.id);
    if (existing?.connected && existing.queue.current && existing.voiceChannelId !== c.vc.id) {
      return c.reply('❌ Bot sedang memutar musik di voice channel lain.');
    }

    c.message.channel.sendTyping().catch(() => {});
    try {
      const player = await M.getOrCreatePlayer(c.guild.id, c.vc.id, c.message.channelId);
      const res = await player.search({ query }, c.message.author);
      if (res.loadType === 'error') return c.reply(`❌ Tidak bisa memutar: \`${String(res.exception?.message || 'error').slice(0, 200)}\``);
      if (res.loadType === 'empty' || !res.tracks.length) return c.reply('❌ Tidak ada hasil.');

      let msg;
      if (res.loadType === 'playlist') {
        await player.queue.add(res.tracks);
        msg = `📃 Playlist **${res.playlist?.title || res.playlist?.name || 'Playlist'}** (${res.tracks.length} lagu) masuk queue.`;
      } else {
        const t = res.tracks[0];
        await player.queue.add(t);
        msg = `➕ **${t.info.title}** (${durOf(t)}) masuk queue — oleh ${c.message.author}`;
      }
      if (!player.playing && !player.paused) await player.play();
      return c.reply(msg);
    } catch (err) {
      console.error('[music] play gagal:', err);
      return c.reply(`❌ Tidak bisa memutar: \`${String(err.message || err).slice(0, 200)}\``);
    }
  }
);

def({ name: 'join', aliases: ['j', 'summon'], desc: 'Panggil bot ke voice channel kamu' }, async (c) => {
  if (!c.vc) return c.reply('❌ Masuk ke voice channel dulu.');
  if (!c.vc.joinable || !c.vc.speakable) return c.reply('❌ Bot tidak punya izin **Connect / Speak** di voice channel itu.');
  if (!M.isReady()) return c.reply('❌ Server Lavalink belum terhubung, coba lagi sebentar.');
  const existing = M.getPlayer(c.guild.id);
  if (existing?.queue.current && existing.voiceChannelId !== c.vc.id) return c.reply('❌ Bot sedang memutar musik di voice channel lain.');
  const p = await M.getOrCreatePlayer(c.guild.id, c.vc.id, c.message.channelId);
  if (store.getVc(c.guild.id)) store.setVc(c.guild.id, c.vc.id);
  else if (!p.queue.current) M.armIdle(c.guild.id);
  return c.reply(`✅ Masuk ke **${c.vc.name}**.`);
});

def({ name: 'leave', aliases: ['dc', 'disconnect', 'stopbot'], desc: 'Keluarkan bot dari voice' }, async (c) => {
  store.clearVc(c.guild.id); // hapus dulu supaya tidak masuk ulang otomatis
  const p = M.getPlayer(c.guild.id);
  if (!p) return c.reply('Bot tidak sedang di voice.');
  await p.destroy('leave command').catch(() => {});
  return c.reply('👋 Bot keluar dari voice.');
});

def({ name: '247', aliases: ['24/7', 'stay'], desc: 'Aktif/nonaktifkan mode 24/7 (bot tidak keluar sendiri)' }, async (c) => {
  if (!c.member.permissions.has(PermissionFlagsBits.ManageGuild)) return c.reply('❌ Butuh izin **Manage Server** untuk mengatur mode 24/7.');
  if (store.getVc(c.guild.id)) {
    store.clearVc(c.guild.id);
    return c.reply('🔕 Mode 24/7 **nonaktif**. Bot akan keluar sendiri kalau nganggur.');
  }
  if (!c.vc) return c.reply('❌ Masuk ke voice channel dulu, lalu jalankan lagi.');
  if (!c.vc.joinable || !c.vc.speakable) return c.reply('❌ Bot tidak punya izin **Connect / Speak** di voice channel itu.');
  if (!M.isReady()) return c.reply('❌ Server Lavalink belum terhubung, coba lagi sebentar.');
  const existing = M.getPlayer(c.guild.id);
  if (existing?.queue.current && existing.voiceChannelId !== c.vc.id) return c.reply('❌ Bot sedang memutar musik di voice channel lain.');
  await M.getOrCreatePlayer(c.guild.id, c.vc.id, c.message.channelId);
  store.setVc(c.guild.id, c.vc.id);
  return c.reply(`🔔 Mode 24/7 **aktif** di **${c.vc.name}**. Pakai \`${cfg.prefix}leave\` untuk mengeluarkan bot.`);
});

// ------------------------------------------------------------------ kontrol playback
def({ name: 'skip', aliases: ['s', 'next'], desc: 'Lewati lagu sekarang' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  if (!p.queue.tracks.length) {
    if (p.get('autoplay') && (await M.doAutoplay(p).catch(() => false))) {
      await p.skip();
      return c.reply('⏭️ Dilewati.');
    }
    await p.stopPlaying(true, false);
    M.armIdle(c.guild.id);
    return c.reply('⏭️ Lagu terakhir dilewati. Queue kosong.');
  }
  await p.skip();
  return c.reply('⏭️ Dilewati.');
});

def({ name: 'previous', aliases: ['prev', 'back'], desc: 'Kembali ke lagu sebelumnya' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  if (!p.queue.previous.length) return c.reply('❌ Tidak ada lagu sebelumnya.');
  const prev = await p.queue.shiftPrevious();
  const cur = p.queue.current;
  if (cur) await p.queue.splice(0, 0, cur); // lagu sekarang jadi berikutnya
  await p.play({ clientTrack: prev });
  return c.reply('⏮️ Kembali ke lagu sebelumnya.');
});

def({ name: 'stop', aliases: ['clearstop'], desc: 'Hentikan musik & kosongkan queue' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  p.set('autoplay', false);
  await p.stopPlaying(true, false);
  M.armIdle(c.guild.id);
  return c.reply('⏹️ Musik dihentikan & queue dikosongkan.');
});

def({ name: 'pause', aliases: ['pa'], desc: 'Jeda lagu' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  if (p.paused) return c.reply('Sudah dijeda.');
  await p.pause();
  return c.reply('⏸️ Dijeda.');
});

def({ name: 'resume', aliases: ['r', 'unpause'], desc: 'Lanjutkan lagu' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  if (!p.paused) return c.reply('Lagu tidak sedang dijeda.');
  await p.resume();
  return c.reply('▶️ Dilanjutkan.');
});

def({ name: 'volume', aliases: ['vol', 'v'], usage: '<1-150>', desc: 'Atur volume' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  if (!c.args[0]) return c.reply(`🔊 Volume sekarang: **${p.volume}%**`);
  const v = parseInt(c.args[0], 10);
  if (Number.isNaN(v) || v < 1 || v > 150) return c.reply('❌ Volume harus 1 - 150.');
  await p.setVolume(v);
  return c.reply(`🔊 Volume: **${v}%**`);
});

def({ name: 'loop', aliases: ['l', 'repeat'], usage: '[off|track|queue]', desc: 'Atur mode ulang' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  let mode;
  if (c.args[0]) {
    mode = LOOP_INPUT[c.args[0].toLowerCase()];
    if (!mode) return c.reply(`❌ Mode: \`off\`, \`track\`, atau \`queue\`.`);
  } else {
    mode = LOOP_ORDER[(LOOP_ORDER.indexOf(p.repeatMode) + 1) % LOOP_ORDER.length];
  }
  await p.setRepeatMode(mode);
  return c.reply(`🔁 Loop: **${LOOP_LABEL[mode]}**`);
});

def({ name: 'shuffle', aliases: ['sh'], desc: 'Acak urutan queue' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  await p.queue.shuffle();
  return c.reply('🔀 Queue diacak.');
});

def({ name: 'autoplay', aliases: ['ap'], desc: 'Putar lagu rekomendasi otomatis saat queue habis' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  const on = !p.get('autoplay');
  p.set('autoplay', on);
  return c.reply(`📻 Autoplay: **${on ? 'ON' : 'OFF'}**`);
});

def({ name: 'seek', usage: '<detik | m:ss>', desc: 'Loncat ke posisi tertentu' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  if (!p.queue.current.info.isSeekable) return c.reply('❌ Lagu ini tidak bisa di-seek.');
  const s = c.args[0] ? parseTime(c.args[0]) : null;
  if (s == null) return c.reply(`Pakai: \`${cfg.prefix}seek 90\` atau \`${cfg.prefix}seek 1:30\``);
  await p.seek(s * 1000);
  return c.reply(`⏩ Loncat ke **${fmt(s * 1000)}**`);
});

def({ name: 'remove', aliases: ['rm'], usage: '<nomor>', desc: 'Hapus lagu dari queue (nomor dari a!queue, mulai 2)' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  const n = parseInt(c.args[0], 10);
  if (Number.isNaN(n) || n < 2) return c.reply(`Pakai: \`${cfg.prefix}remove <nomor>\` (nomor dari \`${cfg.prefix}queue\`, mulai 2)`);
  const track = p.queue.tracks[n - 2]; // nomor 1 = lagu yang sedang diputar
  if (!track) return c.reply('❌ Nomor tidak ada di queue.');
  await p.queue.remove(n - 2);
  return c.reply(`🗑️ **${track.info.title}** dihapus dari queue.`);
});

def({ name: 'clear', aliases: ['cq'], desc: 'Kosongkan queue (lagu sekarang tetap jalan)' }, async (c) => {
  const p = await needPlayer(c);
  if (!p) return;
  const n = p.queue.tracks.length;
  if (n) await p.queue.splice(0, n);
  return c.reply(`🧹 ${n} lagu dihapus dari queue.`);
});

// ------------------------------------------------------------------ info
const QUEUE_PER_PAGE = 10;
const clip = (str, n = 70) => (str.length > n ? `${str.slice(0, n - 1)}…` : str);

function queuePage(p, wanted) {
  const now = p?.queue.current;
  if (!now) return { payload: { content: '📭 Queue kosong.', embeds: [], components: [] }, page: 0, pages: 1 };

  const rest = p.queue.tracks;
  const pages = Math.max(1, Math.ceil(rest.length / QUEUE_PER_PAGE));
  const page = Math.min(Math.max(wanted, 0), pages - 1);
  const start = page * QUEUE_PER_PAGE;
  const lines = rest.slice(start, start + QUEUE_PER_PAGE).map((t, idx) => `**${start + idx + 2}.** ${clip(t.info.title)} \`${durOf(t)}\``);
  const total = [now, ...rest].reduce((a, t) => a + (t.info.isStream ? 0 : t.info.duration || 0), 0);

  const e = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('📃 Queue')
    .setDescription(`**Sekarang:** [${clip(now.info.title, 80)}](${now.info.uri}) \`${durOf(now)}\`\n\n${lines.join('\n') || '_Tidak ada lagu berikutnya_'}`)
    .setFooter({ text: `Halaman ${page + 1}/${pages} • ${rest.length + 1} lagu • ${fmt(total)} • Loop: ${LOOP_LABEL[p.repeatMode]}` });

  const btn = (id, emoji, disabled) => new ButtonBuilder().setCustomId(id).setEmoji(emoji).setStyle(ButtonStyle.Secondary).setDisabled(disabled);
  const components =
    pages > 1
      ? [
          new ActionRowBuilder().addComponents(
            btn('mq_first', '⏮️', page === 0),
            btn('mq_prev', '◀️', page === 0),
            new ButtonBuilder().setCustomId('mq_page').setLabel(`${page + 1}/${pages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
            btn('mq_next', '▶️', page === pages - 1),
            btn('mq_last', '⏭️', page === pages - 1)
          ),
        ]
      : [];
  return { payload: { embeds: [e], components }, page, pages };
}

def({ name: 'queue', aliases: ['q'], desc: 'Lihat antrean lagu' }, async (c) => {
  const p = M.getPlayer(c.guild.id);
  if (!p?.queue.current) return c.reply('📭 Queue kosong.');

  const first = queuePage(p, 0);
  const msg = await c.reply(first.payload);
  if (!msg || first.pages <= 1) return;

  let page = first.page;
  const collector = msg.createMessageComponentCollector({ time: 120000 });
  collector.on('collect', async (b) => {
    if (b.user.id !== c.message.author.id) {
      return b.reply({ content: `Hanya yang menjalankan \`${cfg.prefix}queue\` yang bisa ganti halaman.`, ephemeral: true }).catch(() => {});
    }
    const target = { mq_first: 0, mq_prev: page - 1, mq_next: page + 1, mq_last: Infinity }[b.customId];
    if (target === undefined) return;
    const r = queuePage(M.getPlayer(c.guild.id), target);
    page = r.page;
    await b.update({ ...r.payload, allowedMentions: { parse: [] } }).catch(() => {});
    if (!M.getPlayer(c.guild.id)?.queue.current) collector.stop();
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
});

def({ name: 'nowplaying', aliases: ['np'], desc: 'Lagu yang sedang diputar' }, async (c) => {
  const p = M.getPlayer(c.guild.id);
  const t = p?.queue.current;
  if (!t) return c.reply('❌ Tidak ada lagu yang sedang diputar.');
  const e = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎶 Sedang diputar')
    .setDescription(`**[${t.info.title}](${t.info.uri})**\n\`${fmt(p.position)} / ${durOf(t)}\``)
    .addFields({ name: 'Diminta oleh', value: `${t.requester ?? '-'}`, inline: true }, { name: 'Volume', value: `${p.volume}%`, inline: true });
  if (t.info.artworkUrl) e.setThumbnail(t.info.artworkUrl);
  return c.reply({ embeds: [e] });
});

def({ name: 'help', aliases: ['h', 'commands'], desc: 'Daftar command' }, async (c) => {
  const lines = list.map((cmd) => {
    const names = [cmd.name, ...(cmd.aliases || [])].map((n) => `\`${cfg.prefix}${n}\``).join(' / ');
    return `${names}${cmd.usage ? ` \`${cmd.usage}\`` : ''}\n└ ${cmd.desc}`;
  });
  const e = new EmbedBuilder().setColor(COLOR).setTitle('🎵 Command Musik').setDescription(lines.join('\n'));
  return c.reply({ embeds: [e] });
});

// ------------------------------------------------------------------ handler pesan
async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;
  const content = message.content;
  const prefix = cfg.prefix;
  if (!content.toLowerCase().startsWith(prefix.toLowerCase())) return;

  const args = content.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
  const name = (args.shift() || '').toLowerCase();
  const cmd = commands.get(name);
  if (!cmd) return;

  const me = message.guild.members.me;
  if (!message.channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)) return;

  const c = {
    message,
    guild: message.guild,
    member: message.member,
    args,
    vc: message.member?.voice?.channel || null,
    reply: (payload) =>
      message
        .reply({
          allowedMentions: { parse: [], repliedUser: false },
          failIfNotExists: false,
          ...(typeof payload === 'string' ? { content: payload } : payload),
        })
        .catch((err) => console.warn('[reply] gagal:', err.message)),
  };

  try {
    await cmd.execute(c);
  } catch (err) {
    console.error(`[command:${name}] error:`, err);
    c.reply('❌ Terjadi error. Coba lagi sebentar lagi.');
  }
}

module.exports = { handleMessage };

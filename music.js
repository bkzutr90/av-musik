// Mesin musik (Lavalink via lavalink-client). Satu instance per bot; tiap bot punya state sendiri.
const { EmbedBuilder } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
const cfg = require('./config');

const NO_PING = { parse: [] };
const COLOR = 0x5865f2;

// ------------------------------------------------------------------ util
function fmt(ms) {
  if (!ms || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
const durOf = (t) => (t.info.isStream ? 'Live' : fmt(t.info.duration));

// Autoplay: YouTube Mix dari lagu terakhir
async function doAutoplay(player) {
  const last = player.queue.current || player.queue.previous[0];
  if (!last || last.info.sourceName !== 'youtube') return false;
  const id = last.info.identifier;
  const res = await player.search({ query: `https://www.youtube.com/watch?v=${id}&list=RD${id}` }, last.requester);
  if (res.loadType !== 'playlist') return false;
  const seen = new Set([id, ...player.queue.previous.map((t) => t.info.identifier)]);
  const fresh = res.tracks.filter((t) => !seen.has(t.info.identifier)).slice(0, 10);
  if (!fresh.length) return false;
  await player.queue.add(fresh);
  return true;
}

/**
 * Buat mesin musik untuk satu bot.
 * @param {import('discord.js').Client} client
 * @param {{id:string,name:string}} bot
 * @param {ReturnType<import('./store').forBot>} store
 */
function createMusic(client, bot, store) {
  const tag = `[${bot.name}]`;
  const idleTimers = new Map(); // guildId -> timeout
  let lavaReady = false;

  const sendText = (player, payload) => {
    const ch = player.textChannelId && client.channels.cache.get(player.textChannelId);
    return ch
      ?.send({ allowedMentions: NO_PING, ...(typeof payload === 'string' ? { content: payload } : payload) })
      .catch(() => {});
  };

  const lava = new LavalinkManager({
    nodes: [
      {
        id: 'main',
        host: cfg.lavalink.host,
        port: cfg.lavalink.port,
        authorization: cfg.lavalink.password,
        secure: cfg.lavalink.secure,
        retryAmount: 1000,
        retryDelay: 5000,
      },
    ],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    autoSkip: true, // lagu error/stuck otomatis lanjut ke berikutnya
    client: { id: '0', username: 'Music' }, // diganti id bot asli saat lava.init()
    playerOptions: {
      defaultSearchPlatform: cfg.searchPlatform,
      volumeDecrementer: 1,
      clientBasedPositionUpdateInterval: 150,
      onDisconnect: { autoReconnect: true, destroyPlayer: false },
    },
    queueOptions: { maxPreviousTracks: 25 },
  });

  const isReady = () => Boolean(lava.useable);
  const getPlayer = (guildId) => lava.getPlayer(guildId) || null;

  // ---------------------------------------------------------------- idle (keluar sendiri kalau tidak 24/7)
  function clearIdle(guildId) {
    const t = idleTimers.get(guildId);
    if (t) clearTimeout(t);
    idleTimers.delete(guildId);
  }

  function armIdle(guildId) {
    clearIdle(guildId);
    idleTimers.set(
      guildId,
      setTimeout(() => {
        idleTimers.delete(guildId);
        const p = lava.getPlayer(guildId);
        if (!p || p.queue.current || p.playing) return;
        if (store.getVc(guildId)) return; // mode 24/7
        sendText(p, '👋 Tidak ada lagu, bot keluar dari voice. Panggil lagi dengan command play.');
        p.destroy('idle').catch(() => {});
      }, cfg.idleLeaveMs)
    );
  }

  // ---------------------------------------------------------------- player helper
  async function getOrCreatePlayer(guildId, voiceChannelId, textChannelId) {
    let p = lava.getPlayer(guildId);
    // Player nganggur di channel lain: buat ulang di channel baru
    if (p && p.voiceChannelId && p.voiceChannelId !== voiceChannelId) {
      await p.destroy('pindah channel').catch(() => {});
      p = null;
    }
    if (!p) p = lava.createPlayer({ guildId, voiceChannelId, textChannelId, selfDeaf: true, volume: 100 });
    p.options.voiceChannelId = voiceChannelId;
    if (textChannelId) p.textChannelId = textChannelId;
    if (!p.connected) await p.connect();
    return p;
  }

  // ---------------------------------------------------------------- 24/7 restore
  async function restoreGuild(guildId) {
    const channelId = store.getVc(guildId);
    if (!channelId) return;
    try {
      const ch = await client.channels.fetch(channelId);
      if (!ch || !ch.isVoiceBased()) return store.clearVc(guildId);
      const existing = lava.getPlayer(guildId);
      if (existing?.connected) return;
      const player = existing || lava.createPlayer({ guildId, voiceChannelId: ch.id, selfDeaf: true, volume: 100 });
      await player.connect();
      console.log(`${tag} 🎧 24/7: masuk ke #${ch.name} (${guildId})`);
    } catch (err) {
      // 10003 = channel hilang, 50001 = tidak ada akses: lupakan; selain itu mungkin gangguan sementara
      if (err.code === 10003 || err.code === 50001) store.clearVc(guildId);
      else console.warn(`${tag} gagal masuk ulang voice ${guildId}:`, err.message);
    }
  }

  async function ensureLavalink() {
    if (lavaReady) return;
    await lava.init({ id: client.user.id, username: client.user.username });
    lavaReady = true;
  }

  // Dipanggil saat bot ready: init Lavalink lalu masuk lagi ke channel 24/7 tiap server
  async function restoreMusic() {
    try {
      await ensureLavalink();
      for (let n = 0; n < 30 && !lava.useable; n++) await new Promise((r) => setTimeout(r, 1000));
      if (!lava.useable) return console.warn(`${tag} Lavalink belum siap, lewati restore voice`);
      for (const { guildId } of store.allVc()) await restoreGuild(guildId);
    } catch (err) {
      console.warn(`${tag} restore gagal:`, err.message);
    }
  }

  // Setelah node Lavalink putus lalu tersambung lagi, semua player lama sudah hilang di sisi Lavalink
  async function resetStalePlayers() {
    for (const p of [...lava.players.values()]) {
      if (p.queue.current) sendText(p, '⚠️ Koneksi ke Lavalink sempat putus, queue direset. Silakan putar lagi.');
      await p.destroy('node reconnect').catch(() => {});
    }
    await restoreMusic();
  }

  // ---------------------------------------------------------------- event
  client.on('raw', (d) => {
    try {
      lava.sendRawData(d);
    } catch {}
  });

  let nodeWasDown = false;
  lava.nodeManager
    .on('connect', (node) => {
      console.log(`${tag} Lavalink node "${node.id}" terhubung`);
      if (nodeWasDown) {
        nodeWasDown = false;
        resetStalePlayers().catch((err) => console.warn(`${tag} reset player gagal:`, err.message));
      }
    })
    .on('disconnect', (node, reason) => {
      nodeWasDown = true;
      console.warn(`${tag} node "${node.id}" putus:`, reason?.reason || reason);
    })
    .on('error', (node, err) => console.error(`${tag} node "${node.id}" error:`, err?.message || err));

  lava
    .on('trackStart', (player, track) => {
      clearIdle(player.guildId);
      if (!track) return;
      const e = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('🎶 Sedang diputar')
        .setDescription(`**[${track.info.title}](${track.info.uri})**`)
        .addFields(
          { name: 'Durasi', value: durOf(track), inline: true },
          { name: 'Diminta oleh', value: `${track.requester ?? '-'}`, inline: true },
          { name: 'Volume', value: `${player.volume}%`, inline: true }
        );
      if (track.info.artworkUrl) e.setThumbnail(track.info.artworkUrl);
      sendText(player, { embeds: [e] });
    })
    .on('trackError', (player, track, payload) => {
      console.error(`${tag} trackError:`, payload?.exception || payload);
      sendText(player, `❌ Gagal memutar **${track?.info?.title ?? 'lagu'}**: \`${String(payload?.exception?.message || 'error').slice(0, 200)}\``);
    })
    .on('trackStuck', (player, track) => {
      console.warn(`${tag} trackStuck:`, track?.info?.title);
      sendText(player, `⚠️ **${track?.info?.title ?? 'Lagu'}** macet, dilewati.`);
    })
    .on('queueEnd', async (player) => {
      if (player.get('autoplay')) {
        try {
          if (await doAutoplay(player)) return await player.play();
        } catch (err) {
          console.warn(`${tag} autoplay gagal:`, err.message);
        }
      }
      armIdle(player.guildId);
    })
    .on('playerDestroy', (player) => clearIdle(player.guildId));

  // 24/7: kalau bot ke-disconnect, masuk lagi. Kalau dipindah admin, ikuti channel barunya.
  client.on('voiceStateUpdate', (oldS, newS) => {
    if (newS.member?.id !== client.user.id) return;
    const gid = newS.guild.id;
    const saved = store.getVc(gid);
    if (!saved) return;
    if (newS.channelId) {
      if (newS.channelId !== saved) store.setVc(gid, newS.channelId);
      return;
    }
    setTimeout(() => restoreGuild(gid), 5000);
  });

  // Bot dikeluarkan dari server: bersihkan data
  client.on('guildDelete', (g) => {
    store.clearVc(g.id);
    clearIdle(g.id);
  });

  return { restoreMusic, isReady, getPlayer, getOrCreatePlayer, doAutoplay, armIdle };
}

module.exports = { createMusic, fmt, durOf, COLOR, NO_PING };

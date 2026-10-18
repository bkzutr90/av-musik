require('dotenv').config();

// Daftar bot dibaca dari BOT_1_TOKEN ... BOT_10_TOKEN. Semua bot memakai SATU prefix (PREFIX, bawaan "a!");
// router.js memilih bot yang bebas untuk tiap command.
// Kompatibel dengan mode satu bot lama: DISCORD_TOKEN.
const PREFIX = process.env.PREFIX || 'a!';

function loadBots() {
  const bots = [];
  for (let n = 1; n <= 10; n++) {
    const token = process.env[`BOT_${n}_TOKEN`];
    if (!token) continue;
    bots.push({ id: String(n), name: `bot${n}`, token: token.trim(), prefix: PREFIX });
  }
  if (!bots.length && process.env.DISCORD_TOKEN) {
    bots.push({ id: '1', name: 'bot1', token: process.env.DISCORD_TOKEN.trim(), prefix: PREFIX });
  }
  return bots;
}

module.exports = {
  bots: loadBots(),
  dataPath: process.env.DATA_PATH || './data/guilds.json',

  // Bot keluar sendiri dari voice kalau tidak memutar apa-apa selama ini (kecuali mode 24/7 aktif di server itu)
  idleLeaveMs: Number(process.env.IDLE_LEAVE_SECONDS || 180) * 1000,

  searchPlatform: process.env.MUSIC_SEARCH || 'ytsearch', // 'scsearch' = SoundCloud

  lavalink: {
    host: process.env.LAVALINK_HOST || 'localhost',
    port: Number(process.env.LAVALINK_PORT) || 2333,
    password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
    secure: process.env.LAVALINK_SECURE === '1',
  },
};

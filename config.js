require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  prefix: process.env.PREFIX || 'a!',
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

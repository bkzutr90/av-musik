// Satu proses, banyak bot musik dengan SATU prefix. Tiap bot punya token, client Discord, dan Lavalink manager sendiri;
// router.js memilih bot yang bebas untuk tiap command.
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const cfg = require('./config');
const { forBot } = require('./store');
const { createMusic } = require('./music');
const { createHandler } = require('./commands');
const router = require('./router');

if (!cfg.bots.length) {
  console.error('Isi minimal BOT_1_TOKEN (atau DISCORD_TOKEN) di Variables Railway / .env');
  process.exit(1);
}

// Peringatan konfigurasi
if (new Set(cfg.bots.map((b) => b.token)).size !== cfg.bots.length) {
  console.warn('⚠️ Ada token yang sama dipakai lebih dari satu bot.');
}

function startBot(bot) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, // wajib untuk command prefix (aktifkan di Developer Portal)
    ],
  });

  const store = forBot(bot.id);
  const music = createMusic(client, bot, store);
  const handle = createHandler(bot, music, store);
  router.register({ bot, client, music, store });

  client.once('clientReady', () => {
    console.log(`[${bot.name}] 🎵 online sebagai ${client.user.tag} (prefix ${bot.prefix}) di ${client.guilds.cache.size} server`);
    client.user.setActivity(`${bot.prefix}help`, { type: ActivityType.Listening });
    music.restoreMusic();
  });

  client.on('messageCreate', (m) => {
    handle(m).catch((err) => console.error(`[${bot.name}] message error:`, err));
  });

  client.login(bot.token).catch((err) => console.error(`[${bot.name}] login gagal:`, err.message));
}

// Jeda singkat antar bot supaya login tidak bersamaan
cfg.bots.forEach((bot, i) => setTimeout(() => startBot(bot), i * 1500));

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

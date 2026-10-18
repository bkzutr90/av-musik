const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const cfg = require('./config');
const { handleMessage } = require('./commands');
const { initMusic, restoreMusic } = require('./music');

if (!cfg.token) {
  console.error('DISCORD_TOKEN wajib diisi (Variables di Railway / .env)');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // wajib untuk command prefix (aktifkan di Developer Portal)
  ],
});
initMusic(client);

client.once('clientReady', async () => {
  console.log(`🎵 Online sebagai ${client.user.tag} di ${client.guilds.cache.size} server`);
  client.user.setActivity(`${cfg.prefix}help`, { type: ActivityType.Listening });
  restoreMusic(client);
});

client.on('messageCreate', (m) => {
  handleMessage(m).catch((err) => console.error('[message] error:', err));
});

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

client.login(cfg.token);

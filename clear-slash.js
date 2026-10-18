// Jalankan SEKALI (npm run clear-slash) untuk menghapus slash command lama dari Discord.
// Butuh CLIENT_ID_1..n (id aplikasi tiap bot) atau CLIENT_ID untuk satu bot, plus token yang sesuai.
// Contoh: CLIENT_ID_1=123 CLIENT_ID_2=456 ... (GUILD_ID opsional kalau command lama terdaftar per server)
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const cfg = require('./config');

(async () => {
  for (const bot of cfg.bots) {
    const clientId = process.env[`CLIENT_ID_${bot.id}`] || (cfg.bots.length === 1 ? process.env.CLIENT_ID : null);
    if (!clientId) {
      console.warn(`[${bot.name}] dilewati: CLIENT_ID_${bot.id} belum diisi`);
      continue;
    }
    const rest = new REST({ version: '10' }).setToken(bot.token);
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log(`[${bot.name}] ✅ slash command global dihapus`);
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(clientId, process.env.GUILD_ID), { body: [] });
      console.log(`[${bot.name}] ✅ slash command server ${process.env.GUILD_ID} dihapus`);
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

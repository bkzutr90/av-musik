// Jalankan SEKALI (npm run clear-slash) untuk menghapus slash command lama (/rank, /play, dll.)
// dari Discord. Butuh DISCORD_TOKEN + CLIENT_ID (+ GUILD_ID kalau command lama terdaftar per server).
require('dotenv').config();
const { REST, Routes } = require('discord.js');

(async () => {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error('DISCORD_TOKEN dan CLIENT_ID wajib diisi');
    process.exit(1);
  }
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
  console.log('✅ Slash command global dihapus');
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log(`✅ Slash command server ${GUILD_ID} dihapus`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

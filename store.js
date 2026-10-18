// Penyimpanan kecil (JSON) untuk mode 24/7: { [botId]: { [guildId]: { vc: channelId } } }
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

let data = {};
try {
  data = JSON.parse(fs.readFileSync(cfg.dataPath, 'utf8'));
} catch {}

function save() {
  try {
    fs.mkdirSync(path.dirname(path.resolve(cfg.dataPath)), { recursive: true });
    fs.writeFileSync(cfg.dataPath, JSON.stringify(data));
  } catch (err) {
    console.warn('[store] gagal menyimpan:', err.message);
  }
}

// Store khusus satu bot (data bot lain tidak ikut tersentuh)
function forBot(botId) {
  const bucket = () => (data[botId] ||= {});
  return {
    getVc: (guildId) => data[botId]?.[guildId]?.vc || null,
    setVc(guildId, channelId) {
      bucket()[guildId] = { vc: String(channelId) };
      save();
    },
    clearVc(guildId) {
      if (!data[botId]?.[guildId]) return;
      delete data[botId][guildId];
      save();
    },
    allVc: () => Object.entries(data[botId] || {}).filter(([, v]) => v.vc).map(([guildId, v]) => ({ guildId, channelId: v.vc })),
  };
}

module.exports = { forBot };

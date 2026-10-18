// Penyimpanan kecil (JSON) untuk mode 24/7 per server: { [guildId]: { vc: channelId } }
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

const getVc = (guildId) => data[guildId]?.vc || null;

function setVc(guildId, channelId) {
  data[guildId] = { ...(data[guildId] || {}), vc: String(channelId) };
  save();
}

function clearVc(guildId) {
  if (!data[guildId]) return;
  delete data[guildId];
  save();
}

const allVc = () => Object.entries(data).filter(([, v]) => v.vc).map(([guildId, v]) => ({ guildId, channelId: v.vc }));

module.exports = { getVc, setVc, clearVc, allVc };

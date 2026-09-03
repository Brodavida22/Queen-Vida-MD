const settings = {
  packname: process.env.BOT_PACKNAME || 'Queen Vida MD',
  author: process.env.STICKER_AUTHOR || 'Queen Vida',
  botName: process.env.BOT_NAME || 'Queen Vida MD Bot',
  botOwner: process.env.BOT_OWNER || 'Vida',
  ownerNumber: process.env.OWNER_NUMBER || '2348138558590',
  prefix: process.env.BOT_PREFIX || '.',
  prefixes: (process.env.BOT_PREFIXES || '.,!,/,#').split(',').map(p => p.trim()).filter(Boolean),
  giphyApiKey: process.env.GIPHY_API_KEY || '',
  commandMode: process.env.COMMAND_MODE || 'public',
  maxStoreMessages: 20,
  storeWriteInterval: 10000,
  description: 'Queen Vida MD Bot — a WhatsApp automation bot.',
  version: '3.0.9',
  githubUsername: process.env.GITHUB_USERNAME || 'Brodavida22',
  githubRepo: process.env.GITHUB_REPO || 'Queen-Vida-MD',
  updateZipUrl: process.env.UPDATE_ZIP_URL || 'https://github.com/Brodavida22/Queen-Vida-MD/archive/refs/heads/main.zip'
};

module.exports = settings;

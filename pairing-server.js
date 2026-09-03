require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
} = require('@whiskeysockets/baileys');
const P = require('pino');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const SESSION_DIR = path.resolve(process.env.SESSION_DIR || './session');
const OWNER_NUMBER = String(process.env.OWNER_NUMBER || '2348138558590').replace(/\D/g, '');
const BOT_NAME = process.env.BOT_NAME || 'Queen Vida MD Bot';

fs.mkdirSync(SESSION_DIR, { recursive: true });

let botProcess = null;
let pairingInProgress = false;
let lastPairingAt = 0;
let currentCode = null;
let status = fs.existsSync(path.join(SESSION_DIR, 'creds.json')) ? 'authenticated' : 'waiting';

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(data);
}

function html(res) {
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${BOT_NAME}</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0f;color:#fff;font-family:Arial,sans-serif;padding:20px}.card{width:min(430px,100%);background:#15151c;border:1px solid #2b2b36;border-radius:22px;padding:28px;box-shadow:0 20px 70px #0008}.logo{width:70px;height:70px;border-radius:20px;display:grid;place-items:center;margin:0 auto 18px;background:linear-gradient(135deg,#f0b90b,#ff6b6b);font-size:30px;font-weight:800}.center{text-align:center}.muted{color:#aaa;line-height:1.5}.field{margin-top:22px}.field label{display:block;margin-bottom:8px;font-weight:700}.field input{width:100%;padding:15px;border-radius:13px;border:1px solid #363642;background:#0f0f15;color:#fff;font-size:16px;outline:none}.field input:focus{border-color:#f0b90b}.btn{width:100%;margin-top:14px;padding:15px;border:0;border-radius:13px;background:#f0b90b;color:#111;font-weight:800;font-size:16px;cursor:pointer}.btn:disabled{opacity:.5;cursor:not-allowed}.code{display:none;margin-top:20px;padding:18px;border-radius:14px;background:#0e1118;border:1px dashed #f0b90b;text-align:center}.code strong{display:block;font-size:28px;letter-spacing:4px;margin-top:7px}.msg{margin-top:14px;text-align:center;min-height:22px}.ok{color:#7ee787}.err{color:#ff8b8b}.small{font-size:12px;color:#777;margin-top:20px;text-align:center}</style>
</head>
<body><main class="card">
<div class="logo">QV</div><div class="center"><h1>${BOT_NAME}</h1><p class="muted">Secure WhatsApp pairing</p></div>
<div class="field"><label for="number">WhatsApp number</label><input id="number" inputmode="numeric" autocomplete="tel" placeholder="2348138558590" value="${OWNER_NUMBER}"></div>
<button class="btn" id="btn" onclick="pair()">GET PAIRING CODE</button>
<div class="code" id="codebox">Your pairing code<strong id="code"></strong></div>
<div class="msg" id="msg"></div>
<p class="small">Enter your number with country code, without + or spaces.</p>
<script>
async function pair(){const btn=document.getElementById('btn'),msg=document.getElementById('msg'),box=document.getElementById('codebox'),code=document.getElementById('code');const number=document.getElementById('number').value.replace(/\\D/g,'');msg.className='msg';msg.textContent='Requesting code...';box.style.display='none';btn.disabled=true;try{const r=await fetch('/api/pair?number='+encodeURIComponent(number));const d=await r.json();if(!r.ok)throw new Error(d.error||'Pairing failed');code.textContent=d.code;box.style.display='block';msg.className='msg ok';msg.textContent='On WhatsApp: Linked Devices → Link a Device → Link with phone number.'}catch(e){msg.className='msg err';msg.textContent=e.message}finally{btn.disabled=false}}
</script></main></body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
}

function normalizeNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

async function requestPairingCode(number) {
  if (number !== OWNER_NUMBER) {
    const err = new Error('For security, this pairing page only accepts the configured owner number.');
    err.status = 403;
    throw err;
  }
  if (pairingInProgress) {
    const err = new Error('A pairing request is already in progress. Wait a moment and try again.');
    err.status = 429;
    throw err;
  }
  if (Date.now() - lastPairingAt < 30000) {
    const err = new Error('Please wait 30 seconds before requesting another code.');
    err.status = 429;
    throw err;
  }

  pairingInProgress = true;
  lastPairingAt = Date.now();
  currentCode = null;
  status = 'pairing';

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  if (state.creds.registered) {
    pairingInProgress = false;
    status = 'authenticated';
    const err = new Error('This WhatsApp account is already paired. If you want to pair again, remove the session first.');
    err.status = 409;
    throw err;
  }

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    browser: Browsers.ubuntu(BOT_NAME),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  const cleanup = async () => {
    pairingInProgress = false;
    try { sock.ws?.close(); } catch {}
    try { sock.end?.(new Error('Pairing finished')); } catch {}
  };

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      status = 'authenticated';
      await cleanup();
      startBot();
    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut && !state.creds.registered) {
        status = 'waiting';
      }
      pairingInProgress = false;
    }
  });

  // Baileys v7 accepts the phone number as digits only, without + or spaces.
  currentCode = await sock.requestPairingCode(number);
  pairingInProgress = false;
  status = 'code_ready';
  return currentCode;
}

function startBot() {
  if (botProcess && !botProcess.killed) return;
  console.log(`[Queen Vida MD] Starting bot from ${SESSION_DIR}`);
  botProcess = spawn(process.execPath, [path.resolve(__dirname, 'index.js')], {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
  });
  botProcess.on('exit', (code, signal) => {
    console.log(`[Queen Vida MD] Bot stopped. code=${code} signal=${signal || 'none'}`);
    botProcess = null;
  });
}

function hasSession() {
  return fs.existsSync(path.join(SESSION_DIR, 'creds.json'));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/') return html(res);
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, bot: BOT_NAME, status, session: hasSession() });
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { ok: true, status, paired: hasSession(), botRunning: !!botProcess });
    if (req.method === 'GET' && url.pathname === '/api/pair') {
      const number = normalizeNumber(url.searchParams.get('number'));
      if (!number) return json(res, 400, { error: 'Enter a WhatsApp number.' });
      const code = await requestPairingCode(number);
      return json(res, 200, { ok: true, code });
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[Pairing]', err);
    json(res, err.status || 500, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[Queen Vida MD] Pairing website: http://${HOST}:${PORT}`);
  console.log(`[Queen Vida MD] Owner number: ${OWNER_NUMBER}`);
  if (hasSession()) {
    status = 'authenticated';
    startBot();
  } else {
    console.log('[Queen Vida MD] No session found. Open the website and request a pairing code.');
  }
});

process.on('SIGTERM', () => { if (botProcess) botProcess.kill('SIGTERM'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { if (botProcess) botProcess.kill('SIGINT'); server.close(() => process.exit(0)); });

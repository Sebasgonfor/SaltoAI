import { readFileSync } from 'fs';
import { GoogleGenAI, Modality } from '@google/genai';

function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
}

loadEnv();
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('NO GEMINI_API_KEY');
  process.exit(1);
}

const MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: 'v1alpha' } });

console.log('Creating ephemeral token...');
const token = await ai.authTokens.create({
  config: {
    uses: 1,
    expireTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    liveConnectConstraints: {
      model: MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: 'Say hello in Spanish in one short sentence.',
        speechConfig: {
          languageCode: 'es-US',
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    },
  },
});

console.log('Token:', token.name?.slice(0, 40) + '...');

const client = new GoogleGenAI({
  apiKey: token.name,
  httpOptions: { apiVersion: 'v1alpha' },
});

let setupDone = false;
let msgCount = 0;

const session = await client.live.connect({
  model: MODEL,
  callbacks: {
    onopen: () => console.log('WS open'),
    onmessage: (msg) => {
      msgCount++;
      console.log('MSG', msgCount, JSON.stringify(msg).slice(0, 500));
      if (msg.setupComplete) setupDone = true;
      if (msg.error) console.error('SERVER ERROR', msg.error);
    },
    onerror: (e) => console.error('WS error', e?.message || e),
    onclose: (e) => console.log('WS close', e?.code, e?.reason),
  },
});

console.log('Connect returned, setupDone=', setupDone);
await new Promise((r) => setTimeout(r, 2000));

session.sendClientContent({
  turns: [{ role: 'user', parts: [{ text: 'Hola, estoy listo.' }] }],
  turnComplete: true,
});

await new Promise((r) => setTimeout(r, 8000));
console.log('Done. messages=', msgCount, 'setupDone=', setupDone);
session.close();
process.exit(0);

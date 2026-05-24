import { readFileSync } from 'fs';
import { GoogleGenAI, Modality } from '@google/genai';

function loadEnv() {
  const raw = readFileSync('.env.local', 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadEnv();
const key = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: 'v1alpha' } });

for (const lang of ['es-419', 'es-US', 'es', 'es-MX', 'es-ES']) {
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      liveConnectConstraints: {
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'Say hi in Spanish.',
          speechConfig: {
            languageCode: lang,
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      },
    },
  });

  const client = new GoogleGenAI({
    apiKey: token.name,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  let result = 'pending';
  const session = await client.live.connect({
    model: MODEL,
    callbacks: {
      onmessage: (m) => {
        if (m.setupComplete) result = 'setupOK';
      },
      onclose: (e) => {
        if (result === 'pending') result = `close: ${e.reason}`;
      },
    },
  });

  await new Promise((r) => setTimeout(r, 1500));
  try {
    session.close();
  } catch {
    /* ignore */
  }
  console.log(lang, '->', result);
}

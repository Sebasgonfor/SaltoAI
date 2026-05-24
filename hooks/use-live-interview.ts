'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI, type LiveServerMessage, type Session } from '@google/genai/web';
import type { ChatMessage } from '@/lib/types';
import {
  float32ToPcm16Base64,
  resampleFloat32,
  pcm16Base64ToFloat32,
  parsePcmSampleRate,
  LIVE_INPUT_SAMPLE_RATE,
  LIVE_OUTPUT_SAMPLE_RATE,
} from '@/lib/audio-pcm';
import {
  buildLiveOpeningUserPrompt,
  buildLiveOpeningUserPromptEmpresa,
  CLOSING_MESSAGE,
  MAX_USER_TURNS,
} from '@/lib/interview-prompt';

export type LiveInterviewStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'agentSpeaking'
  | 'paused'
  | 'error'
  | 'closed';

function defaultIsClosing(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('perfil de evidencia') || t.includes('construir tu perfil');
}

export function useLiveInterview(options: {
  firstName?: string;
  /** Pass 'empresa' to use the empresa system instruction and closing message. */
  mode?: 'joven' | 'empresa';
  /** Company name — only used when mode === 'empresa'. */
  companyName?: string;
  /** Phrases to detect in agent output to trigger onInterviewComplete. Defaults to joven keywords. */
  closingKeywords?: string[];
  /** Message sent to the model to force-close after MAX_USER_TURNS. Defaults to joven CLOSING_MESSAGE. */
  closingMessage?: string;
  onInterviewComplete?: (messages: ChatMessage[]) => void;
}) {
  const [status, setStatus] = useState<LiveInterviewStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveUserText, setLiveUserText] = useState('');
  const [liveAgentText, setLiveAgentText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [userTurns, setUserTurns] = useState(0);

  const sessionRef = useRef<Session | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackGainRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const userTranscriptRef = useRef('');
  const agentTranscriptRef = useRef('');
  const userTurnsRef = useRef(0);
  const closingHandledRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const statusRef = useRef<LiveInterviewStatus>('idle');
  const sessionAliveRef = useRef(false);
  const micPausedRef = useRef(false);
  const onCompleteRef = useRef(options.onInterviewComplete);
  const closingKeywordsRef = useRef(options.closingKeywords);
  const closingMessageRef = useRef(options.closingMessage);

  useEffect(() => { onCompleteRef.current = options.onInterviewComplete; }, [options.onInterviewComplete]);
  useEffect(() => { closingKeywordsRef.current = options.closingKeywords; }, [options.closingKeywords]);
  useEffect(() => { closingMessageRef.current = options.closingMessage; }, [options.closingMessage]);

  const checkIsClosingMessage = useCallback((text: string): boolean => {
    const keywords = closingKeywordsRef.current;
    if (keywords?.length) {
      const t = text.toLowerCase();
      return keywords.some((k) => t.includes(k.toLowerCase()));
    }
    return defaultIsClosing(text);
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const appendMessage = useCallback((msg: ChatMessage) => {
    messagesRef.current = [...messagesRef.current, msg];
    setMessages(messagesRef.current);
  }, []);

  const stopPlayback = useCallback(() => {
    for (const s of activeSourcesRef.current) {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
    }
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
  }, []);

  const schedulePcmPlayback = useCallback((base64: string, sampleRate: number) => {
    if (statusRef.current === 'paused') return;

    const ctx = audioContextRef.current;
    const gain = playbackGainRef.current;
    if (!ctx || !gain || !base64) return;

    const floats = pcm16Base64ToFloat32(base64);
    if (floats.length === 0) return;

    const buffer = ctx.createBuffer(1, floats.length, sampleRate);
    buffer.copyToChannel(new Float32Array(floats), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);

    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(source);

    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((x) => x !== source);
      if (
        activeSourcesRef.current.length === 0 &&
        statusRef.current !== 'connecting' &&
        statusRef.current !== 'closed' &&
        statusRef.current !== 'paused'
      ) {
        setStatus('listening');
      }
    };

    setStatus('agentSpeaking');
  }, []);

  const finalizeAgentTurn = useCallback(() => {
    const text = agentTranscriptRef.current.trim();
    if (text) {
      appendMessage({ role: 'agent', content: text });
      agentTranscriptRef.current = '';
      setLiveAgentText('');

      if (checkIsClosingMessage(text) && !closingHandledRef.current) {
        closingHandledRef.current = true;
        onCompleteRef.current?.(messagesRef.current);
      }
    }
  }, [appendMessage, checkIsClosingMessage]);

  const finalizeUserTurn = useCallback(() => {
    const text = userTranscriptRef.current.trim();
    if (!text) return;

    appendMessage({ role: 'user', content: text });
    userTranscriptRef.current = '';
    setLiveUserText('');

    userTurnsRef.current += 1;
    setUserTurns(userTurnsRef.current);

    if (userTurnsRef.current >= MAX_USER_TURNS && sessionAliveRef.current && sessionRef.current && !closingHandledRef.current) {
      const forceCloseMsg = closingMessageRef.current ?? CLOSING_MESSAGE;
      try {
        sessionRef.current.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [
                {
                  text: `Llegamos al turno ${MAX_USER_TURNS}. Cierra la entrevista con el mensaje: "${forceCloseMsg}"`,
                },
              ],
            },
          ],
          turnComplete: true,
        });
      } catch {
        /* socket already closing */
      }
    }
  }, [appendMessage]);

  const handleServerMessage = useCallback(
    (msg: LiveServerMessage) => {
      const sc = msg.serverContent;
      if (!sc) return;

      if (sc.interrupted) {
        stopPlayback();
        if (statusRef.current !== 'closed' && statusRef.current !== 'paused') {
          setStatus('listening');
        }
      }

      if (sc.inputTranscription?.text) {
        userTranscriptRef.current += sc.inputTranscription.text;
        setLiveUserText(userTranscriptRef.current);
      }
      if (sc.inputTranscription?.finished) {
        finalizeUserTurn();
      }

      if (sc.outputTranscription?.text) {
        agentTranscriptRef.current += sc.outputTranscription.text;
        setLiveAgentText(agentTranscriptRef.current);
      }
      if (sc.outputTranscription?.finished) {
        finalizeAgentTurn();
      }

      const parts = sc.modelTurn?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.thought === true) continue;
          const data = part.inlineData?.data;
          const mime = part.inlineData?.mimeType ?? '';
          if (data && mime.includes('audio')) {
            schedulePcmPlayback(data, parsePcmSampleRate(mime, LIVE_OUTPUT_SAMPLE_RATE));
          }
        }
      }

      if (sc.turnComplete) {
        finalizeUserTurn();
        finalizeAgentTurn();

        if (
          userTurnsRef.current >= MAX_USER_TURNS &&
          !closingHandledRef.current &&
          messagesRef.current.some((m) => m.role === 'agent' && checkIsClosingMessage(m.content))
        ) {
          closingHandledRef.current = true;
          onCompleteRef.current?.(messagesRef.current);
        }

        if (
          statusRef.current !== 'closed' &&
          statusRef.current !== 'paused' &&
          activeSourcesRef.current.length === 0
        ) {
          setStatus('listening');
        }
      }
    },
    [checkIsClosingMessage, finalizeAgentTurn, finalizeUserTurn, schedulePcmPlayback, stopPlayback]
  );

  const stopMicCapture = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const cleanupAudio = useCallback(() => {
    stopMicCapture();
    playbackGainRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, [stopMicCapture]);

  const disconnect = useCallback(() => {
    sessionAliveRef.current = false;
    micPausedRef.current = false;
    statusRef.current = 'closed';

    stopMicCapture();
    stopPlayback();

    const session = sessionRef.current;
    sessionRef.current = null;
    try {
      session?.close();
    } catch {
      /* ignore */
    }

    playbackGainRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    userTranscriptRef.current = '';
    agentTranscriptRef.current = '';
    setLiveUserText('');
    setLiveAgentText('');
    setStatus('closed');
  }, [stopMicCapture, stopPlayback]);

  const pause = useCallback(() => {
    if (
      !sessionAliveRef.current ||
      statusRef.current === 'paused' ||
      statusRef.current === 'connecting' ||
      statusRef.current === 'closed' ||
      statusRef.current === 'idle'
    ) {
      return;
    }

    micPausedRef.current = true;
    stopPlayback();

    try {
      sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      /* ignore */
    }

    statusRef.current = 'paused';
    setStatus('paused');
  }, [stopPlayback]);

  const resume = useCallback(async () => {
    if (statusRef.current !== 'paused' || !sessionAliveRef.current) return;

    micPausedRef.current = false;
    const ctx = audioContextRef.current;
    if (ctx) {
      await ctx.resume();
    }
    setStatus('listening');
  }, []);

  const connect = useCallback(async () => {
    if (
      statusRef.current === 'connecting' ||
      statusRef.current === 'listening' ||
      statusRef.current === 'agentSpeaking' ||
      statusRef.current === 'paused'
    ) {
      return;
    }

    setError(null);
    setStatus('connecting');
    micPausedRef.current = false;
    userTurnsRef.current = 0;
    setUserTurns(0);
    closingHandledRef.current = false;
    messagesRef.current = [];
    setMessages([]);
    userTranscriptRef.current = '';
    agentTranscriptRef.current = '';
    setLiveUserText('');
    setLiveAgentText('');

    try {
      const res = await fetch('/api/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: options.firstName,
          mode: options.mode ?? 'joven',
          companyName: options.companyName,
        }),
      });
      const data = (await res.json()) as {
        token?: string;
        model?: string;
        apiVersion?: string;
        error?: string;
      };

      if (!res.ok || !data.token || !data.model) {
        setError(data.error || 'No pudimos iniciar modo voz.');
        setStatus('error');
        return;
      }

      const ai = new GoogleGenAI({
        apiKey: data.token,
        httpOptions: { apiVersion: data.apiVersion || 'v1alpha' },
      });

      const session = await ai.live.connect({
        model: data.model,
        callbacks: {
          onopen: () => {
            sessionAliveRef.current = true;
            setStatus('listening');
          },
          onmessage: handleServerMessage,
          onerror: (e) => {
            sessionAliveRef.current = false;
            setError(e.message || 'Error en la conexión de voz.');
            setStatus('error');
          },
          onclose: (e) => {
            sessionAliveRef.current = false;
            micPausedRef.current = false;
            sessionRef.current = null;
            const wasError = statusRef.current === 'error';
            statusRef.current = 'closed';
            cleanupAudio();
            const reason = e?.reason?.trim();
            if (!wasError && reason) {
              setError(reason);
              setStatus('error');
            } else if (!wasError) {
              setStatus('closed');
            }
          },
        },
      });
      sessionRef.current = session;

      const openingPrompt =
        options.mode === 'empresa'
          ? buildLiveOpeningUserPromptEmpresa(options.companyName)
          : buildLiveOpeningUserPrompt(options.firstName);
      session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: openingPrompt }] }],
        turnComplete: true,
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      await ctx.resume();

      const playbackGain = ctx.createGain();
      playbackGain.connect(ctx.destination);
      playbackGainRef.current = playbackGain;

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        if (!sessionAliveRef.current || !sessionRef.current || micPausedRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        const resampled = resampleFloat32(input, ctx.sampleRate, LIVE_INPUT_SAMPLE_RATE);
        const b64 = float32ToPcm16Base64(resampled);
        try {
          sessionRef.current.sendRealtimeInput({
            audio: { data: b64, mimeType: `audio/pcm;rate=${LIVE_INPUT_SAMPLE_RATE}` },
          });
        } catch {
          sessionAliveRef.current = false;
        }
      };

      const silent = ctx.createGain();
      silent.gain.value = 0;
      source.connect(processor);
      processor.connect(silent);
      silent.connect(ctx.destination);
    } catch (err) {
      sessionAliveRef.current = false;
      micPausedRef.current = false;
      setError(err instanceof Error ? err.message : 'No pudimos conectar modo voz.');
      setStatus('error');
      cleanupAudio();
      try {
        sessionRef.current?.close();
      } catch {
        /* ignore */
      }
      sessionRef.current = null;
    }
  }, [cleanupAudio, handleServerMessage, options.firstName]);

  useEffect(() => {
    return () => {
      sessionAliveRef.current = false;
      micPausedRef.current = false;
      statusRef.current = 'closed';
      stopMicCapture();
      stopPlayback();
      const session = sessionRef.current;
      sessionRef.current = null;
      try {
        session?.close();
      } catch {
        /* ignore */
      }
      playbackGainRef.current = null;
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stopMicCapture, stopPlayback]);

  return {
    status,
    messages,
    liveUserText,
    liveAgentText,
    userTurns,
    error,
    connect,
    disconnect,
    pause,
    resume,
    clearError: () => setError(null),
    isPaused: status === 'paused',
    isActive:
      status === 'listening' ||
      status === 'agentSpeaking' ||
      status === 'connecting' ||
      status === 'paused',
  };
}

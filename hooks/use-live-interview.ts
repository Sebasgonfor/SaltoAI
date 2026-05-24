'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI, type LiveServerMessage, type Session } from '@google/genai/web';
import type { ChatMessage } from '@/lib/types';
import {
  float32ToPcm16Base64,
  resampleFloat32,
  pcm16Base64ToFloat32,
  LIVE_INPUT_SAMPLE_RATE,
  LIVE_OUTPUT_SAMPLE_RATE,
} from '@/lib/audio-pcm';
import {
  buildLiveOpeningUserPrompt,
  CLOSING_MESSAGE,
  MAX_USER_TURNS,
} from '@/lib/interview-prompt';

export type LiveInterviewStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'agentSpeaking'
  | 'error'
  | 'closed';

function isClosingMessage(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('perfil de evidencia') || t.includes('construir tu perfil');
}

export function useLiveInterview(options: {
  firstName?: string;
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
  const onCompleteRef = useRef(options.onInterviewComplete);

  useEffect(() => {
    onCompleteRef.current = options.onInterviewComplete;
  }, [options.onInterviewComplete]);

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
    const ctx = audioContextRef.current;
    if (!ctx || !base64) return;

    const floats = pcm16Base64ToFloat32(base64);
    if (floats.length === 0) return;

    const buffer = ctx.createBuffer(1, floats.length, sampleRate);
    buffer.copyToChannel(new Float32Array(floats), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(source);

    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((x) => x !== source);
      if (
        activeSourcesRef.current.length === 0 &&
        statusRef.current !== 'connecting' &&
        statusRef.current !== 'closed'
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

      if (isClosingMessage(text) && !closingHandledRef.current) {
        closingHandledRef.current = true;
        onCompleteRef.current?.(messagesRef.current);
      }
    }
  }, [appendMessage]);

  const finalizeUserTurn = useCallback(() => {
    const text = userTranscriptRef.current.trim();
    if (!text) return;

    appendMessage({ role: 'user', content: text });
    userTranscriptRef.current = '';
    setLiveUserText('');

    userTurnsRef.current += 1;
    setUserTurns(userTurnsRef.current);

    if (userTurnsRef.current >= MAX_USER_TURNS && sessionRef.current && !closingHandledRef.current) {
      sessionRef.current.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: `Llegamos al turno ${MAX_USER_TURNS}. Cerrá la entrevista con el mensaje: "${CLOSING_MESSAGE}"`,
              },
            ],
          },
        ],
        turnComplete: true,
      });
    }
  }, [appendMessage]);

  const handleServerMessage = useCallback(
    (msg: LiveServerMessage) => {
      const sc = msg.serverContent;
      if (!sc) return;

      if (sc.interrupted) {
        stopPlayback();
        if (statusRef.current !== 'closed') setStatus('listening');
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
          const data = part.inlineData?.data;
          const mime = part.inlineData?.mimeType ?? '';
          if (data && mime.includes('audio')) {
            schedulePcmPlayback(data, LIVE_OUTPUT_SAMPLE_RATE);
          }
        }
      }

      const audioData = msg.data;
      if (audioData) {
        schedulePcmPlayback(audioData, LIVE_OUTPUT_SAMPLE_RATE);
      }

      if (sc.turnComplete) {
        finalizeUserTurn();
        finalizeAgentTurn();

        if (
          userTurnsRef.current >= MAX_USER_TURNS &&
          !closingHandledRef.current &&
          messagesRef.current.some((m) => m.role === 'agent' && isClosingMessage(m.content))
        ) {
          closingHandledRef.current = true;
          onCompleteRef.current?.(messagesRef.current);
        }

        if (statusRef.current !== 'closed' && activeSourcesRef.current.length === 0) {
          setStatus('listening');
        }
      }
    },
    [finalizeAgentTurn, finalizeUserTurn, schedulePcmPlayback, stopPlayback]
  );

  const cleanupAudio = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    stopPlayback();
    cleanupAudio();
    try {
      sessionRef.current?.close();
    } catch {
      /* ignore */
    }
    sessionRef.current = null;
    userTranscriptRef.current = '';
    agentTranscriptRef.current = '';
    setLiveUserText('');
    setLiveAgentText('');
    setStatus('closed');
  }, [cleanupAudio, stopPlayback]);

  const connect = useCallback(async () => {
    if (
      statusRef.current === 'connecting' ||
      statusRef.current === 'listening' ||
      statusRef.current === 'agentSpeaking'
    ) {
      return;
    }

    setError(null);
    setStatus('connecting');
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
        body: JSON.stringify({ firstName: options.firstName }),
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
            setStatus('listening');
          },
          onmessage: handleServerMessage,
          onerror: (e) => {
            setError(e.message || 'Error en la conexión de voz.');
            setStatus('error');
          },
          onclose: () => {
            cleanupAudio();
            if (statusRef.current !== 'error') setStatus('closed');
          },
        },
      });
      sessionRef.current = session;

      session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text: buildLiveOpeningUserPrompt(options.firstName) }],
          },
        ],
        turnComplete: true,
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        if (!sessionRef.current || statusRef.current === 'closed') return;
        const input = e.inputBuffer.getChannelData(0);
        const resampled = resampleFloat32(input, ctx.sampleRate, LIVE_INPUT_SAMPLE_RATE);
        const b64 = float32ToPcm16Base64(resampled);
        sessionRef.current.sendRealtimeInput({
          audio: { data: b64, mimeType: `audio/pcm;rate=${LIVE_INPUT_SAMPLE_RATE}` },
        });
      };

      const silent = ctx.createGain();
      silent.gain.value = 0;
      source.connect(processor);
      processor.connect(silent);
      silent.connect(ctx.destination);
    } catch (err) {
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
      stopPlayback();
      cleanupAudio();
      try {
        sessionRef.current?.close();
      } catch {
        /* ignore */
      }
      sessionRef.current = null;
    };
  }, [cleanupAudio, stopPlayback]);

  return {
    status,
    messages,
    liveUserText,
    liveAgentText,
    userTurns,
    error,
    connect,
    disconnect,
    clearError: () => setError(null),
    isActive:
      status === 'listening' || status === 'agentSpeaking' || status === 'connecting',
  };
}

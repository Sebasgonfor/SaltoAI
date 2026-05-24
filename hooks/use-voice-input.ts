'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const PREFERRED_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const mime of PREFERRED_MIMES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('No se pudo leer el audio.'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el audio.'));
    reader.readAsDataURL(blob);
  });
}

function releaseStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useVoiceInput(lang = 'es-CO') {
  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef('audio/webm');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setIsSupported(
      typeof window !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined'
    );
  }, []);

  const cleanupRecording = useCallback(() => {
    recorderRef.current = null;
    chunksRef.current = [];
    releaseStream(streamRef.current);
    streamRef.current = null;
    setIsRecording(false);
  }, []);

  const cancelRecording = useCallback((_reason = 'unknown') => {
    abortRef.current?.abort();
    abortRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.onstop = null;
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    cleanupRecording();
    setIsTranscribing(false);
  }, [cleanupRecording]);

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) return;

    setError(null);
    abortRef.current?.abort();
    abortRef.current = null;

    if (!isSupported) {
      setError('Tu navegador no permite grabar audio. Usá Chrome o Edge.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickRecorderMime();
      mimeTypeRef.current = mimeType || 'audio/webm';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setError('Falló la grabación de audio. Intentá de nuevo.');
        cancelRecording();
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      cleanupRecording();
      setError(
        'Necesitamos permiso de micrófono. Permitilo en el navegador e intentá otra vez.'
      );
    }
  }, [cancelRecording, cleanupRecording, isRecording, isSupported, isTranscribing]);

  const stopRecording = useCallback(async (): Promise<string> => {
    if (!isRecording && !recorderRef.current) {
      return '';
    }

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanupRecording();
      return '';
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const type = mimeTypeRef.current || recorder.mimeType || 'audio/webm';
        resolve(new Blob(chunksRef.current, { type }));
      };
      recorder.onerror = () => reject(new Error('Falló la grabación.'));
      try {
        recorder.stop();
      } catch (err) {
        reject(err instanceof Error ? err : new Error('No se pudo detener la grabación.'));
      }
    });

    releaseStream(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);

    if (blob.size === 0) {
      setError('No se capturó audio. Hablá un poco más cerca del micrófono e intentá de nuevo.');
      return '';
    }

    setIsTranscribing(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const audioBase64 = await blobToBase64(blob);
      const res = await fetch('/api/transcribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: blob.type || mimeTypeRef.current,
          lang,
        }),
        signal: controller.signal,
      });

      const data = (await res.json()) as { text?: string; error?: string };

      if (!res.ok) {
        setError(data.error || 'No pudimos transcribir tu audio. Intentá de nuevo o escribí.');
        return '';
      }

      return typeof data.text === 'string' ? data.text.trim() : '';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return '';
      setError('Error de red al transcribir. Revisá tu conexión e intentá de nuevo.');
      return '';
    } finally {
      abortRef.current = null;
      setIsTranscribing(false);
    }
  }, [cleanupRecording, isRecording, lang]);

  useEffect(() => {
    return () => {
      cancelRecording();
    };
  }, [cancelRecording]);

  return {
    isSupported,
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError: () => setError(null),
  };
}

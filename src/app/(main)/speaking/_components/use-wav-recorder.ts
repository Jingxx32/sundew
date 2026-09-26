"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downsampleTo16k, encodeWavPcm16 } from "@/lib/audio/wav-encoder";

/**
 * Records mic input and produces a 16kHz mono PCM16 WAV Blob.
 * Uses ScriptProcessorNode (deprecated but universally supported); the
 * capture path is isolated here so swapping to AudioWorklet later only
 * touches this file.
 */
export function useWavRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleCountRef = useRef(0);

  useEffect(() => () => {
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void ctxRef.current?.close();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      sampleCountRef.current = 0;
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const remaining = Math.max(0, ctx.sampleRate * 30 - sampleCountRef.current);
        if (remaining > 0) {
          const chunk = new Float32Array(input.subarray(0, Math.min(input.length, remaining)));
          chunksRef.current.push(chunk);
          sampleCountRef.current += chunk.length;
        }
        if (remaining <= input.length) setError("30-second recording limit reached. Stop and send this turn.");
      };
      source.connect(processor);
      processor.connect(ctx.destination); // required for onaudioprocess to fire
      ctxRef.current = ctx;
      streamRef.current = stream;
      processorRef.current = processor;
      setIsRecording(true);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access denied — allow it in your browser settings."
          : "Could not start recording.",
      );
      throw err;
    }
  }, []);

  const stop = useCallback(async (): Promise<Blob> => {
    const ctx = ctxRef.current;
    if (!ctx) throw new Error("Not recording");
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const sampleRate = ctx.sampleRate;
    await ctx.close();
    ctxRef.current = null;
    streamRef.current = null;
    processorRef.current = null;
    setIsRecording(false);

    const total = chunksRef.current.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(total);
    let off = 0;
    for (const c of chunksRef.current) {
      all.set(c, off);
      off += c.length;
    }
    chunksRef.current = [];

    const wav = encodeWavPcm16(downsampleTo16k(all, sampleRate), 16000);
    return new Blob([wav], { type: "audio/wav" });
  }, []);

  return { isRecording, start, stop, error };
}

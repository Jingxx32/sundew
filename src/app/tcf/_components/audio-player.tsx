"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AudioPlayerHandle {
  togglePlay: () => void;
  rewind: () => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const REWIND_SECONDS = 5;

/**
 * A token-built stand-in for the browser's `<audio controls>` pill, which
 * clashed with the app's beige/blue surface. The signature touch: every
 * rewind or restart leaves a faint mark on the track — the strip becomes a
 * quiet record of how many times this question needed a second listen,
 * which is exactly the signal the planned TCF error loop cares about (see
 * docs/superpowers/specs/2026-07-06-tcf-error-loop-design.md). Marks are
 * visual only this pass — nothing is persisted yet.
 */
export const AudioPlayer = forwardRef<AudioPlayerHandle, { src: string }>(function AudioPlayer(
  { src },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState<1 | 0.75>(1);
  const [scars, setScars] = useState<number[]>([]);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setScars([]);
  }, [src]);

  function markScar() {
    if (!duration) return;
    setScars((previous) => [...previous, (audioRef.current?.currentTime ?? 0) / duration]);
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  function rewind() {
    const el = audioRef.current;
    if (!el) return;
    markScar();
    el.currentTime = Math.max(0, el.currentTime - REWIND_SECONDS);
    if (el.paused) void el.play();
  }

  function restart() {
    const el = audioRef.current;
    if (!el) return;
    markScar();
    el.currentTime = 0;
    void el.play();
  }

  function seek(event: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
  }

  function seekBy(delta: number) {
    const el = audioRef.current;
    if (!el || !duration) return;
    el.currentTime = Math.min(duration, Math.max(0, el.currentTime + delta));
  }

  function handleTrackKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el || !duration) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        seekBy(5);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        seekBy(-5);
        break;
      case "Home":
        event.preventDefault();
        el.currentTime = 0;
        break;
      case "End":
        event.preventDefault();
        el.currentTime = duration;
        break;
    }
  }

  function toggleRate() {
    const next = rate === 1 ? 0.75 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  useImperativeHandle(ref, () => ({ togglePlay, rewind }));

  const progress = duration ? currentTime / duration : 0;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface px-4 py-3">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        className="hidden"
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Lecture"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-colors touch-manipulation hover:bg-accent/90"
      >
        {playing ? (
          <Pause className="h-4 w-4" fill="currentColor" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4 translate-x-0.5" fill="currentColor" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        onClick={rewind}
        aria-label={`Reculer de ${REWIND_SECONDS} secondes`}
        title={`-${REWIND_SECONDS} s`}
        className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-mono text-muted-foreground transition-colors touch-manipulation hover:text-accent"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        {REWIND_SECONDS}s
      </button>

      <div className="flex flex-1 items-center gap-2">
        <span className="w-9 shrink-0 font-mono text-[11px] text-muted-foreground">{formatTime(currentTime)}</span>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Position de lecture"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatTime(currentTime)} sur ${formatTime(duration)}`}
          onClick={seek}
          onKeyDown={handleTrackKeyDown}
          className="group relative h-4 flex-1 cursor-pointer touch-manipulation rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-surface-muted" />
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
            style={{ width: `${progress * 100}%` }}
          />
          {/* Rewind scars — faint ticks where the listener asked to hear it again. */}
          {scars.map((position, index) => (
            <div
              key={index}
              className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-warning/60"
              style={{ left: `${position * 100}%` }}
            />
          ))}
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-accent transition-transform group-hover:scale-110"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <span className="w-9 shrink-0 font-mono text-[11px] text-muted-foreground">{formatTime(duration)}</span>
      </div>

      <button
        type="button"
        onClick={restart}
        aria-label="Recommencer"
        className="shrink-0 rounded-lg px-1.5 py-1 text-[11px] font-mono text-muted-foreground transition-colors touch-manipulation hover:text-accent"
      >
        ⟲ 0:00
      </button>

      <button
        type="button"
        onClick={toggleRate}
        aria-label={`Vitesse de lecture : ${rate}×`}
        className={cn(
          "shrink-0 rounded-lg px-2 py-1 font-mono text-[11px] font-medium transition-colors touch-manipulation",
          rate === 0.75 ? "bg-accent-soft text-accent" : "text-muted-foreground hover:text-accent",
        )}
      >
        {rate}×
      </button>
    </div>
  );
});

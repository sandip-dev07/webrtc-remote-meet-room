import React, { useEffect, useRef, useState } from 'react';
import { MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CameraBlurMode } from '@/store/meeting-store';

interface VideoPlayerProps {
  stream: MediaStream | null;
  username: string;
  isLocal?: boolean;
  muted?: boolean;
  blurMode?: CameraBlurMode;
  aspect?: "video" | "square" | "auto";
  className?: string;
}

export function VideoPlayer({
  stream,
  username,
  isLocal = false,
  muted = false,
  blurMode = "none",
  aspect = "video",
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [, setTrackTick] = useState(0);

  useEffect(() => {
    if (!stream) return;

    const bump = () => setTrackTick((v) => v + 1);
    const attachTrackListeners = () => {
      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", bump);
        track.addEventListener("mute", bump);
        track.addEventListener("unmute", bump);
      });
    };
    const detachTrackListeners = () => {
      stream.getTracks().forEach((track) => {
        track.removeEventListener("ended", bump);
        track.removeEventListener("mute", bump);
        track.removeEventListener("unmute", bump);
      });
    };

    attachTrackListeners();
    stream.addEventListener("addtrack", bump);
    stream.addEventListener("removetrack", bump);

    return () => {
      detachTrackListeners();
      stream.removeEventListener("addtrack", bump);
      stream.removeEventListener("removetrack", bump);
    };
  }, [stream]);

  const hasVideo = Boolean(
    stream?.getVideoTracks().some((track) => {
      if (track.readyState !== "live") return false;
      if (isLocal) return track.enabled;
      return true;
    }),
  );
  const hasAudio = Boolean(
    stream?.getAudioTracks().some((track) => {
      if (track.readyState !== "live") return false;
      if (isLocal) return track.enabled;
      return true;
    }),
  );

  useEffect(() => {
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;
    if (!stream) return;

    if (videoEl) {
      videoEl.srcObject = stream;
      void videoEl.play().catch(() => {
        // Ignore autoplay errors until user interaction.
      });
    }
    if (audioEl) {
      audioEl.srcObject = stream;
      void audioEl.play().catch(() => {
        // Ignore autoplay errors until user interaction.
      });
    }
  }, [stream, hasVideo, hasAudio]);

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden bg-card/80 border border-white/5 shadow-xl group",
        aspect === "auto"
          ? "w-full h-full"
          : "min-h-[180px] sm:min-h-[220px]",
        aspect === "square" ? "aspect-square" : aspect === "video" ? "aspect-video" : "",
        className,
      )}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal || muted}
          className={cn(
            "w-full h-full object-contain transition-transform duration-500",
            blurMode === "light" && "blur-[2px] scale-[1.02]",
            blurMode === "strong" && "blur-[5px] scale-[1.03]",
            isLocal && "scale-x-[-1]" // Mirror local video
          )}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-secondary/50">
          <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center text-4xl font-display font-bold text-primary">
            {username.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      <audio ref={audioRef} autoPlay playsInline muted={isLocal || muted} className="hidden" />
      
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
        <div className="bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg text-sm font-medium text-white shadow-sm flex items-center gap-2">
          {username} {isLocal && "(You)"}
        </div>
        
        {!hasAudio && (
          <div className="bg-destructive/80 backdrop-blur-md p-1.5 rounded-full text-white shadow-sm animate-pulse">
            <MicOff size={16} />
          </div>
        )}
      </div>
    </div>
  );
}

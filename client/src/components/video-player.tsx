import React, { useEffect, useRef } from 'react';
import { MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoPlayerProps {
  stream: MediaStream | null;
  username: string;
  isLocal?: boolean;
  muted?: boolean;
  className?: string;
}

export function VideoPlayer({ stream, username, isLocal = false, muted = false, className }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Check if audio track is enabled
  const hasAudio = stream?.getAudioTracks()[0]?.enabled ?? false;
  // Check if video track is enabled
  const hasVideo = stream?.getVideoTracks()[0]?.enabled ?? false;

  return (
    <div className={cn("relative rounded-2xl overflow-hidden bg-card/80 border border-white/5 shadow-xl group", className)}>
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal || muted}
          className={cn(
            "w-full h-full object-cover transition-transform duration-500",
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

      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
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

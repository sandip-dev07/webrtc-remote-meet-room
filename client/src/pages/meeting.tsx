import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, MessageSquare, Minimize2, Maximize2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMeetingStore } from "@/store/meeting-store";
import { useWebRTC } from "@/hooks/use-webrtc";
import { useSubroom } from "@/hooks/use-api";
import { VideoPlayer } from "@/components/video-player";
import { ChatSidebar } from "@/components/chat-sidebar";
import { useToast } from "@/hooks/use-toast";

interface MeetingProps {
  roomId: string;
  subroomId: string;
  mode?: "full" | "mini";
}

interface MiniMeetingPanelProps {
  subroomName?: string;
  localStream: MediaStream | null;
  username: string;
  isScreenSharing: boolean;
  cameraBlurMode: "none" | "light" | "strong";
  isMicOn: boolean;
  isCamOn: boolean;
  onRestore: () => void;
  onLeave: () => void;
  onToggleMic: () => Promise<void>;
  onToggleCam: () => Promise<void>;
}

function MiniMeetingPanel({
  subroomName,
  localStream,
  username,
  isScreenSharing,
  cameraBlurMode,
  isMicOn,
  isCamOn,
  onRestore,
  onLeave,
  onToggleMic,
  onToggleCam,
}: MiniMeetingPanelProps) {
  return (
    <div className="fixed left-2 right-2 bottom-2 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[360px] z-50">
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0F1115]/95 backdrop-blur-xl shadow-2xl">
        <div className="h-12 px-3 flex items-center justify-between border-b border-white/10">
          <div className="text-sm font-medium text-white truncate pr-3">
            {subroomName || "Subroom"}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onRestore}
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-white hover:bg-white/10"
              aria-label="Restore subroom"
            >
              <Maximize2 size={16} />
            </Button>
            <Button
              onClick={onLeave}
              variant="destructive"
              size="icon"
              className="h-8 w-8 rounded-lg"
              aria-label="Leave subroom"
            >
              <PhoneOff size={16} />
            </Button>
          </div>
        </div>

        <div className="h-[200px] p-2">
          <VideoPlayer
            stream={localStream}
            username={username}
            isLocal={!isScreenSharing}
            muted={true}
            blurMode={!isScreenSharing ? cameraBlurMode : "none"}
            className="h-full rounded-xl"
          />
        </div>

        <div className="h-14 px-3 pb-3 flex items-center justify-center gap-2">
          <Button
            onClick={onToggleMic}
            variant={isMicOn ? "secondary" : "destructive"}
            size="icon"
            className="h-9 w-9 rounded-full"
          >
            {isMicOn ? <Mic size={16} /> : <MicOff size={16} />}
          </Button>
          <Button
            onClick={onToggleCam}
            variant={isCamOn ? "secondary" : "destructive"}
            size="icon"
            className="h-9 w-9 rounded-full"
          >
            {isCamOn ? <Video size={16} /> : <VideoOff size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MeetingFooterProps {
  subroomName?: string;
  isMicOn: boolean;
  isCamOn: boolean;
  isScreenSharing: boolean;
  canScreenShare: boolean;
  cameraBlurMode: "none" | "light" | "strong";
  isChatOpen: boolean;
  onToggleMic: () => Promise<void>;
  onToggleCam: () => Promise<void>;
  onCycleBlurMode: () => void;
  onToggleScreenShare: () => Promise<void>;
  onToggleChat: () => void;
  onLeave: () => void;
}

function MeetingFooter({
  subroomName,
  isMicOn,
  isCamOn,
  isScreenSharing,
  canScreenShare,
  cameraBlurMode,
  isChatOpen,
  onToggleMic,
  onToggleCam,
  onCycleBlurMode,
  onToggleScreenShare,
  onToggleChat,
  onLeave,
}: MeetingFooterProps) {
  return (
    <footer className="h-20 sm:h-24 bg-black/50 backdrop-blur-xl border-t border-white/10 flex items-center justify-between px-2 sm:px-4 lg:px-8 z-30">
      <div className="hidden xl:block flex-1 min-w-0">
        <p className="text-white/50 text-sm truncate">
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} | {subroomName}
        </p>
      </div>

      <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 w-full xl:flex-1 min-w-0">
        <Button
          onClick={onToggleMic}
          variant={isMicOn ? "secondary" : "destructive"}
          size="icon"
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full hover:scale-105 transition-transform"
        >
          {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
        </Button>

        <Button
          onClick={onToggleCam}
          variant={isCamOn ? "secondary" : "destructive"}
          size="icon"
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full hover:scale-105 transition-transform"
        >
          {isCamOn ? <Video size={18} /> : <VideoOff size={18} />}
        </Button>

        <Button
          onClick={onCycleBlurMode}
          variant={cameraBlurMode === "none" ? "secondary" : "default"}
          size="icon"
          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full hover:scale-105 transition-transform ${
            cameraBlurMode !== "none" ? "bg-blue-500 hover:bg-blue-600" : ""
          }`}
          disabled={!isCamOn || isScreenSharing}
          title={`Background blur: ${cameraBlurMode}`}
        >
          <Sparkles size={18} className={cameraBlurMode !== "none" ? "text-white" : ""} />
        </Button>

        <Button
          onClick={onToggleScreenShare}
          variant={isScreenSharing ? "default" : "secondary"}
          size="icon"
          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full hover:scale-105 transition-transform ${isScreenSharing ? 'bg-blue-500 hover:bg-blue-600' : ''}`}
          disabled={!canScreenShare}
          title={!canScreenShare ? "Screen share not supported on this browser/device" : undefined}
        >
          <MonitorUp size={18} className={isScreenSharing ? "text-white" : ""} />
        </Button>

        <Button
          onClick={onToggleChat}
          variant={isChatOpen ? "secondary" : "default"}
          size="icon"
          className={`md:hidden w-10 h-10 rounded-full hover:bg-white/10 ${isChatOpen ? 'bg-white/10 text-primary' : 'text-white'}`}
        >
          <MessageSquare size={18} />
        </Button>

        <div className="hidden sm:block w-px h-8 bg-white/10 mx-2" />

        <Button
          onClick={onLeave}
          variant="destructive"
          className="px-3 sm:px-5 h-10 sm:h-12 rounded-full font-medium hover:bg-red-600 hover:scale-105 transition-transform shadow-lg shadow-red-500/20"
        >
          <PhoneOff size={18} className="sm:mr-2" />
          <span className="hidden sm:inline">Leave</span>
        </Button>
      </div>

      <div className="hidden xl:flex flex-1 justify-end">
        <Button
          onClick={onToggleChat}
          variant={isChatOpen ? "secondary" : "ghost"}
          size="icon"
          className={`w-12 h-12 rounded-full hover:bg-white/10 ${isChatOpen ? 'bg-white/10 text-primary' : 'text-white bg-sky-500'}`}
        >
          <MessageSquare size={20} />
        </Button>
      </div>
    </footer>
  );
}

export default function Meeting({ roomId, subroomId, mode = "full" }: MeetingProps) {
  const [, setLocation] = useLocation();
  const { username, cameraBlurMode, setCameraBlurMode, setSubroomMinimized } = useMeetingStore();
  const { toast } = useToast();
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const cycleBlurMode = () => {
    if (cameraBlurMode === "none") {
      setCameraBlurMode("light");
      return;
    }
    if (cameraBlurMode === "light") {
      setCameraBlurMode("strong");
      return;
    }
    setCameraBlurMode("none");
  };

  // Fetch subroom details just for the name
  const { data: subroomData, error: subroomError } = useSubroom(subroomId);

  // Initialize WebRTC and Signaling
  const { 
    localStream, 
    peers, 
    isConnected, 
    error: rtcError,
    isMicOn,
    isCamOn,
    toggleMic,
    toggleCam,
    isScreenSharing,
    canScreenShare,
    toggleScreenShare,
    ws
  } = useWebRTC({ roomId, subroomId, username });

  // Calculate dynamic grid layout based on participant count
  const participantCount = Object.keys(peers).length + 1; // +1 for local
  const tileAspect: "video" | "square" | "auto" = participantCount === 1 ? "auto" : "video";
  const participantTiles = [
    {
      key: "local",
      stream: localStream,
      username,
      isLocal: !isScreenSharing,
      muted: true,
      blurMode: !isScreenSharing ? cameraBlurMode : "none" as const,
      aspect: tileAspect,
    },
    ...Object.entries(peers).map(([peerId, peer]) => ({
      key: peerId,
      stream: peer.stream,
      username: peer.username,
      isLocal: false,
      muted: false,
      blurMode: "none" as const,
      aspect: tileAspect,
    })),
  ];
  
  const gridClass = useMemo(() => {
    if (participantCount === 1) return "grid-cols-1";
    if (participantCount === 2) return "grid-cols-1 md:grid-cols-2";
    if (participantCount === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
    if (participantCount === 4) return "grid-cols-1 sm:grid-cols-2";
    if (participantCount <= 6) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
    if (participantCount <= 9) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  }, [participantCount]);

  // If missing username, kick to home
  if (!username) {
    setLocation("/");
    return null;
  }

  if (subroomError || rtcError) {
    return (
      <div className="h-screen bg-background flex items-center justify-center p-4 text-center">
        <div className="glass-panel p-8 rounded-3xl max-w-md w-full border-destructive/20">
          <h2 className="text-xl font-bold text-destructive mb-2">Connection Error</h2>
          <p className="text-muted-foreground mb-6">{rtcError || "Could not join the room."}</p>
          <Button onClick={() => setLocation(`/room/${roomId}`)} className="rounded-xl w-full">Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const handleLeave = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (ws) ws.close();
    setSubroomMinimized(false);
    setLocation(`/room/${roomId}`);
  };

  const handleMinimize = () => {
    setSubroomMinimized(true);
    setLocation(`/room/${roomId}?subroom=${encodeURIComponent(subroomId)}`);
  };

  const handleRestore = () => {
    setSubroomMinimized(false);
    setLocation(`/room/${roomId}?subroom=${encodeURIComponent(subroomId)}`);
  };

  const handleToggleScreenShare = async () => {
    if (!canScreenShare) {
      toast({
        title: "Screen share not supported",
        description: "Use Chrome/Edge on Android over HTTPS. iOS browsers currently do not support web screen sharing.",
        variant: "destructive",
      });
      return;
    }
    try {
      await toggleScreenShare();
    } catch (err: any) {
      toast({
        title: "Screen share failed",
        description:
          err?.message ||
          "Could not start screen sharing. Close apps using capture and try again.",
        variant: "destructive",
      });
    }
  };

  if (mode === "mini") {
    return (
      <MiniMeetingPanel
        subroomName={subroomData?.name}
        localStream={localStream}
        username={username}
        isScreenSharing={isScreenSharing}
        cameraBlurMode={cameraBlurMode}
        isMicOn={isMicOn}
        isCamOn={isCamOn}
        onRestore={handleRestore}
        onLeave={handleLeave}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
      />
    );
  }

  return (
    <div className="h-dvh bg-[#090E1A] flex flex-col overflow-y-auto overflow-x-hidden font-sans">
      
      {/* Top Bar */}
      <header className="h-14 sm:h-16 px-3 sm:px-6 flex items-center justify-between bg-black/30 border-b border-white/10 z-10">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Video size={16} className="text-primary" />
          </div>
          <h1 className="text-base sm:text-lg font-display font-medium text-white truncate">
            {subroomData?.name || "Loading..."}
          </h1>
          <span className="bg-white/10 text-white/70 text-xs px-2 py-1 rounded-md ml-1 sm:ml-2 font-mono">
            {participantCount}/10
          </span>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs font-medium px-2 sm:px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
            <span className="hidden sm:inline">{isConnected ? 'Connected' : 'Connecting...'}</span>
          </div>
          <Button
            onClick={handleMinimize}
            variant="ghost"
            size="icon"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-white hover:bg-white/10"
            aria-label="Minimize subroom"
          >
            <Minimize2 size={16} />
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-y-auto overflow-x-hidden relative min-h-0">
        
        {/* Video Grid */}
        <div className={`flex-1 p-2 sm:p-4 lg:p-5 transition-all duration-300 ${isChatOpen ? 'mr-0' : ''}`}>
          <div className={`w-full h-full video-grid ${gridClass} gap-3`}>
            {participantTiles.map((tile) => (
              <VideoPlayer
                key={tile.key}
                stream={tile.stream}
                username={tile.username}
                isLocal={tile.isLocal}
                muted={tile.muted}
                blurMode={tile.blurMode}
                aspect={tile.aspect}
                className={participantCount === 1 ? "h-full max-h-full" : ""}
              />
            ))}

          </div>
        </div>

        {/* Sidebar overlay container for mobile, inline for desktop */}
        <div className={`absolute top-0 bottom-20 sm:bottom-24 right-2 sm:right-4 w-[calc(100vw-1rem)] sm:w-auto z-20 transition-all duration-300 transform ${isChatOpen ? 'translate-x-0' : 'translate-x-[120%]'}`}>
          <ChatSidebar 
            isOpen={isChatOpen} 
            onClose={() => setIsChatOpen(false)}
            ws={ws}
            subroomId={subroomId}
            peers={peers}
          />
        </div>
      </main>

      <MeetingFooter
        subroomName={subroomData?.name}
        isMicOn={isMicOn}
        isCamOn={isCamOn}
        isScreenSharing={isScreenSharing}
        canScreenShare={canScreenShare}
        cameraBlurMode={cameraBlurMode}
        isChatOpen={isChatOpen}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onCycleBlurMode={cycleBlurMode}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        onLeave={handleLeave}
      />
    </div>
  );
}

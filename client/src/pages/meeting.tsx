import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, MessageSquare, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMeetingStore } from "@/store/meeting-store";
import { useWebRTC } from "@/hooks/use-webrtc";
import { useSubroom } from "@/hooks/use-api";
import { VideoPlayer } from "@/components/video-player";
import { ChatSidebar } from "@/components/chat-sidebar";
import { useToast } from "@/hooks/use-toast";

export default function Meeting() {
  const { roomId, subroomId } = useParams<{ roomId: string; subroomId: string }>();
  const [, setLocation] = useLocation();
  const { username, isMicOn, isCamOn, toggleMic, toggleCam } = useMeetingStore();
  const { toast } = useToast();
  
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Fetch subroom details just for the name
  const { data: subroomData, error: subroomError } = useSubroom(subroomId);

  // Initialize WebRTC and Signaling
  const { 
    localStream, 
    peers, 
    isConnected, 
    error: rtcError,
    isScreenSharing,
    toggleScreenShare,
    ws
  } = useWebRTC({ roomId, subroomId, username });

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

  // Calculate dynamic grid layout based on participant count
  const participantCount = Object.keys(peers).length + 1; // +1 for local
  
  const gridClass = useMemo(() => {
    if (participantCount === 1) return "grid-cols-1";
    if (participantCount === 2) return "grid-cols-1 md:grid-cols-2";
    if (participantCount <= 4) return "grid-cols-2";
    if (participantCount <= 6) return "grid-cols-2 md:grid-cols-3";
    return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  }, [participantCount]);

  const handleLeave = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (ws) ws.close();
    setLocation(`/room/${roomId}`);
  };

  return (
    <div className="h-screen bg-[#0F1115] flex flex-col overflow-hidden font-sans">
      
      {/* Top Bar */}
      <header className="h-16 px-6 flex items-center justify-between bg-black/40 border-b border-white/5 z-10">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Video size={16} className="text-primary" />
          </div>
          <h1 className="text-lg font-display font-medium text-white">
            {subroomData?.name || "Loading..."}
          </h1>
          <span className="bg-white/10 text-white/70 text-xs px-2 py-1 rounded-md ml-2 font-mono">
            {participantCount}/10
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
            {isConnected ? 'Connected' : 'Connecting...'}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
        
        {/* Video Grid */}
        <div className={`flex-1 p-4 transition-all duration-300 ${isChatOpen ? 'mr-0' : ''}`}>
          <div className={`w-full h-full video-grid ${gridClass}`}>
            
            {/* Local Video */}
            <VideoPlayer 
              stream={localStream} 
              username={username} 
              isLocal={!isScreenSharing} 
              muted={true} 
            />

            {/* Remote Videos */}
            {Object.entries(peers).map(([peerId, peer]) => (
              <VideoPlayer 
                key={peerId}
                stream={peer.stream}
                username={peer.username}
              />
            ))}

          </div>
        </div>

        {/* Sidebar overlay container for mobile, inline for desktop */}
        <div className={`absolute top-0 bottom-24 right-4 z-20 transition-all duration-300 transform ${isChatOpen ? 'translate-x-0' : 'translate-x-[120%]'}`}>
          <ChatSidebar 
            isOpen={isChatOpen} 
            onClose={() => setIsChatOpen(false)}
            ws={ws}
            subroomId={subroomId}
            peers={peers}
          />
        </div>
      </main>

      {/* Bottom Controls Bar */}
      <footer className="h-24 bg-black/60 backdrop-blur-xl border-t border-white/5 flex items-center justify-between px-6 lg:px-12 z-30">
        <div className="w-1/3">
          <p className="text-white/50 text-sm hidden md:block">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} | {subroomData?.name}</p>
        </div>

        {/* Center Actions */}
        <div className="flex items-center justify-center gap-3 w-1/3">
          <Button 
            onClick={toggleMic}
            variant={isMicOn ? "secondary" : "destructive"}
            size="icon"
            className="w-12 h-12 rounded-full hover:scale-105 transition-transform"
          >
            {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
          </Button>

          <Button 
            onClick={toggleCam}
            variant={isCamOn ? "secondary" : "destructive"}
            size="icon"
            className="w-12 h-12 rounded-full hover:scale-105 transition-transform"
          >
            {isCamOn ? <Video size={20} /> : <VideoOff size={20} />}
          </Button>

          <Button 
            onClick={toggleScreenShare}
            variant={isScreenSharing ? "default" : "secondary"}
            size="icon"
            className={`w-12 h-12 rounded-full hover:scale-105 transition-transform ${isScreenSharing ? 'bg-blue-500 hover:bg-blue-600' : ''}`}
          >
            <MonitorUp size={20} className={isScreenSharing ? "text-white" : ""} />
          </Button>

          <div className="w-px h-8 bg-white/10 mx-2" />

          <Button 
            onClick={handleLeave}
            variant="destructive"
            className="px-6 h-12 rounded-full font-medium hover:bg-red-600 hover:scale-105 transition-transform shadow-lg shadow-red-500/20"
          >
            <PhoneOff size={20} className="mr-2" /> Leave
          </Button>
        </div>

        {/* Right Actions */}
        <div className="w-1/3 flex justify-end">
          <Button 
            onClick={() => setIsChatOpen(!isChatOpen)}
            variant={isChatOpen ? "secondary" : "ghost"}
            size="icon"
            className={`w-12 h-12 rounded-full hover:bg-white/10 ${isChatOpen ? 'bg-white/10 text-primary' : 'text-white'}`}
          >
            <MessageSquare size={20} />
          </Button>
        </div>
      </footer>
    </div>
  );
}

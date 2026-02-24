import { useState } from "react";
import { useLocation } from "wouter";
import { Video, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMeetingStore } from "@/store/meeting-store";
import { useCreateRoom } from "@/hooks/use-api";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [, setLocation] = useLocation();
  const { username, setUsername } = useMeetingStore();
  const { toast } = useToast();
  const createRoom = useCreateRoom();
  
  const [roomId, setRoomId] = useState("");
  const [localName, setLocalName] = useState(username);

  const handleCreate = async () => {
    if (!localName.trim()) {
      toast({ title: "Name required", description: "Please enter your name to continue.", variant: "destructive" });
      return;
    }
    
    setUsername(localName.trim());
    
    try {
      const room = await createRoom.mutateAsync(localName.trim());
      setLocation(`/room/${room.id}`);
      toast({ title: "Room Created", description: `Main room ${room.id} is ready.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleJoin = () => {
    if (!localName.trim() || !roomId.trim()) {
      toast({ title: "Fields required", description: "Please enter both name and Room ID.", variant: "destructive" });
      return;
    }
    
    setUsername(localName.trim());
    setLocation(`/room/${roomId.trim()}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/30 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-5xl px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center z-10">
        
        {/* Left Col - Typography */}
        <div className="space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-medium mb-4">
            <Video size={16} />
            <span>Next-Gen Video Meetings</span>
          </div>
          <h1 className="text-5xl lg:text-7xl font-display font-bold leading-tight text-foreground">
            Connect <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">Anywhere,</span> <br/> Anytime.
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto lg:mx-0">
            Professional video meetings with built-in subrooms. Collaborate seamlessly without limits.
          </p>
        </div>

        {/* Right Col - Forms */}
        <div className="glass-panel p-8 rounded-3xl space-y-8 relative">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80 ml-1">Your Name</label>
            <Input 
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              placeholder="John Doe" 
              className="bg-black/20 border-white/10 h-12 rounded-xl text-lg focus-visible:ring-primary"
            />
          </div>

          <div className="space-y-6">
            <Button 
              onClick={handleCreate}
              disabled={createRoom.isPending}
              className="w-full h-14 text-lg rounded-xl bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-1 font-semibold"
            >
              {createRoom.isPending ? "Creating..." : "Create New Main Room"}
              {!createRoom.isPending && <Plus className="ml-2" />}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-4 text-muted-foreground font-medium rounded-full">Or join existing</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Input 
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter Room ID" 
                className="bg-black/20 border-white/10 h-14 rounded-xl text-lg focus-visible:ring-primary flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
              <Button 
                onClick={handleJoin}
                variant="secondary"
                className="h-14 px-8 rounded-xl font-semibold hover:bg-white/10 transition-colors"
              >
                Join <ArrowRight className="ml-2" size={18} />
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

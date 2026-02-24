import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Plus, Users, LayoutDashboard, Copy, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRoom, useCreateSubroom } from "@/hooks/use-api";
import { useMeetingStore } from "@/store/meeting-store";
import { useToast } from "@/hooks/use-toast";

export default function RoomDashboard() {
  const { id: roomId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { username } = useMeetingStore();
  const { toast } = useToast();
  
  const { data, isLoading, error } = useRoom(roomId);
  const createSubroom = useCreateSubroom(roomId);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSubroomName, setNewSubroomName] = useState("");
  const [copied, setCopied] = useState(false);

  // If user navigated directly here without a name, send them back
  if (!username) {
    setLocation("/");
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-panel p-8 rounded-2xl text-center max-w-md w-full">
          <h2 className="text-2xl font-bold text-destructive mb-2">Room Not Found</h2>
          <p className="text-muted-foreground mb-6">The room you are looking for does not exist or has been closed.</p>
          <Button onClick={() => setLocation("/")} className="w-full rounded-xl">Return Home</Button>
        </div>
      </div>
    );
  }

  const isHost = data?.room?.hostUsername === username;
  const subrooms = data?.subrooms || [];

  const handleCreateSubroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubroomName.trim()) return;
    
    try {
      await createSubroom.mutateAsync(newSubroomName.trim());
      setIsDialogOpen(false);
      setNewSubroomName("");
      toast({ title: "Success", description: "Subroom created successfully." });
    } catch (err: any) {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Room ID copied to clipboard." });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-3xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <LayoutDashboard size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground">Main Room Dashboard</h1>
              <p className="text-sm text-muted-foreground">Welcome, {username} {isHost && <span className="text-primary font-medium ml-1">(Host)</span>}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 bg-black/30 p-2 rounded-xl border border-white/5">
            <span className="text-sm font-mono text-muted-foreground pl-3">ID: {roomId}</span>
            <Button variant="ghost" size="icon" onClick={copyRoomId} className="h-8 w-8 hover:bg-white/10 rounded-lg">
              {copied ? <CheckCircle2 size={16} className="text-green-500" /> : <Copy size={16} />}
            </Button>
          </div>
        </div>

        {/* Subrooms Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              Available Subrooms <span className="bg-secondary text-xs px-2 py-0.5 rounded-full">{subrooms.length}/3</span>
            </h2>
            
            {isHost && subrooms.length < 3 && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
                    <Plus size={18} className="mr-2" /> Create Subroom
                  </Button>
                </DialogTrigger>
                <DialogContent className="glass-panel border-white/10 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-display text-2xl">Create Subroom</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateSubroom} className="space-y-6 pt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Subroom Name</label>
                      <Input 
                        value={newSubroomName}
                        onChange={(e) => setNewSubroomName(e.target.value)}
                        placeholder="e.g. Marketing Team, Breakout Room 1"
                        className="bg-black/20 border-white/10 rounded-xl"
                        autoFocus
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full rounded-xl" 
                      disabled={!newSubroomName.trim() || createSubroom.isPending}
                    >
                      {createSubroom.isPending ? "Creating..." : "Create"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-3xl bg-secondary/50" />)}
            </div>
          ) : subrooms.length === 0 ? (
            <div className="glass-panel border-dashed border-2 border-white/10 rounded-3xl p-12 text-center flex flex-col items-center justify-center">
              <Users size={48} className="text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-medium mb-2">No Subrooms Yet</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                {isHost 
                  ? "Create a subroom to start collaborating with your team." 
                  : "Waiting for the host to create subrooms..."}
              </p>
              {isHost && (
                <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="rounded-xl border-white/10">
                  <Plus size={18} className="mr-2" /> Create First Subroom
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {subrooms.map((sub) => (
                <div key={sub.id} className="glass-panel p-6 rounded-3xl group hover:border-primary/50 transition-colors flex flex-col h-full">
                  <div className="flex-1">
                    <h3 className="text-xl font-display font-bold mb-2">{sub.name}</h3>
                    <div className="flex items-center text-sm text-muted-foreground gap-2 mb-6">
                      <Users size={16} />
                      <span>Join to see participants</span>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={() => setLocation(`/room/${roomId}/subroom/${sub.id}`)}
                    className="w-full rounded-xl group-hover:bg-primary group-hover:text-primary-foreground transition-all"
                    variant="secondary"
                  >
                    Join Room <ArrowRight size={16} className="ml-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Video, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMeetingStore } from "@/store/meeting-store";
import { useCreateRoom } from "@/hooks/use-api";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { username, setUsername } = useMeetingStore();
  const { toast } = useToast();
  const createRoom = useCreateRoom();
  const prefilledOrganization = useMemo(
    () =>
      new URLSearchParams(search).get("organization") ??
      new URLSearchParams(search).get("roomId") ??
      "",
    [search],
  );
  
  const [organizationName, setOrganizationName] = useState("");
  const [organizationToJoin, setOrganizationToJoin] = useState(prefilledOrganization);
  const [createName, setCreateName] = useState(username);
  const [joinName, setJoinName] = useState(username);
  const inputClassName =
    "h-12 rounded-xl bg-black/20 border-white/10 text-base text-foreground placeholder:text-muted-foreground/80 focus-visible:ring-primary/60 focus-visible:ring-offset-0";
  const primaryButtonClassName =
    "h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-zinc-200 to-zinc-400 text-zinc-950 hover:from-zinc-100 hover:to-zinc-300 shadow-lg shadow-zinc-900/30 transition-colors";
  const secondaryButtonClassName =
    "h-12 rounded-xl text-base font-semibold bg-white/5 border border-white/20 hover:bg-white/10 transition-colors";

  const handleCreate = async () => {
    if (!createName.trim() || !organizationName.trim()) {
      toast({
        title: "Fields required",
        description: "Please enter your name and organization name.",
        variant: "destructive",
      });
      return;
    }
    
    setUsername(createName.trim());
    
    try {
      const room = await createRoom.mutateAsync({
        hostUsername: createName.trim(),
        organizationName: organizationName.trim(),
      });
      setLocation(`/room/${room.id}`);
      toast({ title: "Room Created", description: `${room.organizationName} is ready.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toOrganizationKey = (value: string): string =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);

  const handleJoin = () => {
    if (!joinName.trim() || !organizationToJoin.trim()) {
      toast({
        title: "Fields required",
        description: "Please enter both joining name and organization name.",
        variant: "destructive",
      });
      return;
    }
    
    const organizationKey = toOrganizationKey(organizationToJoin);
    if (!organizationKey) {
      toast({
        title: "Invalid organization",
        description: "Organization must include letters or numbers.",
        variant: "destructive",
      });
      return;
    }

    setUsername(joinName.trim());
    setLocation(`/room/${organizationKey}`);
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
            Connect <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-400">Anywhere,</span> <br/> Anytime.
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto lg:mx-0">
            Professional video meetings with built-in subrooms. Collaborate seamlessly without limits.
          </p>
        </div>

        {/* Right Col - Forms */}
        <div className="glass-panel p-8 rounded-3xl space-y-6 relative">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80 ml-1">Your Name</label>
            <Input 
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="John Doe" 
              className={inputClassName}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80 ml-1">Organization Name</label>
            <Input
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Acme Corp"
              className={inputClassName}
            />
          </div>

          <div className="space-y-6">
            <Button 
              onClick={handleCreate}
              disabled={createRoom.isPending}
              className={`w-full ${primaryButtonClassName}`}
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

            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground/80 ml-1">Joining Name</label>
              <Input
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                placeholder="Joining Name"
                className={inputClassName}
              />
              <div className="flex gap-3">
                <Input 
                  value={organizationToJoin}
                  onChange={(e) => setOrganizationToJoin(e.target.value)}
                  placeholder="Enter Organization Name" 
                  className={`${inputClassName} flex-1`}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                />
                <Button 
                  onClick={handleJoin}
                  variant="secondary"
                  className={`px-6 ${secondaryButtonClassName}`}
                >
                  Join <ArrowRight className="ml-2" size={18} />
                </Button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

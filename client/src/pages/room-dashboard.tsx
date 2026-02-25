import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import {
  Plus,
  Users,
  LayoutDashboard,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useRoom,
  useCreateSubroom,
  useRoomSubroomParticipantCounts,
} from "@/hooks/use-api";
import { useMeetingStore } from "@/store/meeting-store";
import { useToast } from "@/hooks/use-toast";
import Meeting from "@/pages/meeting";

const avatarBgClasses = [
  "bg-zinc-200 text-zinc-900",
  "bg-zinc-500 text-white",
  "bg-zinc-700 text-white",
  "bg-zinc-300 text-zinc-900",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function SubroomAvatarGroup({
  seed,
  participantCount,
}: {
  seed: string;
  participantCount: number;
}) {
  if (participantCount <= 0) {
    return null;
  }

  const visibleCount = Math.min(participantCount, 10);
  const seedHash = hashString(seed);

  return (
    <div className="flex items-center">
      {Array.from({ length: visibleCount }).map((_, index) => {
        const shadeClass =
          avatarBgClasses[(seedHash + index) % avatarBgClasses.length];
        const glyph = String.fromCharCode(65 + ((seedHash + index) % 26));
        return (
          <div
            key={`${seed}-${index}`}
            className="h-7 w-7 -ml-2 first:ml-0 border-2 border-background rounded-full flex items-center justify-center"
          >
            <span className={`h-full w-full rounded-full text-[10px] font-semibold flex items-center justify-center ${shadeClass}`}>
              {glyph}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function RoomDashboard() {
  const { id: roomId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const activeSubroomId = useMemo(
    () => new URLSearchParams(search).get("subroom"),
    [search],
  );
  const { username, isSubroomMinimized, setSubroomMinimized } =
    useMeetingStore();
  const { toast } = useToast();

  const { data, isLoading, error } = useRoom(roomId);
  const createSubroom = useCreateSubroom(roomId);
  const subrooms = data?.subrooms ?? [];
  const subroomIds = useMemo(() => subrooms.map((sub) => sub.id), [subrooms]);
  const participantCounts = useRoomSubroomParticipantCounts(
    roomId,
    subroomIds,
  );

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSubroomName, setNewSubroomName] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!activeSubroomId) {
      setSubroomMinimized(false);
    }
  }, [activeSubroomId, setSubroomMinimized]);

  // If user navigated directly here without a name, send them back
  if (!username) {
    setLocation(`/?organization=${encodeURIComponent(roomId)}`);
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-panel p-8 rounded-2xl text-center max-w-md w-full">
          <h2 className="text-2xl font-bold text-destructive mb-2">
            Room Not Found
          </h2>
          <p className="text-muted-foreground mb-6">
            The room you are looking for does not exist or has been closed.
          </p>
          <Button
            onClick={() => setLocation("/")}
            className="w-full rounded-xl"
          >
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  const isHost = data?.room?.hostUsername === username;
  const shouldShowFullMeeting = !!activeSubroomId && !isSubroomMinimized;

  const handleCreateSubroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubroomName.trim()) return;

    try {
      await createSubroom.mutateAsync(newSubroomName.trim());
      setIsDialogOpen(false);
      setNewSubroomName("");
      toast({ title: "Success", description: "Cabin created successfully." });
    } catch (err: any) {
      toast({
        title: "Failed to create",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Organization key copied to clipboard." });
  }, [roomId, toast]);

  const navigateToSubroom = useCallback((subroomId: string) => {
    setSubroomMinimized(false);
    setLocation(`/room/${roomId}?subroom=${encodeURIComponent(subroomId)}`);
  }, [roomId, setLocation, setSubroomMinimized]);

  return (
    <>
      {!shouldShowFullMeeting && (
        <div className="min-h-screen bg-background p-4">
          <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-4 rounded-2xl">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
                <LayoutDashboard size={24} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-display font-semibold text-foreground truncate">
                  Main Room
                </h1>
                <p className="text-sm text-muted-foreground">
                  Welcome, {username}{" "}
                  {isHost && (
                    <span className="text-primary font-medium ml-1">
                      (Host)
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 bg-black/30 p-2 rounded-xl border border-white/5 max-w-full">
              <span className="text-xs sm:text-sm font-mono text-muted-foreground pl-2 sm:pl-3 truncate">
                Org: {data?.room?.organizationName || roomId}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={copyRoomId}
                className="h-8 w-8 hover:bg-white/10 rounded-lg"
              >
                {copied ? (
                  <CheckCircle2 size={16} className="text-zinc-100" />
                ) : (
                  <Copy size={16} />
                )}
              </Button>
            </div>
          </div>

          {/* Subrooms Grid */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                Cabins{" "}
                <span className="bg-secondary text-xs px-2 py-0.5 rounded-full">
                  {subrooms.length}/3
                </span>
              </h2>

              {isHost && subrooms.length < 3 && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="rounded-xl">
                      <Plus size={18} className="mr-2" /> Create Cabin
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass-panel border-white/10 sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-display text-2xl">
                        Create Cabin
                      </DialogTitle>
                    </DialogHeader>
                    <form
                      onSubmit={handleCreateSubroom}
                      className="space-y-6 pt-4"
                    >
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Cabin Name
                        </label>
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
                        disabled={
                          !newSubroomName.trim() || createSubroom.isPending
                        }
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
                {["skeleton-1", "skeleton-2", "skeleton-3"].map((skeletonId) => (
                  <Skeleton
                    key={skeletonId}
                    className="h-48 rounded-3xl bg-secondary/50"
                  />
                ))}
              </div>
            ) : subrooms.length === 0 ? (
              <div className="glass-panel border-dashed border-2 border-white/10 rounded-3xl p-12 text-center flex flex-col items-center justify-center">
                <Users size={48} className="text-muted-foreground/50 mb-4" />
                <h3 className="text-xl font-medium mb-2">No Cabins Yet</h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                  {isHost
                    ? "Create a subroom to start collaborating with your team."
                    : "Waiting for the host to create cabins..."}
                </p>
                {isHost && (
                  <Button
                    onClick={() => setIsDialogOpen(true)}
                    variant="outline"
                    className="rounded-xl border-white/10"
                  >
                    <Plus size={18} className="mr-2" /> Create First Cabin
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {subrooms.map((sub) => {
                  const count = participantCounts[sub.id] ?? 0;

                  return (
                    <div
                      key={sub.id}
                      className="glass-panel p-6 rounded-3xl group transition-colors flex flex-col h-full"
                    >
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h3 className="text-xl font-display font-semibold">
                            {sub.name}
                          </h3>
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground gap-2 mb-6">
                          <SubroomAvatarGroup
                            seed={sub.id}
                            participantCount={count}
                          />
                          <span>{count}/10 participants</span>
                        </div>
                      </div>

                      <Button
                        onClick={() => navigateToSubroom(sub.id)}
                        disabled={activeSubroomId === sub.id}
                        className="bg-gradient-to-r rounded-xl from-zinc-200 to-blue-400 text-zinc-950 hover:from-zinc-100 hover:to-blue-300"
                        variant="secondary"
                      >
                        {activeSubroomId === sub.id ? "Joined" : "Join Room"}{" "}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>
      )}
      {activeSubroomId && (
        <Meeting
          roomId={roomId}
          subroomId={activeSubroomId}
          mode={isSubroomMinimized ? "mini" : "full"}
        />
      )}
    </>
  );
}

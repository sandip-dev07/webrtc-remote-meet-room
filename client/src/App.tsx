import { Switch, Route, useLocation, useParams } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import RoomDashboard from "@/pages/room-dashboard";

function LegacySubroomRedirect() {
  const { roomId, subroomId } = useParams<{ roomId: string; subroomId: string }>();
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(`/room/${roomId}?subroom=${encodeURIComponent(subroomId)}`);
  }, [roomId, setLocation, subroomId]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/room/:id" component={RoomDashboard} />
      <Route path="/room/:roomId/subroom/:subroomId" component={LegacySubroomRedirect} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

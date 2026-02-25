import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, buildUrl } from "@shared/routes";

// --- Rooms ---

export function useRoom(roomId: string) {
  return useQuery({
    queryKey: ['room', roomId],
    queryFn: async () => {
      const url = buildUrl(api.rooms.get.path, { id: roomId });
      const res = await fetch(url);
      if (res.status === 404) throw new Error("Room not found");
      if (!res.ok) throw new Error("Failed to fetch room");
      return api.rooms.get.responses[200].parse(await res.json());
    },
    enabled: !!roomId,
  });
}

export function useCreateRoom() {
  return useMutation({
    mutationFn: async (input: { hostUsername: string; organizationName: string }) => {
      const payload = api.rooms.create.input.parse(input);
      const res = await fetch(api.rooms.create.path, {
        method: api.rooms.create.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        if (res.status === 400) {
          const err = await res.json();
          throw new Error(err.message || "Invalid request");
        }
        throw new Error("Failed to create room");
      }
      return api.rooms.create.responses[201].parse(await res.json());
    }
  });
}

// --- Subrooms ---

export function useSubroom(subroomId: string) {
  return useQuery({
    queryKey: ['subroom', subroomId],
    queryFn: async () => {
      const url = buildUrl(api.subrooms.get.path, { id: subroomId });
      const res = await fetch(url);
      if (res.status === 404) throw new Error("Subroom not found");
      if (!res.ok) throw new Error("Failed to fetch subroom");
      return api.subrooms.get.responses[200].parse(await res.json());
    },
    enabled: !!subroomId,
  });
}

export function useCreateSubroom(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const url = buildUrl(api.subrooms.create.path, { roomId });
      const payload = api.subrooms.create.input.parse({ name });
      const res = await fetch(url, {
        method: api.subrooms.create.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Error: ${res.status}`);
      }
      
      return api.subrooms.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room', roomId] });
    }
  });
}

// --- Subroom Chat & Participants (Initial fetch, updated via WS normally) ---

export function useSubroomMessages(subroomId: string) {
  return useQuery({
    queryKey: ['subroom', subroomId, 'messages'],
    queryFn: async () => {
      const url = buildUrl(api.subrooms.messages.path, { id: subroomId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return api.subrooms.messages.responses[200].parse(await res.json());
    },
    enabled: !!subroomId,
  });
}

export function useSubroomParticipants(subroomId: string) {
  return useQuery({
    queryKey: ['subroom', subroomId, 'participants'],
    queryFn: async () => {
      const url = buildUrl(api.subrooms.participants.path, { id: subroomId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch participants");
      return api.subrooms.participants.responses[200].parse(await res.json());
    },
    enabled: !!subroomId,
  });
}

export function useRoomSubroomParticipantCounts(roomId: string, subroomIds: string[]) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['room', roomId, 'subroom-participant-counts'],
    queryFn: async () => {
      const url = buildUrl(api.rooms.participantCounts.path, { id: roomId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch subroom participant counts");
      return api.rooms.participantCounts.responses[200].parse(await res.json());
    },
    enabled: !!roomId && subroomIds.length > 0,
  });

  useEffect(() => {
    if (!roomId || subroomIds.length === 0) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "watch-room", payload: { roomId } }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== "participant-counts-updated") return;
        if (data.payload?.roomId !== roomId) return;

        const parsed = api.rooms.participantCounts.responses[200].safeParse(
          data.payload?.counts,
        );
        if (!parsed.success) return;
        queryClient.setQueryData(
          ['room', roomId, 'subroom-participant-counts'],
          parsed.data,
        );
      } catch {
        // Ignore malformed WS payloads to keep the dashboard resilient.
      }
    };

    return () => {
      ws.close();
    };
  }, [queryClient, roomId, subroomIds.length]);

  return subroomIds.reduce<Record<string, number>>((acc, subroomId) => {
    acc[subroomId] = query.data?.[subroomId] ?? 0;
    return acc;
  }, {});
}

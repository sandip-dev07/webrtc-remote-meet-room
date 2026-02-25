import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import type { Message } from "@shared/schema";
import { createMediasoupService, type SocketMeta } from "./mediasoup-service";

function generateId() {
  return crypto.randomBytes(4).toString("hex");
}

function toOrganizationKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  const socketMeta = new Map<WebSocket, SocketMeta>();
  const mediasoupService = await createMediasoupService();
  const socketMedia = mediasoupService.socketMedia;

  const transientMessagesBySubroom = new Map<string, Message[]>();
  let transientMessageId = 1;
  const MAX_TRANSIENT_MESSAGES_PER_SUBROOM = 100;

  const sendJson = (ws: WebSocket, payload: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const broadcastToSubroom = (
    subroomId: string,
    payload: unknown,
    exclude?: WebSocket,
  ) => {
    socketMeta.forEach((meta, client) => {
      if (
        !meta ||
        meta.subroomId !== subroomId ||
        client === exclude ||
        client.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      client.send(JSON.stringify(payload));
    });
  };

  app.post(api.rooms.create.path, async (req, res) => {
    try {
      const input = api.rooms.create.input.parse(req.body);
      const organizationName = input.organizationName.trim();
      const id = toOrganizationKey(organizationName);
      if (!id) {
        return res.status(400).json({
          message: "Organization name must include letters or numbers",
          field: "organizationName",
        });
      }

      const existing = await storage.getRoom(id);
      if (existing) {
        return res.status(400).json({
          message: "Organization already exists",
          field: "organizationName",
        });
      }

      const room = await storage.createRoom({
        id,
        organizationName,
        hostUsername: input.hostUsername.trim(),
      });
      res.status(201).json(room);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.rooms.get.path, async (req, res) => {
    const room = await storage.getRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    const subrooms = await storage.getSubroomsByRoom(room.id);
    res.status(200).json({ room, subrooms });
  });

  app.get(api.rooms.participantCounts.path, async (req, res) => {
    const room = await storage.getRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const subrooms = await storage.getSubroomsByRoom(room.id);
    const counts = subrooms.reduce<Record<string, number>>((acc, subroom) => {
      acc[subroom.id] = 0;
      return acc;
    }, {});

    Array.from(socketMeta.values()).forEach((meta) => {
      if (counts[meta.subroomId] !== undefined) {
        counts[meta.subroomId] += 1;
      }
    });

    res.status(200).json(counts);
  });

  app.post(api.subrooms.create.path, async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const room = await storage.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      const existingSubrooms = await storage.getSubroomsByRoom(roomId);
      if (existingSubrooms.length >= 3) {
        return res.status(403).json({ message: "Maximum 3 subrooms allowed" });
      }

      const input = api.subrooms.create.input.parse(req.body);
      const id = generateId();
      const subroom = await storage.createSubroom({ ...input, roomId, id });
      res.status(201).json(subroom);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.subrooms.get.path, async (req, res) => {
    const subroom = await storage.getSubroom(req.params.id);
    if (!subroom) {
      return res.status(404).json({ message: "Subroom not found" });
    }
    res.status(200).json(subroom);
  });

  app.get(api.subrooms.participants.path, async (req, res) => {
    const subroomId = req.params.id;
    const activeParticipants = Array.from(socketMeta.values())
      .filter((meta) => meta.subroomId === subroomId)
      .map((meta, index) => ({
        id: index + 1,
        subroomId: meta.subroomId,
        username: meta.username,
        socketId: meta.socketId,
        joinedAt: meta.joinedAt,
      }));
    res.status(200).json(activeParticipants);
  });

  app.get(api.subrooms.messages.path, async (req, res) => {
    const subroomId = req.params.id;
    const messages = transientMessagesBySubroom.get(subroomId) ?? [];
    res.status(200).json(messages);
  });

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: 16 * 1024, // 16kb
  });

  const HEARTBEAT_MS = 30000;
  const wsLiveness = new Map<WebSocket, boolean>();

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (wsLiveness.get(client) === false) {
        client.terminate();
        return;
      }

      wsLiveness.set(client, false);
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    });
  }, HEARTBEAT_MS);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  wss.on("connection", (ws) => {
    const socketId = crypto.randomUUID();
    let currentSubroomId: string | null = null;
    let currentUsername: string | null = null;

    wsLiveness.set(ws, true);
    socketMedia.set(ws, mediasoupService.createPeerMediaState());

    ws.on("pong", () => {
      wsLiveness.set(ws, true);
    });

    ws.on("message", async (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());

        if (message.type === "join") {
          const { roomId, subroomId, username } = message.payload;

          const subroom = await storage.getSubroom(subroomId);
          if (!subroom) {
            sendJson(ws, { type: "error", payload: { message: "Subroom not found" } });
            return;
          }
          if (subroom.roomId !== roomId) {
            sendJson(ws, {
              type: "error",
              payload: { message: "Subroom does not belong to this room" },
            });
            return;
          }

          const activeCount = Array.from(socketMeta.values()).filter(
            (meta) => meta.subroomId === subroomId,
          ).length;
          if (activeCount >= 10) {
            sendJson(ws, {
              type: "error",
              payload: { message: "Subroom is full (max 10 participants)" },
            });
            return;
          }

          if (currentSubroomId && currentSubroomId !== subroomId) {
            mediasoupService.closePeerMedia(ws, currentSubroomId, broadcastToSubroom);
            broadcastToSubroom(currentSubroomId, {
              type: "user-left",
              payload: { socketId, username: currentUsername },
            });
          }

          currentSubroomId = subroomId;
          currentUsername = username;

          socketMeta.set(ws, {
            socketId,
            roomId,
            subroomId,
            username,
            joinedAt: new Date(),
          });

          sendJson(ws, { type: "joined", payload: { socketId } });
          broadcastToSubroom(
            subroomId,
            {
              type: "user-joined",
              payload: { socketId, username },
            },
            ws,
          );
          return;
        }

        if (message.type === "chat") {
          if (currentSubroomId && currentUsername) {
            const { content } = message.payload;
            const transientMessage: Message = {
              id: transientMessageId++,
              subroomId: currentSubroomId,
              username: currentUsername,
              content,
              createdAt: new Date(),
            };

            const existing = transientMessagesBySubroom.get(currentSubroomId) ?? [];
            existing.push(transientMessage);
            if (existing.length > MAX_TRANSIENT_MESSAGES_PER_SUBROOM) {
              existing.splice(0, existing.length - MAX_TRANSIENT_MESSAGES_PER_SUBROOM);
            }
            transientMessagesBySubroom.set(currentSubroomId, existing);

            broadcastToSubroom(currentSubroomId, {
              type: "chat",
              payload: transientMessage,
            });
          }
          return;
        }

        if (message.type === "ms-request") {
          await mediasoupService.handleRequest({
            ws,
            message,
            currentSubroomId,
            currentUsername,
            socketId,
            socketMeta,
            sendJson,
            broadcastToSubroom,
          });
          return;
        }
      } catch (e) {
        console.error("WS error:", e);
      }
    });

    ws.on("close", () => {
      if (currentSubroomId) {
        mediasoupService.closePeerMedia(ws, currentSubroomId, broadcastToSubroom);
        broadcastToSubroom(currentSubroomId, {
          type: "user-left",
          payload: { socketId, username: currentUsername },
        });
      }
      socketMeta.delete(ws);
      socketMedia.delete(ws);
      wsLiveness.delete(ws);
    });

    ws.on("error", () => {
      wsLiveness.delete(ws);
    });
  });

  httpServer.on("close", async () => {
    await mediasoupService.close();
  });

  return httpServer;
}

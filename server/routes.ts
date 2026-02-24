import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post(api.rooms.create.path, async (req, res) => {
    try {
      const input = api.rooms.create.input.parse(req.body);
      const id = generateId(); // simple random id
      const room = await storage.createRoom({ ...input, id });
      res.status(201).json(room);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
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
          field: err.errors[0].path.join('.'),
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
    const participants = await storage.getParticipantsBySubroom(req.params.id);
    res.status(200).json(participants);
  });

  app.get(api.subrooms.messages.path, async (req, res) => {
    const messages = await storage.getMessagesBySubroom(req.params.id);
    res.status(200).json(messages);
  });

  // Setup WebSocket server for signaling and chat
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const socketId = crypto.randomUUID();
    let currentSubroomId: string | null = null;
    let currentUsername: string | null = null;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'join') {
          const { subroomId, username, peerId } = message.payload;
          
          const subroom = await storage.getSubroom(subroomId);
          if (!subroom) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: "Subroom not found" } }));
            return;
          }

          const existingParticipants = await storage.getParticipantsBySubroom(subroomId);
          if (existingParticipants.length >= 10) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: "Subroom is full (max 10 participants)" } }));
            return;
          }

          currentSubroomId = subroomId;
          currentUsername = username;

          // Add to database
          await storage.addParticipant({ subroomId, username, socketId });

          // Broadcast to others in the room
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'user-joined',
                payload: { username, peerId, socketId }
              }));
            }
          });
        } else if (message.type === 'chat') {
          if (currentSubroomId && currentUsername) {
            const { content } = message.payload;
            const savedMessage = await storage.addMessage({
              subroomId: currentSubroomId,
              username: currentUsername,
              content
            });

            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'chat',
                  payload: savedMessage
                }));
              }
            });
          }
        } else if (message.type === 'signal') {
          // Relay signaling data for WebRTC
          // In a real robust implementation, we would target specific socketIds
          // For simplicity, we broadcast and let clients filter by peerId if needed
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(message));
            }
          });
        }
      } catch (e) {
        console.error("WS error:", e);
      }
    });

    ws.on('close', async () => {
      if (currentSubroomId) {
        await storage.removeParticipant(socketId);
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'user-left',
              payload: { socketId, username: currentUsername }
            }));
          }
        });
      }
    });
  });

  return httpServer;
}

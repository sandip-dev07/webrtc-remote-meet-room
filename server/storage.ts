import { db } from "./db";
import {
  rooms, subrooms, participants,
  type Room, type InsertRoom,
  type Subroom, type InsertSubroom,
  type Participant, type InsertParticipant
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getRoom(id: string): Promise<Room | undefined>;
  createRoom(room: InsertRoom): Promise<Room>;
  
  getSubroom(id: string): Promise<Subroom | undefined>;
  getSubroomsByRoom(roomId: string): Promise<Subroom[]>;
  createSubroom(subroom: InsertSubroom): Promise<Subroom>;
  
  getParticipantsBySubroom(subroomId: string): Promise<Participant[]>;
  addParticipant(participant: InsertParticipant): Promise<Participant>;
  removeParticipant(socketId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getRoom(id: string): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    return room;
  }

  async createRoom(room: InsertRoom): Promise<Room> {
    const [newRoom] = await db.insert(rooms).values(room).returning();
    return newRoom;
  }

  async getSubroom(id: string): Promise<Subroom | undefined> {
    const [subroom] = await db.select().from(subrooms).where(eq(subrooms.id, id));
    return subroom;
  }

  async getSubroomsByRoom(roomId: string): Promise<Subroom[]> {
    return await db.select().from(subrooms).where(eq(subrooms.roomId, roomId));
  }

  async createSubroom(subroom: InsertSubroom): Promise<Subroom> {
    const [newSubroom] = await db.insert(subrooms).values(subroom).returning();
    return newSubroom;
  }

  async getParticipantsBySubroom(subroomId: string): Promise<Participant[]> {
    return await db.select().from(participants).where(eq(participants.subroomId, subroomId));
  }

  async addParticipant(participant: InsertParticipant): Promise<Participant> {
    const [newParticipant] = await db.insert(participants).values(participant).returning();
    return newParticipant;
  }

  async removeParticipant(socketId: string): Promise<void> {
    await db.delete(participants).where(eq(participants.socketId, socketId));
  }
}

export const storage = new DatabaseStorage();

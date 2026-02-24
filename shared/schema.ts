import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(), // e.g., "123ahdcx"
  hostUsername: text("host_username").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subrooms = pgTable("subrooms", {
  id: text("id").primaryKey(), // e.g., "223rc"
  roomId: text("room_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  subroomId: text("subroom_id").notNull(),
  username: text("username").notNull(),
  socketId: text("socket_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  subroomId: text("subroom_id").notNull(),
  username: text("username").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRoomSchema = createInsertSchema(rooms);
export const insertSubroomSchema = createInsertSchema(subrooms);
export const insertParticipantSchema = createInsertSchema(participants);
export const insertMessageSchema = createInsertSchema(messages);

export type Room = typeof rooms.$inferSelect;
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Subroom = typeof subrooms.$inferSelect;
export type InsertSubroom = z.infer<typeof insertSubroomSchema>;
export type Participant = typeof participants.$inferSelect;
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

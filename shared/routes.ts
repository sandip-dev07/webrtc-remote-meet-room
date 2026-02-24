import { z } from "zod";
import { rooms, subrooms, participants, messages } from "./schema";

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
  forbidden: z.object({ message: z.string() }),
};

export const api = {
  rooms: {
    create: {
      method: 'POST' as const,
      path: '/api/rooms' as const,
      input: z.object({ hostUsername: z.string() }),
      responses: {
        201: z.custom<typeof rooms.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/rooms/:id' as const,
      responses: {
        200: z.object({
          room: z.custom<typeof rooms.$inferSelect>(),
          subrooms: z.array(z.custom<typeof subrooms.$inferSelect>()),
        }),
        404: errorSchemas.notFound,
      }
    }
  },
  subrooms: {
    create: {
      method: 'POST' as const,
      path: '/api/rooms/:roomId/subrooms' as const,
      input: z.object({ name: z.string() }),
      responses: {
        201: z.custom<typeof subrooms.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.forbidden,
        404: errorSchemas.notFound,
      }
    },
    get: {
      method: 'GET' as const,
      path: '/api/subrooms/:id' as const,
      responses: {
        200: z.custom<typeof subrooms.$inferSelect>(),
        404: errorSchemas.notFound,
      }
    },
    participants: {
      method: 'GET' as const,
      path: '/api/subrooms/:id/participants' as const,
      responses: {
        200: z.array(z.custom<typeof participants.$inferSelect>()),
      }
    },
    messages: {
      method: 'GET' as const,
      path: '/api/subrooms/:id/messages' as const,
      responses: {
        200: z.array(z.custom<typeof messages.$inferSelect>()),
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

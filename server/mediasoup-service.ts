import * as mediasoup from "mediasoup";
import type {
  Consumer,
  DtlsState,
  Producer,
  RtpCodecCapability,
  Router,
  WebRtcTransport,
  Worker,
} from "mediasoup/types";
import type { WebSocket } from "ws";

export type SocketMeta = {
  socketId: string;
  roomId: string;
  subroomId: string;
  username: string;
  joinedAt: Date;
};

export type PeerMediaState = {
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
};

type SendJson = (ws: WebSocket, payload: unknown) => void;
type BroadcastToSubroom = (
  subroomId: string,
  payload: unknown,
  exclude?: WebSocket,
) => void;

const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 100,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    preferredPayloadType: 96,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

export async function createMediasoupService() {
  const socketMedia = new Map<WebSocket, PeerMediaState>();
  const routersBySubroom = new Map<string, Router>();

  const worker: Worker = await mediasoup.createWorker({
    rtcMinPort: Number(process.env.MEDIASOUP_MIN_PORT || 40000),
    rtcMaxPort: Number(process.env.MEDIASOUP_MAX_PORT || 49999),
    logLevel: "warn",
    logTags: ["ice", "dtls", "rtp", "rtcp"],
  });

  worker.on("died", () => {
    console.error("mediasoup worker died; shutting down process");
    setTimeout(() => process.exit(1), 2000);
  });

  const defaultListenIp =
    process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
  const listenIp = process.env.MEDIASOUP_LISTEN_IP || defaultListenIp;
  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || undefined;

  const ensureRouter = async (subroomId: string): Promise<Router> => {
    const existing = routersBySubroom.get(subroomId);
    if (existing) return existing;
    const router = await worker.createRouter({ mediaCodecs });
    routersBySubroom.set(subroomId, router);
    return router;
  };

  const createPeerMediaState = (): PeerMediaState => ({
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  });

  const closePeerMedia = (
    ws: WebSocket,
    notifySubroomId: string | undefined,
    broadcastToSubroom: BroadcastToSubroom,
  ) => {
    const mediaState = socketMedia.get(ws);
    if (!mediaState) return;

    mediaState.producers.forEach((producer) => {
      if (notifySubroomId) {
        broadcastToSubroom(notifySubroomId, {
          type: "ms-notification",
          action: "producer-closed",
          data: { producerId: producer.id },
        });
      }
      producer.close();
    });

    mediaState.consumers.forEach((consumer) => consumer.close());
    mediaState.transports.forEach((transport) => transport.close());

    mediaState.producers.clear();
    mediaState.consumers.clear();
    mediaState.transports.clear();
  };

  const handleRequest = async (params: {
    ws: WebSocket;
    message: any;
    currentSubroomId: string | null;
    currentUsername: string | null;
    socketId: string;
    socketMeta: Map<WebSocket, SocketMeta>;
    sendJson: SendJson;
    broadcastToSubroom: BroadcastToSubroom;
  }) => {
    const {
      ws,
      message,
      currentSubroomId,
      currentUsername,
      socketId,
      socketMeta,
      sendJson,
      broadcastToSubroom,
    } = params;

    if (!currentSubroomId || !currentUsername) {
      sendJson(ws, {
        type: "ms-response",
        requestId: message.requestId,
        error: "Not joined to subroom",
      });
      return;
    }

    const mediaState = socketMedia.get(ws);
    if (!mediaState) {
      sendJson(ws, {
        type: "ms-response",
        requestId: message.requestId,
        error: "Peer media state missing",
      });
      return;
    }

    try {
      const router = await ensureRouter(currentSubroomId);
      const action = String(message.action ?? "");
      const data = message.data ?? {};

      if (action === "getRouterRtpCapabilities") {
        sendJson(ws, {
          type: "ms-response",
          requestId: message.requestId,
          data: router.rtpCapabilities,
        });
        return;
      }

      if (action === "createWebRtcTransport") {
        const transport = await router.createWebRtcTransport({
          listenIps: [{ ip: listenIp, announcedIp }],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          initialAvailableOutgoingBitrate: 1_000_000,
        });

        mediaState.transports.set(transport.id, transport);

        transport.on("dtlsstatechange", (state: DtlsState) => {
          if (state === "closed") {
            transport.close();
            mediaState.transports.delete(transport.id);
          }
        });

        sendJson(ws, {
          type: "ms-response",
          requestId: message.requestId,
          data: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });
        return;
      }

      if (action === "connectWebRtcTransport") {
        const transport = mediaState.transports.get(String(data.transportId));
        if (!transport) throw new Error("Transport not found");
        await transport.connect({ dtlsParameters: data.dtlsParameters });
        sendJson(ws, {
          type: "ms-response",
          requestId: message.requestId,
          data: { connected: true },
        });
        return;
      }

      if (action === "produce") {
        const transport = mediaState.transports.get(String(data.transportId));
        if (!transport) throw new Error("Transport not found");
        const producer = await transport.produce({
          kind: data.kind,
          rtpParameters: data.rtpParameters,
          appData: data.appData ?? {},
        });

        mediaState.producers.set(producer.id, producer);
        producer.on("transportclose", () => {
          mediaState.producers.delete(producer.id);
        });

        broadcastToSubroom(
          currentSubroomId,
          {
            type: "ms-notification",
            action: "new-producer",
            data: {
              producerId: producer.id,
              peerId: socketId,
              username: currentUsername,
              kind: producer.kind,
            },
          },
          ws,
        );

        sendJson(ws, {
          type: "ms-response",
          requestId: message.requestId,
          data: { id: producer.id },
        });
        return;
      }

      if (action === "getProducers") {
        const producerList: Array<{ producerId: string; peerId: string; username: string }> = [];
        socketMeta.forEach((meta, client) => {
          if (client === ws || meta.subroomId !== currentSubroomId) return;
          const state = socketMedia.get(client);
          if (!state) return;
          state.producers.forEach((producer) => {
            producerList.push({
              producerId: producer.id,
              peerId: meta.socketId,
              username: meta.username,
            });
          });
        });
        sendJson(ws, {
          type: "ms-response",
          requestId: message.requestId,
          data: producerList,
        });
        return;
      }

      if (action === "consume") {
        const transport = mediaState.transports.get(String(data.transportId));
        if (!transport) throw new Error("Transport not found");
        const producerId = String(data.producerId);
        if (
          !router.canConsume({
            producerId,
            rtpCapabilities: data.rtpCapabilities,
          })
        ) {
          throw new Error("Cannot consume this producer");
        }

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities: data.rtpCapabilities,
          paused: true,
        });

        mediaState.consumers.set(consumer.id, consumer);
        consumer.on("transportclose", () => {
          mediaState.consumers.delete(consumer.id);
        });
        consumer.on("producerclose", () => {
          mediaState.consumers.delete(consumer.id);
        });

        sendJson(ws, {
          type: "ms-response",
          requestId: message.requestId,
          data: {
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            appData: consumer.appData,
          },
        });
        return;
      }

      if (action === "resumeConsumer") {
        const consumer = mediaState.consumers.get(String(data.consumerId));
        if (!consumer) throw new Error("Consumer not found");
        await consumer.resume();
        sendJson(ws, {
          type: "ms-response",
          requestId: message.requestId,
          data: { resumed: true },
        });
        return;
      }

      if (action === "closeProducer") {
        const producer = mediaState.producers.get(String(data.producerId));
        if (producer) {
          mediaState.producers.delete(producer.id);
          producer.close();
          broadcastToSubroom(currentSubroomId, {
            type: "ms-notification",
            action: "producer-closed",
            data: { producerId: producer.id },
          });
        }
        sendJson(ws, {
          type: "ms-response",
          requestId: message.requestId,
          data: { closed: true },
        });
        return;
      }

      sendJson(ws, {
        type: "ms-response",
        requestId: message.requestId,
        error: `Unknown mediasoup action '${action}'`,
      });
    } catch (err: any) {
      sendJson(ws, {
        type: "ms-response",
        requestId: message.requestId,
        error: err?.message || "mediasoup request failed",
      });
    }
  };

  return {
    socketMedia,
    createPeerMediaState,
    closePeerMedia,
    handleRequest,
    close: async () => {
      await worker.close();
    },
  };
}

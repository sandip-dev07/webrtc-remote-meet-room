import * as mediasoupClient from "mediasoup-client";
import type {
  Consumer,
  Device,
  Producer,
  RtpCapabilities,
  Transport,
} from "mediasoup-client/types";
import type { MutableRefObject } from "react";

export type SendRequest = (action: string, data?: any) => Promise<any>;

export type MediasoupRefs = {
  deviceRef: MutableRefObject<Device | null>;
  sendTransportRef: MutableRefObject<Transport | null>;
  recvTransportRef: MutableRefObject<Transport | null>;
  audioProducerRef: MutableRefObject<Producer | null>;
  videoProducerRef: MutableRefObject<Producer | null>;
};

type ConsumeInfo = {
  id: string;
  producerId: string;
  kind: "audio" | "video";
  rtpParameters: any;
  appData?: any;
};

// produceOrReplaceTrack
export async function produceOrReplaceTrack(
  kind: "audio" | "video",
  track: MediaStreamTrack,
  refs: MediasoupRefs,
): Promise<void> {
  const sendTransport = refs.sendTransportRef.current;
  if (!sendTransport) return;

  const producerRef = kind === "audio" ? refs.audioProducerRef : refs.videoProducerRef;
  const existingProducer = producerRef.current;
  if (existingProducer) {
    await existingProducer.replaceTrack({ track });
    return;
  }

  const producer = await sendTransport.produce({
    track,
    appData: { mediaTag: kind },
  });
  producerRef.current = producer;

  producer.on("transportclose", () => {
    if (kind === "audio") refs.audioProducerRef.current = null;
    if (kind === "video") refs.videoProducerRef.current = null;
  });
}

// consumeRemoteProducer
export async function consumeRemoteProducer(
  producerId: string,
  sendRequest: SendRequest,
  refs: MediasoupRefs,
): Promise<{ consumer: Consumer; kind: "audio" | "video" } | null> {
  const recvTransport = refs.recvTransportRef.current;
  const device = refs.deviceRef.current;
  if (!recvTransport || !device) return null;

  const consumeInfo = (await sendRequest("consume", {
    transportId: recvTransport.id,
    producerId,
    rtpCapabilities: device.rtpCapabilities,
  })) as ConsumeInfo;

  const consumer = await recvTransport.consume({
    id: consumeInfo.id,
    producerId: consumeInfo.producerId,
    kind: consumeInfo.kind,
    rtpParameters: consumeInfo.rtpParameters,
    appData: consumeInfo.appData || {},
  });

  await sendRequest("resumeConsumer", { consumerId: consumer.id });
  return { consumer, kind: consumeInfo.kind };
}

// initializeMediasoupSession
export async function initializeMediasoupSession(params: {
  initializedRef: MutableRefObject<boolean>;
  sendRequest: SendRequest;
  refs: MediasoupRefs;
  localStream: MediaStream | null;
  consumeProducer: (producerId: string, peerId: string, username: string) => Promise<void>;
}): Promise<void> {
  const { initializedRef, sendRequest, refs, localStream, consumeProducer } = params;
  if (initializedRef.current) return;
  initializedRef.current = true;

  try {
    const rtpCapabilities = (await sendRequest(
      "getRouterRtpCapabilities",
    )) as RtpCapabilities;
    const device = new mediasoupClient.Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    refs.deviceRef.current = device;

    const sendTransportOptions = await sendRequest("createWebRtcTransport", {
      direction: "send",
    });
    const sendTransport = device.createSendTransport(sendTransportOptions);
    refs.sendTransportRef.current = sendTransport;

    sendTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      try {
        await sendRequest("connectWebRtcTransport", {
          transportId: sendTransport.id,
          dtlsParameters,
        });
        callback();
      } catch (err) {
        errback(err as Error);
      }
    });

    sendTransport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const { id } = await sendRequest("produce", {
          transportId: sendTransport.id,
          kind,
          rtpParameters,
          appData,
        });
        callback({ id });
      } catch (err) {
        errback(err as Error);
      }
    });

    const recvTransportOptions = await sendRequest("createWebRtcTransport", {
      direction: "recv",
    });
    const recvTransport = device.createRecvTransport(recvTransportOptions);
    refs.recvTransportRef.current = recvTransport;

    recvTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      try {
        await sendRequest("connectWebRtcTransport", {
          transportId: recvTransport.id,
          dtlsParameters,
        });
        callback();
      } catch (err) {
        errback(err as Error);
      }
    });

    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      const videoTrack = localStream.getVideoTracks()[0];
      if (audioTrack) await produceOrReplaceTrack("audio", audioTrack, refs);
      if (videoTrack) await produceOrReplaceTrack("video", videoTrack, refs);
    }

    const existingProducers = (await sendRequest("getProducers")) as Array<{
      producerId: string;
      peerId: string;
      username: string;
    }>;

    await Promise.all(
      existingProducers.map(({ producerId, peerId, username }) =>
        consumeProducer(producerId, peerId, username),
      ),
    );
  } catch (err) {
    initializedRef.current = false;
    throw err;
  }
}

// closeMediasoupSession
export function closeMediasoupSession(refs: MediasoupRefs): void {
  refs.audioProducerRef.current?.close();
  refs.videoProducerRef.current?.close();
  refs.sendTransportRef.current?.close();
  refs.recvTransportRef.current?.close();

  refs.audioProducerRef.current = null;
  refs.videoProducerRef.current = null;
  refs.sendTransportRef.current = null;
  refs.recvTransportRef.current = null;
  refs.deviceRef.current = null;
}

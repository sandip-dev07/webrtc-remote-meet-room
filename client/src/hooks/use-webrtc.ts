import { useState, useEffect, useRef, useCallback } from "react";
import type { Consumer, Device, Producer, Transport } from "mediasoup-client/types";
import { useMeetingStore } from "@/store/meeting-store";
import {
  closeMediasoupSession,
  consumeRemoteProducer,
  initializeMediasoupSession,
  produceOrReplaceTrack,
} from "./mediasoup-session";
import {
  SPEECH_AUDIO_CONSTRAINTS,
  canUseScreenShare,
  getAudioStream,
  getCameraStream,
  getDisplayStream,
} from "./webrtc-media";
import { useTone } from "./use-tone";

export type PeerState = {
  stream: MediaStream;
  username: string;
};

interface UseWebRTCProps {
  roomId: string;
  subroomId: string;
  username: string;
}

type UseWebRTCReturn = {
  localStream: MediaStream | null;
  peers: Record<string, PeerState>;
  isConnected: boolean;
  error: string | null;
  isMicOn: boolean;
  isCamOn: boolean;
  toggleMic: () => Promise<void>;
  toggleCam: () => Promise<void>;
  isScreenSharing: boolean;
  canScreenShare: boolean;
  toggleScreenShare: () => Promise<boolean>;
  ws: WebSocket | null;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

type ConsumerMeta = {
  consumer: Consumer;
  peerId: string;
  username: string;
  kind: "audio" | "video";
};

type PendingProducer = {
  peerId: string;
  username: string;
};

export function useWebRTC({
  roomId,
  subroomId,
  username,
}: UseWebRTCProps): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [canScreenShare, setCanScreenShare] = useState(false);
  const [, setMediaTick] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
  const requestCounterRef = useRef(0);
  const joinedRef = useRef(false);
  const initializedRef = useRef(false);

  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  const audioProducerRef = useRef<Producer | null>(null);
  const videoProducerRef = useRef<Producer | null>(null);
  const consumersByProducerRef = useRef<Map<string, ConsumerMeta>>(new Map());
  const pendingProducersRef = useRef<Map<string, PendingProducer>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const remoteUsernamesRef = useRef<Map<string, string>>(new Map());

  const isScreenSharingRef = useRef(false);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const isScreenShareTransitioningRef = useRef(false);
  const { playTone } = useTone();

  const { isMicOn, isCamOn, setMic, setCam } = useMeetingStore();

  const playJoinTone = useCallback((): void => {
    playTone({
      type: "triangle",
      fromHz: 660,
      toHz: 920,
      durationMs: 200,
      peakGain: 0.06,
    });
  }, [playTone]);

  useEffect(() => {
    setCanScreenShare(canUseScreenShare());
  }, []);

  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  const sendRequest = useCallback(async (action: string, data: any = {}) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Signaling socket is not connected");
    }

    const requestId = `req-${Date.now()}-${requestCounterRef.current++}`;
    const payload = { type: "ms-request", requestId, action, data };
    ws.send(JSON.stringify(payload));

    return new Promise<any>((resolve, reject) => {
      pendingRequestsRef.current.set(requestId, { resolve, reject });
      window.setTimeout(() => {
        if (pendingRequestsRef.current.has(requestId)) {
          pendingRequestsRef.current.delete(requestId);
          reject(new Error(`Timeout while waiting for '${action}'`));
        }
      }, 12000);
    });
  }, []);

  const updatePeerState = useCallback((peerId: string, usernameForPeer: string) => {
    const stream = remoteStreamsRef.current.get(peerId);
    if (!stream || stream.getTracks().length === 0) {
      remoteStreamsRef.current.delete(peerId);
      remoteUsernamesRef.current.delete(peerId);
      setPeers((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      return;
    }
    remoteUsernamesRef.current.set(peerId, usernameForPeer);
    setPeers((prev) => ({
      ...prev,
      [peerId]: { stream, username: usernameForPeer },
    }));
  }, []);

  const removeRemoteTrack = useCallback(
    (producerId: string): void => {
      const entry = consumersByProducerRef.current.get(producerId);
      if (!entry) return;

      const { consumer, peerId, username: remoteName } = entry;
      consumersByProducerRef.current.delete(producerId);
      consumer.close();

      const stream = remoteStreamsRef.current.get(peerId);
      if (stream) {
        stream.getTracks().forEach((track) => {
          if (track.id === consumer.track.id) {
            stream.removeTrack(track);
            track.stop();
          }
        });
      }

      updatePeerState(peerId, remoteName);
    },
    [updatePeerState],
  );

  const consumeProducer = useCallback(
    async (producerId: string, peerId: string, producerUsername: string): Promise<void> => {
      if (consumersByProducerRef.current.has(producerId)) return;
      const recvTransport = recvTransportRef.current;
      const device = deviceRef.current;
      if (!recvTransport || !device) {
        pendingProducersRef.current.set(producerId, {
          peerId,
          username: producerUsername,
        });
        return;
      }

      const consumed = await consumeRemoteProducer(
        producerId,
        sendRequest,
        {
          deviceRef,
          sendTransportRef,
          recvTransportRef,
          audioProducerRef,
          videoProducerRef,
        },
      );
      if (!consumed) return;
      const { consumer, kind } = consumed;

      let stream = remoteStreamsRef.current.get(peerId);
      if (!stream) {
        stream = new MediaStream();
        remoteStreamsRef.current.set(peerId, stream);
      }
      stream.addTrack(consumer.track);

      consumersByProducerRef.current.set(producerId, {
        consumer,
        peerId,
        username: producerUsername,
        kind,
      });
      pendingProducersRef.current.delete(producerId);

      consumer.on("transportclose", () => removeRemoteTrack(producerId));
      // Do not tear down on trackended. During track replacement
      // (camera <-> screen), browsers can emit transient ended states.
      // We rely on explicit producer-closed notifications instead.

      updatePeerState(peerId, producerUsername);
    },
    [removeRemoteTrack, sendRequest, updatePeerState],
  );

  const produceTrack = useCallback(
    async (kind: "audio" | "video", track: MediaStreamTrack): Promise<void> => {
      await produceOrReplaceTrack(kind, track, {
        deviceRef,
        sendTransportRef,
        recvTransportRef,
        audioProducerRef,
        videoProducerRef,
      });
    },
    [],
  );

  const setupMediasoup = useCallback(async (): Promise<void> => {
    await initializeMediasoupSession({
      initializedRef,
      sendRequest,
      refs: {
        deviceRef,
        sendTransportRef,
        recvTransportRef,
        audioProducerRef,
        videoProducerRef,
      },
      localStream,
      consumeProducer,
    });

    const pendingProducers = Array.from(pendingProducersRef.current.entries());
    if (pendingProducers.length > 0) {
      await Promise.all(
        pendingProducers.map(([producerId, meta]) =>
          consumeProducer(producerId, meta.peerId, meta.username),
        ),
      );
    }
  }, [consumeProducer, localStream, sendRequest]);

  // 1) Initialize local media stream with AV -> audio-only -> video-only fallback chain.
  useEffect(() => {
    let stream: MediaStream;
    const initMedia = async () => {
      const applyPreferences = (mediaStream: MediaStream) => {
        mediaStream.getVideoTracks().forEach((track) => (track.enabled = isCamOn));
        mediaStream.getAudioTracks().forEach((track) => (track.enabled = isMicOn));
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: SPEECH_AUDIO_CONSTRAINTS,
        });
      } catch (err) {
        console.warn("AV media access failed, trying fallback modes", err);
        try {
          stream = await getAudioStream();
        } catch {
          try {
            stream = await getCameraStream();
          } catch (finalErr) {
            console.warn("Media fallback failed, joining without local tracks", finalErr);
            stream = new MediaStream();
          }
        }
      }

      applyPreferences(stream);
      const initialCameraTrack = stream.getVideoTracks()[0] || null;
      cameraTrackRef.current = initialCameraTrack;
      if (initialCameraTrack) {
        initialCameraTrack.onended = () => {
          if (!isScreenSharingRef.current) {
            setCam(false);
            setMediaTick((v) => v + 1);
          }
        };
      }
      setLocalStream(stream);
    };

    void initMedia();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [getAudioStream, getCameraStream]);

  const ensureAudioTrack = useCallback(async (): Promise<boolean> => {
    if (!localStream) return false;
    const liveAudioTrack = localStream.getAudioTracks().find((track) => track.readyState === "live");
    if (liveAudioTrack) return true;
    try {
      const audioStream = await getAudioStream();
      const audioTrack = audioStream.getAudioTracks()[0];
      if (!audioTrack) return false;
      audioTrack.contentHint = "speech";
      audioTrack.enabled = isMicOn;
      localStream.addTrack(audioTrack);
      await produceTrack("audio", audioTrack);
      return true;
    } catch (err) {
      console.error("Unable to acquire audio track", err);
      return false;
    }
  }, [getAudioStream, isMicOn, localStream, produceTrack]);

  const ensureCameraTrack = useCallback(async (): Promise<boolean> => {
    if (!localStream || isScreenSharingRef.current) return false;
    const liveVideoTrack = localStream.getVideoTracks().find((track) => track.readyState === "live");
    if (liveVideoTrack) return true;
    try {
      localStream.getVideoTracks().forEach((track) => {
        if (track.readyState !== "live") {
          localStream.removeTrack(track);
          track.stop();
        }
      });

      const videoStream = await getCameraStream();
      const videoTrack = videoStream.getVideoTracks()[0];
      if (!videoTrack) return false;
      videoTrack.enabled = isCamOn;
      cameraTrackRef.current = videoTrack;
      videoTrack.onended = () => {
        if (!isScreenSharingRef.current) {
          setCam(false);
          setMediaTick((v) => v + 1);
        }
      };
      localStream.addTrack(videoTrack);
      await produceTrack("video", videoTrack);
      setMediaTick((v) => v + 1);
      return true;
    } catch (err) {
      console.error("Unable to acquire video track", err);
      return false;
    }
  }, [getCameraStream, isCamOn, localStream, produceTrack, setCam]);

  useEffect(() => {
    if (!localStream) return;

    localStream.getVideoTracks().forEach((track) => {
      track.enabled = isScreenSharing ? true : isCamOn;
    });
    localStream.getAudioTracks().forEach((track) => (track.enabled = isMicOn));

    const audioProducer = audioProducerRef.current;
    const videoProducer = videoProducerRef.current;
    if (audioProducer) {
      if (isMicOn) audioProducer.resume();
      else audioProducer.pause();
    }
    if (videoProducer && !isScreenSharing) {
      if (isCamOn) videoProducer.resume();
      else videoProducer.pause();
    }

    if (isMicOn) {
      void ensureAudioTrack();
    }
    if (isCamOn && !isScreenSharing) {
      void ensureCameraTrack();
    }
  }, [isMicOn, isCamOn, isScreenSharing, localStream, ensureAudioTrack, ensureCameraTrack]);

  // 2) Initialize signaling + mediasoup for the active room/subroom.
  useEffect(() => {
    if (!localStream || !username) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      ws.send(
        JSON.stringify({
          type: "join",
          payload: { roomId, subroomId, username },
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "ms-response") {
          const requestId = String(data.requestId ?? "");
          const pending = pendingRequestsRef.current.get(requestId);
          if (!pending) return;
          pendingRequestsRef.current.delete(requestId);
          if (data.error) {
            pending.reject(new Error(String(data.error)));
          } else {
            pending.resolve(data.data);
          }
          return;
        }

        if (data.type === "ms-notification") {
          if (data.action === "new-producer") {
            const { producerId, peerId, username: remoteUsername } = data.data || {};
            if (producerId && peerId) {
              void consumeProducer(producerId, peerId, remoteUsername || `User-${peerId.slice(0, 4)}`);
            }
          }
          if (data.action === "producer-closed") {
            const { producerId } = data.data || {};
            if (producerId) {
              pendingProducersRef.current.delete(producerId);
              removeRemoteTrack(producerId);
            }
          }
          return;
        }

        if (data.type === "joined") {
          if (!joinedRef.current) {
            joinedRef.current = true;
            void setupMediasoup().catch((err: any) => {
              setError(`Connection error: ${err?.message || "Unable to start media session"}`);
            });
          }
        }

        if (data.type === "user-joined") {
          playJoinTone();
        }

        if (data.type === "user-left") {
          const { socketId: remotePeerId } = data.payload || {};
          if (!remotePeerId) return;
          Array.from(pendingProducersRef.current.entries()).forEach(([producerId, meta]) => {
            if (meta.peerId === remotePeerId) {
              pendingProducersRef.current.delete(producerId);
            }
          });
          const producerIds = Array.from(consumersByProducerRef.current.entries())
            .filter(([, value]) => value.peerId === remotePeerId)
            .map(([producerId]) => producerId);
          producerIds.forEach((producerId) => removeRemoteTrack(producerId));
        }
      } catch (e) {
        console.error("WS message parse error", e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      pendingRequestsRef.current.forEach(({ reject }) => reject(new Error("Socket closed")));
      pendingRequestsRef.current.clear();
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      pendingRequestsRef.current.forEach(({ reject }) => reject(new Error("Session closed")));
      pendingRequestsRef.current.clear();

      consumersByProducerRef.current.forEach(({ consumer }) => consumer.close());
      consumersByProducerRef.current.clear();
      pendingProducersRef.current.clear();
      remoteStreamsRef.current.forEach((stream) => stream.getTracks().forEach((t) => t.stop()));
      remoteStreamsRef.current.clear();
      remoteUsernamesRef.current.clear();
      setPeers({});

      closeMediasoupSession({
        deviceRef,
        sendTransportRef,
        recvTransportRef,
        audioProducerRef,
        videoProducerRef,
      });

      initializedRef.current = false;
      joinedRef.current = false;

      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    };
  }, [consumeProducer, localStream, playJoinTone, removeRemoteTrack, roomId, setupMediasoup, subroomId, username]);

  const stopScreenShare = useCallback(async (): Promise<void> => {
    if (!localStream || isScreenShareTransitioningRef.current) return;
    isScreenShareTransitioningRef.current = true;
    try {
      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (currentVideoTrack) {
        localStream.removeTrack(currentVideoTrack);
        currentVideoTrack.stop();
      }
      screenTrackRef.current = null;

      const shouldRestoreCamera = isCamOn;
      if (shouldRestoreCamera) {
        const videoStream = await getCameraStream();
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          cameraTrackRef.current = videoTrack;
          videoTrack.onended = () => {
            if (!isScreenSharingRef.current) {
              setCam(false);
              setMediaTick((v) => v + 1);
            }
          };
          videoTrack.enabled = true;
          localStream.addTrack(videoTrack);
          await produceTrack("video", videoTrack);
          videoProducerRef.current?.resume();
        } else {
          setCam(false);
          videoProducerRef.current?.pause();
        }
      } else {
        videoProducerRef.current?.pause();
      }

      setIsScreenSharing(false);
      setMediaTick((v) => v + 1);
    } catch (err) {
      console.error("Error reverting to camera", err);
      setIsScreenSharing(false);
      setCam(false);
      videoProducerRef.current?.pause();
      setMediaTick((v) => v + 1);
    } finally {
      isScreenShareTransitioningRef.current = false;
    }
  }, [getCameraStream, isCamOn, localStream, produceTrack, setCam]);

  const startScreenShare = useCallback(async (): Promise<void> => {
    if (!localStream || isScreenShareTransitioningRef.current || !canScreenShare) return;
    isScreenShareTransitioningRef.current = true;
    try {
      const screenStream = await getDisplayStream();
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrack.enabled = true;
      screenTrackRef.current = screenTrack;

      screenTrack.onended = () => {
        if (isScreenSharingRef.current) {
          void stopScreenShare();
        }
      };

      const currentVideoTrack = localStream.getVideoTracks()[0];
      if (currentVideoTrack) {
        localStream.removeTrack(currentVideoTrack);
        if (currentVideoTrack !== cameraTrackRef.current) {
          currentVideoTrack.stop();
        }
      }
      localStream.addTrack(screenTrack);

      await produceTrack("video", screenTrack);
      videoProducerRef.current?.resume();
      setIsScreenSharing(true);
      setMediaTick((v) => v + 1);
    } catch (err) {
      console.error("Error sharing screen", err);
      throw err;
    } finally {
      isScreenShareTransitioningRef.current = false;
    }
  }, [canScreenShare, getDisplayStream, localStream, produceTrack, stopScreenShare]);

  const toggleScreenShare = async (): Promise<boolean> => {
    if (isScreenSharingRef.current) {
      await stopScreenShare();
      return true;
    }
    await startScreenShare();
    return true;
  };

  const toggleMicTrack = useCallback(async (): Promise<void> => {
    const nextMicOn = !isMicOn;
    if (!localStream) {
      setMic(false);
      return;
    }

    if (nextMicOn) {
      const hasAudioTrack = await ensureAudioTrack();
      if (!hasAudioTrack) {
        setMic(false);
        console.warn("Microphone unavailable. Please check browser permission/device.");
        return;
      }
      audioProducerRef.current?.resume();
    } else {
      audioProducerRef.current?.pause();
    }

    setMic(nextMicOn);
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = nextMicOn;
    });
    setMediaTick((v) => v + 1);
  }, [ensureAudioTrack, isMicOn, localStream, setMic]);

  const toggleCamTrack = useCallback(async (): Promise<void> => {
    const nextCamOn = !isCamOn;
    if (!localStream) {
      setCam(false);
      return;
    }

    if (!isScreenSharingRef.current && nextCamOn) {
      const hasVideoTrack = await ensureCameraTrack();
      if (!hasVideoTrack) {
        setCam(false);
        console.warn("Camera unavailable. Please check browser permission/device.");
        return;
      }
      videoProducerRef.current?.resume();
    } else if (!isScreenSharingRef.current && !nextCamOn) {
      videoProducerRef.current?.pause();
    }

    setCam(nextCamOn);
    if (!isScreenSharingRef.current) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = nextCamOn;
      });
      setMediaTick((v) => v + 1);
    }
  }, [ensureCameraTrack, isCamOn, localStream, setCam]);

  const effectiveMicOn = Boolean(
    localStream?.getAudioTracks().some((track) => track.enabled && track.readyState === "live"),
  );
  const effectiveCamOn = isCamOn;

  return {
    localStream,
    peers,
    isConnected,
    error,
    isMicOn: effectiveMicOn,
    isCamOn: effectiveCamOn,
    toggleMic: toggleMicTrack,
    toggleCam: toggleCamTrack,
    isScreenSharing,
    canScreenShare,
    toggleScreenShare,
    ws: wsRef.current,
  };
}

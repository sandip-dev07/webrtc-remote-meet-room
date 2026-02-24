import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { MediaConnection } from 'peerjs';
import { useMeetingStore } from '@/store/meeting-store';
import {
  SPEECH_AUDIO_CONSTRAINTS,
  canUseScreenShare,
  getAudioStream,
  getCameraStream,
  getDisplayStream,
  optimizeAudioForCall,
} from './webrtc-media';
import { useTone } from './use-tone';

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

export function useWebRTC({ roomId, subroomId, username }: UseWebRTCProps): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [canScreenShare, setCanScreenShare] = useState(false);
  const [, setMediaTick] = useState(0);
  
  const peerInstance = useRef<Peer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectionsRef = useRef<Record<string, MediaConnection>>({});
  const peersRef = useRef<Record<string, PeerState>>({});
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

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  const addPeer = useCallback((peerId: string, stream: MediaStream, name: string): void => {
    setPeers(prev => ({
      ...prev,
      [peerId]: { stream, username: name }
    }));
  }, []);

  const removePeer = useCallback((peerId: string): void => {
    setPeers(prev => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  // Attach remote stream + lifecycle handlers for a peer call.
  const attachCallHandlers = useCallback((call: MediaConnection, remoteUsername: string): void => {
    call.on('stream', (userVideoStream) => {
      addPeer(call.peer, userVideoStream, remoteUsername);
    });

    call.on('close', () => {
      removePeer(call.peer);
      if (connectionsRef.current[call.peer] === call) {
        delete connectionsRef.current[call.peer];
      }
    });
  }, [addPeer, removePeer]);

  // Recreate call when sender-track replacement cannot be negotiated reliably.
  const reconnectPeerWithStream = useCallback((remotePeerId: string, stream: MediaStream): void => {
    if (!peerInstance.current) return;

    const existingCall = connectionsRef.current[remotePeerId];
    if (existingCall) {
      existingCall.close();
      delete connectionsRef.current[remotePeerId];
    }

    const remoteUsername =
      peersRef.current[remotePeerId]?.username || `User-${remotePeerId.substring(0, 4)}`;

    const newCall = peerInstance.current.call(remotePeerId, stream, {
      metadata: { username },
    });

    attachCallHandlers(newCall, remoteUsername);
    optimizeAudioForCall(newCall);
    connectionsRef.current[remotePeerId] = newCall;
  }, [attachCallHandlers, optimizeAudioForCall, username]);

  // Replace outbound video track across active peer connections.
  const replaceOutgoingVideoTrack = useCallback((videoTrack: MediaStreamTrack, stream: MediaStream): void => {
    Object.values(connectionsRef.current).forEach(call => {
      const videoSender = call.peerConnection
        .getSenders()
        .find(sender => sender.track?.kind === 'video');

      if (videoSender) {
        void videoSender.replaceTrack(videoTrack);
      } else {
        // PeerJS does not renegotiate dynamically-added tracks reliably.
        // Re-establish this call with current stream so remote peers receive updates.
        reconnectPeerWithStream(call.peer, stream);
      }
    });
  }, [reconnectPeerWithStream]);

  // Generic sender-track replacement for audio/video.
  const replaceOutgoingTrack = useCallback((track: MediaStreamTrack, stream: MediaStream): void => {
    Object.values(connectionsRef.current).forEach(call => {
      const sender = call.peerConnection
        .getSenders()
        .find(s => s.track?.kind === track.kind);

      if (sender) {
        void sender.replaceTrack(track);
      } else {
        reconnectPeerWithStream(call.peer, stream);
      }
    });
  }, [reconnectPeerWithStream]);

  // Place outgoing call to newly joined peer.
  const connectToNewUser = useCallback((remotePeerId: string, remoteUsername: string, stream: MediaStream): void => {
    if (!peerInstance.current) return;

    const call = peerInstance.current.call(remotePeerId, stream, {
      metadata: { username }
    });

    attachCallHandlers(call, remoteUsername);
    optimizeAudioForCall(call);
    connectionsRef.current[remotePeerId] = call;
  }, [attachCallHandlers, optimizeAudioForCall, username]);

  // 1) Initialize local media stream with AV -> audio-only -> video-only fallback chain.
  useEffect(() => {
    let stream: MediaStream;
    const initMedia = async () => {
      const applyPreferences = (mediaStream: MediaStream) => {
        mediaStream.getVideoTracks().forEach(track => (track.enabled = isCamOn));
        mediaStream.getAudioTracks().forEach(track => (track.enabled = isMicOn));
      };

      try {
        // Try full AV first.
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: SPEECH_AUDIO_CONSTRAINTS,
        });
      } catch (err) {
        console.warn("AV media access failed, trying fallback modes", err);
        try {
          // Fallback 1: audio-only
          stream = await getAudioStream();
        } catch {
          try {
            // Fallback 2: video-only
            stream = await getCameraStream();
          } catch (finalErr) {
            console.warn("Media fallback failed, joining without local tracks", finalErr);
            // Do not block the room if media devices are unavailable.
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
    
    initMedia();
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [getAudioStream, getCameraStream]); // Only run once on mount, preferences applied via effect below

  // Ensure mic track exists when user enables mic (can be re-acquired after device loss).
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
      replaceOutgoingTrack(audioTrack, localStream);
      Object.values(connectionsRef.current).forEach((call) => optimizeAudioForCall(call));
      return true;
    } catch (err) {
      console.error("Unable to acquire audio track", err);
      return false;
    }
  }, [getAudioStream, isMicOn, localStream, optimizeAudioForCall, replaceOutgoingTrack]);

  // Ensure camera track exists when user enables cam (except while screen sharing).
  const ensureCameraTrack = useCallback(async (): Promise<boolean> => {
    if (!localStream || isScreenSharingRef.current) return false;
    const liveVideoTrack = localStream.getVideoTracks().find((track) => track.readyState === "live");
    if (liveVideoTrack) return true;
    try {
      // Remove stale/ended video tracks before reacquiring camera.
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
      replaceOutgoingTrack(videoTrack, localStream);
      setMediaTick((v) => v + 1);
      return true;
    } catch (err) {
      console.error("Unable to acquire video track", err);
      return false;
    }
  }, [getCameraStream, isCamOn, localStream, replaceOutgoingTrack]);

  useEffect(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = isScreenSharing ? true : isCamOn;
      });
      localStream.getAudioTracks().forEach(track => (track.enabled = isMicOn));
    }
    if (isMicOn) {
      void ensureAudioTrack();
    }
    if (isCamOn && !isScreenSharing) {
      void ensureCameraTrack();
    }
  }, [isMicOn, isCamOn, isScreenSharing, localStream, ensureAudioTrack, ensureCameraTrack]);

  // 2) Initialize PeerJS + WebSocket signaling for the active room/subroom.
  useEffect(() => {
    if (!localStream || !username) return;

    // Initialize PeerJS
    const peer = new Peer(); // Uses default PeerJS cloud server for demo
    peerInstance.current = peer;

    peer.on('open', (peerId) => {
      console.log('My peer ID is: ' + peerId);
      
      // Once we have a PeerID, connect to our WebSocket signaling server
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        // Announce we joined
        ws.send(JSON.stringify({
          type: 'join',
          payload: { roomId, subroomId, username, peerId }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'user-joined') {
            const { peerId: remotePeerId, username: remoteUsername } = data.payload;
            if (remotePeerId !== peerId) {
              playJoinTone();
              connectToNewUser(remotePeerId, remoteUsername, localStream);
            }
          }
          
          if (data.type === 'user-left') {
            const { peerId: remotePeerId } = data.payload;
            if (connectionsRef.current[remotePeerId]) {
              connectionsRef.current[remotePeerId].close();
              delete connectionsRef.current[remotePeerId];
            }
            setPeers(prev => {
              const next = { ...prev };
              delete next[remotePeerId];
              return next;
            });
          }
        } catch (e) {
          console.error("WS message parse error", e);
        }
      };

      ws.onclose = () => setIsConnected(false);
      ws.onerror = () => setIsConnected(false);
    });

    // Handle incoming calls
    peer.on('call', (call) => {
      // Answer the call, providing our mediaStream
      call.answer(localStream);
      
      // Expect the caller's peer ID and metadata to include their username
      // For simplicity in this demo, we might just use their peerId as username if metadata fails
      const remoteUsername = call.metadata?.username || `User-${call.peer.substring(0,4)}`;
      attachCallHandlers(call, remoteUsername);
      optimizeAudioForCall(call);
      
      connectionsRef.current[call.peer] = call;
    });

    peer.on('error', (err) => {
      console.error("PeerJS error:", err);
      setError(`Connection error: ${err.message}`);
    });

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (peerInstance.current) peerInstance.current.destroy();
      connectionsRef.current = {};
      setPeers({});
      setIsConnected(false);
    };
  }, [attachCallHandlers, connectToNewUser, localStream, playJoinTone, roomId, subroomId, username]);

  // Stop display capture and restore camera track when enabled.
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
          replaceOutgoingVideoTrack(videoTrack, localStream);
        } else {
          setCam(false);
        }
      }

      setIsScreenSharing(false);
      setMediaTick((v) => v + 1);
    } catch (err) {
      console.error("Error reverting to camera", err);
      // Do not keep stale screen-share state if track is gone.
      setIsScreenSharing(false);
      setCam(false);
      setMediaTick((v) => v + 1);
    } finally {
      isScreenShareTransitioningRef.current = false;
    }
  }, [getCameraStream, isCamOn, localStream, replaceOutgoingVideoTrack, setCam]);

  // Start display capture and broadcast it as the active outbound video track.
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
        // Keep camera track for quick restore, but stop non-camera orphan tracks.
        if (currentVideoTrack !== cameraTrackRef.current) {
          currentVideoTrack.stop();
        }
      }
      localStream.addTrack(screenTrack);

      replaceOutgoingVideoTrack(screenTrack, localStream);
      setIsScreenSharing(true);
      setMediaTick((v) => v + 1);
    } catch (err) {
      console.error("Error sharing screen", err);
      throw err;
    } finally {
      isScreenShareTransitioningRef.current = false;
    }
  }, [canScreenShare, getDisplayStream, localStream, replaceOutgoingVideoTrack, stopScreenShare]);

  // Toggle between camera and display capture.
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
    }

    setMic(nextMicOn);
    localStream.getAudioTracks().forEach(track => {
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

    // During screen share we only persist preference for post-share camera behavior.
    if (!isScreenSharingRef.current && nextCamOn) {
      const hasVideoTrack = await ensureCameraTrack();
      if (!hasVideoTrack) {
        setCam(false);
        console.warn("Camera unavailable. Please check browser permission/device.");
        return;
      }
    }

    setCam(nextCamOn);
    if (!isScreenSharingRef.current) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = nextCamOn;
      });
      setMediaTick((v) => v + 1);
    }
  }, [ensureCameraTrack, isCamOn, localStream, setCam]);

  const effectiveMicOn = Boolean(
    localStream?.getAudioTracks().some(track => track.enabled && track.readyState === "live")
  );
  // Camera UI reflects camera preference, not temporary screen-share state.
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
    ws: wsRef.current
  };
}

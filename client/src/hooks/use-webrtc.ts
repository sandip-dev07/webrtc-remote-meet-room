import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { MediaConnection } from 'peerjs';
import { useMeetingStore } from '@/store/meeting-store';

export type PeerState = {
  stream: MediaStream;
  username: string;
};

interface UseWebRTCProps {
  roomId: string;
  subroomId: string;
  username: string;
}

export function useWebRTC({ roomId, subroomId, username }: UseWebRTCProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const peerInstance = useRef<Peer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectionsRef = useRef<Record<string, MediaConnection>>({});
  
  const { isMicOn, isCamOn } = useMeetingStore();

  // 1. Initialize Local Stream
  useEffect(() => {
    let stream: MediaStream;
    const initMedia = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        
        // Apply initial preferences
        stream.getVideoTracks().forEach(track => (track.enabled = isCamOn));
        stream.getAudioTracks().forEach(track => (track.enabled = isMicOn));
        
        setLocalStream(stream);
      } catch (err) {
        console.error("Failed to get local stream", err);
        setError("Could not access camera or microphone. Please check permissions.");
      }
    };
    
    initMedia();
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []); // Only run once on mount, preferences applied via effect below

  // Update track enabled state when preferences change
  useEffect(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => (track.enabled = isCamOn));
      localStream.getAudioTracks().forEach(track => (track.enabled = isMicOn));
    }
  }, [isMicOn, isCamOn, localStream]);

  // 2. Initialize PeerJS & WebSocket
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
    });

    // Handle incoming calls
    peer.on('call', (call) => {
      // Answer the call, providing our mediaStream
      call.answer(localStream);
      
      // Expect the caller's peer ID and metadata to include their username
      // For simplicity in this demo, we might just use their peerId as username if metadata fails
      const remoteUsername = call.metadata?.username || `User-${call.peer.substring(0,4)}`;
      
      call.on('stream', (userVideoStream) => {
        addPeer(call.peer, userVideoStream, remoteUsername);
      });
      
      connectionsRef.current[call.peer] = call;
      
      call.on('close', () => {
        removePeer(call.peer);
      });
    });

    peer.on('error', (err) => {
      console.error("PeerJS error:", err);
      setError(`Connection error: ${err.message}`);
    });

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (peerInstance.current) peerInstance.current.destroy();
      connectionsRef.current = {};
    };
  }, [localStream, roomId, subroomId, username]);

  // Helper to connect to a new user
  const connectToNewUser = useCallback((remotePeerId: string, remoteUsername: string, stream: MediaStream) => {
    if (!peerInstance.current) return;
    
    // Call the other peer, passing our username in metadata
    const call = peerInstance.current.call(remotePeerId, stream, {
      metadata: { username }
    });
    
    call.on('stream', (userVideoStream) => {
      addPeer(remotePeerId, userVideoStream, remoteUsername);
    });
    
    call.on('close', () => {
      removePeer(remotePeerId);
    });

    connectionsRef.current[remotePeerId] = call;
  }, [username]);

  const addPeer = (peerId: string, stream: MediaStream, name: string) => {
    setPeers(prev => ({
      ...prev,
      [peerId]: { stream, username: name }
    }));
  };

  const removePeer = (peerId: string) => {
    setPeers(prev => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  };

  // Screen sharing toggle
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const toggleScreenShare = async () => {
    if (!localStream) return;

    if (isScreenSharing) {
      // Revert to camera
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        
        const sender = localStream.getVideoTracks()[0];
        localStream.removeTrack(sender);
        localStream.addTrack(videoTrack);
        
        // Update all peers with new track
        Object.values(connectionsRef.current).forEach(call => {
          const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(videoTrack);
        });
        
        videoTrack.enabled = isCamOn;
        setIsScreenSharing(false);
      } catch (err) {
        console.error("Error reverting to camera", err);
      }
    } else {
      // Start screen share
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // When user stops screen sharing via browser UI
        screenTrack.onended = () => {
          toggleScreenShare(); // Revert back
        };

        const sender = localStream.getVideoTracks()[0];
        localStream.removeTrack(sender);
        localStream.addTrack(screenTrack);
        
        // Update all peers with new track
        Object.values(connectionsRef.current).forEach(call => {
          const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });

        setIsScreenSharing(true);
      } catch (err) {
        console.error("Error sharing screen", err);
      }
    }
  };

  return {
    localStream,
    peers,
    isConnected,
    error,
    isScreenSharing,
    toggleScreenShare,
    ws: wsRef.current
  };
}

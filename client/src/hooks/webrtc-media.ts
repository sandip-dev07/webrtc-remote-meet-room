import type { MediaConnection } from "peerjs";

export const SPEECH_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
};

export function canUseScreenShare(): boolean {
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isIOS =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) &&
      typeof navigator !== "undefined" &&
      navigator.maxTouchPoints > 1);
  const supportsDisplayMedia =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function";
  const secureContextEnabled =
    typeof window !== "undefined" ? window.isSecureContext : false;
  return supportsDisplayMedia && secureContextEnabled && !isIOS;
}

// Prioritize speech quality under unstable network conditions.
export function optimizeAudioForCall(call: MediaConnection): void {
  const audioSender = call.peerConnection
    .getSenders()
    .find((sender) => sender.track?.kind === "audio");

  if (!audioSender) return;

  const track = audioSender.track;
  if (track) {
    track.contentHint = "speech";
  }

  if (!audioSender.getParameters || !audioSender.setParameters) return;

  const params = audioSender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }

  params.encodings[0].maxBitrate = 32000;
  params.encodings[0].priority = "high";
  params.encodings[0].networkPriority = "high";

  void audioSender.setParameters(params).catch((err) => {
    console.warn("Failed to set audio sender parameters", err);
  });
}

// Acquire microphone with speech-friendly constraints and safe fallback.
export async function getAudioStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: SPEECH_AUDIO_CONSTRAINTS,
      video: false,
    });
  } catch (err) {
    console.warn(
      "Primary audio constraints failed, retrying with loose constraints",
      err,
    );
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

// Acquire camera with progressive fallbacks for browser/device compatibility.
export async function getCameraStream(): Promise<MediaStream> {
  const cameraConstraintSets: MediaStreamConstraints[] = [
    {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    },
    { video: true, audio: false },
  ];

  let lastError: unknown;
  for (const constraints of cameraConstraintSets) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const firstCamera = devices.find((device) => device.kind === "videoinput");
    if (firstCamera) {
      return await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: firstCamera.deviceId } },
        audio: false,
      });
    }
  } catch (err) {
    lastError = err;
  }

  throw lastError ?? new Error("Unable to acquire camera stream");
}

//
export async function getDisplayStream(): Promise<MediaStream> {
  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getDisplayMedia !== "function"
  ) {
    throw new Error("Screen sharing is not supported on this browser/device.");
  }

  const displayConstraintSets: MediaStreamConstraints[] = [
    {
      video: {
        frameRate: { ideal: 15, max: 24 },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      } as MediaTrackConstraints,
      audio: false,
    },
    { video: true, audio: false },
  ];

  let lastError: unknown;
  for (const constraints of displayConstraintSets) {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = "detail";
        return stream;
      }
      stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error("Unable to start screen sharing.");
}

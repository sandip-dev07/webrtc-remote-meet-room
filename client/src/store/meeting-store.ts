import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CameraBlurMode = 'none' | 'light' | 'strong';

interface MeetingState {
  username: string;
  isMicOn: boolean;
  isCamOn: boolean;
  cameraBlurMode: CameraBlurMode;
  isSubroomMinimized: boolean;
  setUsername: (name: string) => void;
  toggleMic: () => void;
  toggleCam: () => void;
  setMic: (state: boolean) => void;
  setCam: (state: boolean) => void;
  setCameraBlurMode: (mode: CameraBlurMode) => void;
  setSubroomMinimized: (state: boolean) => void;
}

export const useMeetingStore = create<MeetingState>()(
  persist(
    (set) => ({
      username: '',
      isMicOn: false,
      isCamOn: false,
      cameraBlurMode: 'none',
      isSubroomMinimized: false,
      setUsername: (username) => set({ username }),
      toggleMic: () => set((state) => ({ isMicOn: !state.isMicOn })),
      toggleCam: () => set((state) => ({ isCamOn: !state.isCamOn })),
      setMic: (isMicOn) => set({ isMicOn }),
      setCam: (isCamOn) => set({ isCamOn }),
      setCameraBlurMode: (cameraBlurMode) => set({ cameraBlurMode }),
      setSubroomMinimized: (isSubroomMinimized) => set({ isSubroomMinimized }),
    }),
    {
      name: 'meeting-preferences',
    }
  )
);

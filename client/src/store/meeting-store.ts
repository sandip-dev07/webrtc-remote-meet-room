import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MeetingState {
  username: string;
  isMicOn: boolean;
  isCamOn: boolean;
  setUsername: (name: string) => void;
  toggleMic: () => void;
  toggleCam: () => void;
  setMic: (state: boolean) => void;
  setCam: (state: boolean) => void;
}

export const useMeetingStore = create<MeetingState>()(
  persist(
    (set) => ({
      username: '',
      isMicOn: true,
      isCamOn: true,
      setUsername: (username) => set({ username }),
      toggleMic: () => set((state) => ({ isMicOn: !state.isMicOn })),
      toggleCam: () => set((state) => ({ isCamOn: !state.isCamOn })),
      setMic: (isMicOn) => set({ isMicOn }),
      setCam: (isCamOn) => set({ isCamOn }),
    }),
    {
      name: 'meeting-preferences',
    }
  )
);

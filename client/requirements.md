## Packages
peerjs | Simplifies WebRTC peer-to-peer data, video, and audio calls
zustand | Lightweight global state management for user preferences (mic/cam state, username)
framer-motion | Smooth animations for UI elements (modals, sidebars, video grid resizing)
date-fns | Formatting message timestamps

## Notes
- Expecting a WebSocket connection at `ws://${window.location.host}` or `wss://${...}` for signaling chat and user presence.
- PeerJS is used for actual media streams. By default, it will attempt to use the PeerJS public cloud server for connection brokering unless configured otherwise in the app.
- Backend should enforce the max 3 subrooms rule and max 10 users rule, returning 403 when exceeded.

## Packages
mediasoup-client | WebRTC SFU client SDK for transport/produce/consume flow
zustand | Lightweight global state management for user preferences (mic/cam state, username)
framer-motion | Smooth animations for UI elements (modals, sidebars, video grid resizing)
date-fns | Formatting message timestamps

## Notes
- Expecting a WebSocket connection at `ws://${window.location.host}` or `wss://${...}` for signaling chat and user presence.
- mediasoup is used as the SFU on the server, and mediasoup-client handles browser transport/producer/consumer sessions.
- Backend should enforce the max 3 subrooms rule and max 10 users rule, returning 403 when exceeded.

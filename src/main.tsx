import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// We do NOT wrap App in <StrictMode>.
//
// StrictMode double-mounts components in dev to surface effect cleanup
// bugs. That's normally a good thing, but `useAgentChat` (from
// `@cloudflare/ai-chat/react`) sets up WebSocket subscriptions that
// re-fire on every mount cycle — under StrictMode the second mount
// subscribes a second time before the first cleanup completes, and
// every assistant message gets processed twice. You end up with
// duplicate responses on every send.
//
// Workaround: skip StrictMode. The trade-off is we lose StrictMode's
// dev-time invariant checks, but the chat hook becomes reliable in
// dev. If a future version of @cloudflare/ai-chat fixes the
// double-subscription, re-add <StrictMode>.
createRoot(document.getElementById("root")!).render(<App />);

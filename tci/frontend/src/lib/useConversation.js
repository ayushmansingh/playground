import { useCallback, useRef, useState } from "react";
import { fetchJson } from "./api.js";

const EMPTY = { conversationId: null, messageId: null, status: "idle", data: null, error: "" };

// The conversation a view has open. Late responses for an earlier pick are
// dropped, and the previous data stays visible while the next one loads.
export default function useConversation() {
    const [conversation, setConversation] = useState(EMPTY);
    const requestId = useRef(0);

    const open = useCallback(async (conversationId, messageId = null) => {
        const id = ++requestId.current;
        setConversation((current) => ({ ...current, conversationId, messageId, status: "loading" }));
        try {
            const data = await fetchJson(`/api/conversation?conversation_id=${encodeURIComponent(conversationId)}`);
            if (id === requestId.current) {
                setConversation({ conversationId, messageId, status: "ready", data, error: "" });
            }
        } catch (error) {
            if (id === requestId.current) {
                setConversation({ conversationId, messageId, status: "error", data: null, error: error.message });
            }
        }
    }, []);

    return { conversation, open };
}

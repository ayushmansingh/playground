import React, { useEffect, useRef } from "react";

const IMAGE_URL_PATTERN = /\/images\/|\.png(?:\?|$)|\.jpe?g(?:\?|$)|\.gif(?:\?|$)|\.webp(?:\?|$)|\.bmp(?:\?|$)|\.svg(?:\?|$)/i;

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Wraps case-insensitive occurrences of `term` in <mark>.
export function Highlight({ text, term }) {
    const value = String(text ?? "");
    const needle = term?.trim();
    if (!needle) {
        return value;
    }
    const parts = value.split(new RegExp(`(${escapeRegExp(needle)})`, "gi"));
    return parts.map((part, index) => (index % 2 ? <mark key={index}>{part}</mark> : part));
}

function MessageBody({ content, term }) {
    const text = String(content ?? "");
    const imageUrls = (text.match(/https?:\/\/[^\s]+/gi) || []).filter((url) => IMAGE_URL_PATTERN.test(url));
    const textOnly = imageUrls.reduce((remaining, url) => remaining.replace(url, ""), text).trim();

    if (!textOnly && !imageUrls.length) {
        return <div className="message-text">{text}</div>;
    }
    return (
        <>
            {textOnly && <div className="message-text"><Highlight text={textOnly} term={term} /></div>}
            {imageUrls.map((url, index) => (
                <div className="image-block" key={`${index}-${url}`}>
                    <a className="image-link" href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="Chat image" loading="lazy" />
                    </a>
                    <a className="media-link" href={url} target="_blank" rel="noopener noreferrer">Open image</a>
                </div>
            ))}
        </>
    );
}

// The full chat. `focusId` is scrolled into view; `evidenceIds` are the
// messages the AI cited; `term` is highlighted wherever it appears.
export default function Transcript({ messages, focusId, evidenceIds = [], term = "" }) {
    const listRef = useRef(null);
    const focusRef = useRef(null);
    const evidence = new Set(evidenceIds.map(Number));

    // Centre the focused message inside the list without scrolling the page
    // (the list is position: relative, so offsetTop is measured from it).
    useEffect(() => {
        const list = listRef.current;
        const target = focusRef.current;
        if (list) {
            list.scrollTop = target ? target.offsetTop - list.clientHeight / 2 + target.clientHeight / 2 : 0;
        }
    }, [messages, focusId]);

    return (
        <div className="transcript-list" ref={listRef}>
            {messages.map((message) => {
                const isFocus = Number(message.id) === Number(focusId);
                const classes = [
                    "bubble",
                    String(message.sender_type).toLowerCase() === "customer" ? "customer" : "he",
                    isFocus && "selected",
                    evidence.has(Number(message.id)) && "evidence",
                ].filter(Boolean).join(" ");
                return (
                    <article key={message.id} ref={isFocus ? focusRef : undefined} className={classes}>
                        <div className="bubble-meta">
                            <span>{message.sender_type}</span>
                            <span>{message.message_datetime}</span>
                        </div>
                        <MessageBody content={message.message_content} term={term} />
                    </article>
                );
            })}
        </div>
    );
}

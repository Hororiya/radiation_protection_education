import React from "react";

type EmoteKey = "check" | "question" | "exclamation" | "cross";

const EMOTES: { key: EmoteKey; label: string; color: string; assetId: string }[] = [
    { key: "check", label: "✓", color: "#2e7d32", assetId: "#emote-check" },
    { key: "question", label: "?", color: "#b58900", assetId: "#emote-question" },
    { key: "exclamation", label: "!", color: "#d97706", assetId: "#emote-exclamation" },
    { key: "cross", label: "✕", color: "#dc2626", assetId: "#emote-cross" },
];

export function EmotePickerUI() {
    const send = (assetId: string) => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(
            new CustomEvent("naf-emote", {
                detail: {
                    src: assetId,
                    durationMs: 3000,
                },
            })
        );
    };

    return (
        <div
            style={{
                position: "fixed",
                right: 16,
                bottom: 16,
                zIndex: 10050,
                display: "flex",
                gap: 8,
                padding: 10,
                borderRadius: 12,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(4px)",
                pointerEvents: "auto",
                userSelect: "none",
            }}
        >
            {EMOTES.map((e) => (
                <button
                    key={e.key}
                    type="button"
                    onClick={() => send(e.assetId)}
                    title={e.key}
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.08)",
                        color: e.color,
                        fontSize: 22,
                        fontWeight: 800,
                        lineHeight: "40px",
                        cursor: "pointer",
                    }}
                >
                    {e.label}
                </button>
            ))}
        </div>
    );
}


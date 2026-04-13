import React from "react";

const ROOM_FALLBACK = "default";
const CHAT_DATA_TYPE = "naf-chat-message";
const MAX_MESSAGES = 60;

const RTC_CONFIG: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type SocketLike = {
    id?: string;
    connected?: boolean;
    emit: (event: string, payload?: any) => void;
    on: (event: string, handler: (...args: any[]) => void) => void;
    off?: (event: string, handler: (...args: any[]) => void) => void;
};

type NafAdapterLike = {
    socket?: SocketLike;
    connectedClients?: string[];
    room?: string;
};

type NetworkState = {
    adapter: NafAdapterLike;
    socket: SocketLike;
    clientId: string;
    room: string;
};

type ChatMessage = {
    id: string;
    senderId: string;
    text: string;
    sentAt: number;
    self: boolean;
};

type VoicePeer = {
    pc: RTCPeerConnection;
    audio?: HTMLAudioElement;
};

type VoiceStatus = "idle" | "starting" | "live" | "error";

export type CommunicationPanelProps = {
    compact?: boolean;
};

function makeMessageId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function shortId(id: string) {
    return id ? id.slice(0, 5) : "peer";
}

function normalizeText(value: unknown) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function shouldInitiateOffer(localId: string, remoteId: string) {
    return localId.localeCompare(remoteId) < 0;
}

function getNafAdapter(): NafAdapterLike | null {
    if (typeof window === "undefined") return null;
    const NAF = (window as any).NAF;
    return NAF?.connection?.adapter || null;
}

export function CommunicationPanel({ compact = false }: CommunicationPanelProps) {
    const [network, setNetwork] = React.useState<NetworkState | null>(null);
    const [messages, setMessages] = React.useState<ChatMessage[]>([]);
    const [draft, setDraft] = React.useState("");
    const [voiceEnabled, setVoiceEnabled] = React.useState(false);
    const [voiceStatus, setVoiceStatus] = React.useState<VoiceStatus>("idle");
    const [voiceError, setVoiceError] = React.useState<string | null>(null);
    const [micMuted, setMicMuted] = React.useState(false);
    const [voicePeerCount, setVoicePeerCount] = React.useState(0);

    const networkRef = React.useRef<NetworkState | null>(null);
    const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
    const localStreamRef = React.useRef<MediaStream | null>(null);
    const voiceEnabledRef = React.useRef(false);
    const peersRef = React.useRef<Record<string, VoicePeer>>({});
    const pendingIceRef = React.useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

    React.useEffect(() => {
        networkRef.current = network;
    }, [network]);

    const refreshPeerCount = React.useCallback(() => {
        setVoicePeerCount(Object.keys(peersRef.current).length);
    }, []);

    const addMessage = React.useCallback((message: ChatMessage) => {
        setMessages((prev) => [...prev, message].slice(-MAX_MESSAGES));
    }, []);

    React.useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ block: "end" });
    }, [messages.length]);

    React.useEffect(() => {
        if (typeof window === "undefined") return;

        const syncNetwork = () => {
            const adapter = getNafAdapter();
            const socket = adapter?.socket;
            const clientId = socket?.id;

            if (!adapter || !socket || !clientId || socket.connected === false) {
                setNetwork((prev) => (prev ? null : prev));
                return;
            }

            const room = typeof adapter.room === "string" ? adapter.room : ROOM_FALLBACK;
            setNetwork((prev) => {
                if (
                    prev &&
                    prev.socket === socket &&
                    prev.clientId === clientId &&
                    prev.room === room
                ) {
                    return prev;
                }
                return { adapter, socket, clientId, room };
            });
        };

        syncNetwork();
        const interval = window.setInterval(syncNetwork, 300);
        window.addEventListener("naf-socketio-adapter-ready", syncNetwork);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener("naf-socketio-adapter-ready", syncNetwork);
        };
    }, []);

    React.useEffect(() => {
        if (!network || typeof window === "undefined") return;

        const NAF = (window as any).NAF;
        let subscribed = false;

        const handler = (senderId: string, _dataType: string, data: any) => {
            const text = normalizeText(data?.text);
            if (!senderId || !text || senderId === network.clientId) return;

            addMessage({
                id: typeof data?.id === "string" ? data.id : makeMessageId(),
                senderId,
                text,
                sentAt: Number(data?.sentAt) || Date.now(),
                self: false,
            });
        };

        const trySubscribe = () => {
            const connection = NAF?.connection;
            if (subscribed || !connection?.subscribeToDataChannel) return;
            try {
                connection.subscribeToDataChannel(CHAT_DATA_TYPE, handler);
                subscribed = true;
            } catch (e) {
                console.warn("NAF chat subscribe failed:", e);
            }
        };

        trySubscribe();
        const interval = window.setInterval(trySubscribe, 300);

        return () => {
            window.clearInterval(interval);
            if (subscribed && NAF?.connection?.unsubscribeToDataChannel) {
                try {
                    NAF.connection.unsubscribeToDataChannel(CHAT_DATA_TYPE);
                } catch (_) {}
            }
        };
    }, [network, addMessage]);

    const closePeer = React.useCallback(
        (remoteId: string) => {
            const peer = peersRef.current[remoteId];
            if (!peer) return;

            peer.pc.onicecandidate = null;
            peer.pc.ontrack = null;
            peer.pc.onconnectionstatechange = null;
            peer.pc.close();

            if (peer.audio) {
                peer.audio.pause();
                peer.audio.srcObject = null;
                peer.audio.remove();
            }

            delete peersRef.current[remoteId];
            pendingIceRef.current.delete(remoteId);
            refreshPeerCount();
        },
        [refreshPeerCount]
    );

    const closeAllPeers = React.useCallback(() => {
        Object.keys(peersRef.current).forEach((remoteId) => closePeer(remoteId));
    }, [closePeer]);

    const attachRemoteAudio = React.useCallback((remoteId: string, stream: MediaStream) => {
        const peer = peersRef.current[remoteId];
        if (!peer) return;

        if (!peer.audio) {
            const audio = document.createElement("audio");
            audio.autoplay = true;
            (audio as any).playsInline = true;
            audio.dataset.voicePeer = remoteId;
            document.body.appendChild(audio);
            peer.audio = audio;
        }

        if (peer.audio.srcObject !== stream) {
            peer.audio.srcObject = stream;
        }

        const playResult = peer.audio.play();
        if (playResult && typeof playResult.catch === "function") {
            playResult.catch(() => {
                setVoiceError("Click Join Voice again if the browser blocks audio playback.");
            });
        }
    }, []);

    const queueOrAddIce = React.useCallback(async (remoteId: string, candidate: RTCIceCandidateInit) => {
        const peer = peersRef.current[remoteId];
        if (!peer) return;

        if (!peer.pc.remoteDescription) {
            const queued = pendingIceRef.current.get(remoteId) || [];
            queued.push(candidate);
            pendingIceRef.current.set(remoteId, queued);
            return;
        }

        try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn("Failed to add voice ICE candidate:", e);
        }
    }, []);

    const flushQueuedIce = React.useCallback(async (remoteId: string) => {
        const peer = peersRef.current[remoteId];
        const queued = pendingIceRef.current.get(remoteId);
        if (!peer || !queued || queued.length === 0) return;

        pendingIceRef.current.delete(remoteId);
        for (const candidate of queued) {
            try {
                await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn("Failed to flush voice ICE candidate:", e);
            }
        }
    }, []);

    const createPeer = React.useCallback(
        (remoteId: string) => {
            const existing = peersRef.current[remoteId];
            if (existing) return existing.pc;

            const networkState = networkRef.current;
            const localStream = localStreamRef.current;
            if (!networkState || !localStream) return null;

            const pc = new RTCPeerConnection(RTC_CONFIG);
            localStream.getAudioTracks().forEach((track) => {
                pc.addTrack(track, localStream);
            });

            peersRef.current[remoteId] = { pc };

            pc.onicecandidate = (event) => {
                if (!event.candidate) return;
                const current = networkRef.current;
                if (!current) return;

                current.socket.emit("voice-ice", {
                    room: current.room,
                    to: remoteId,
                    candidate: event.candidate.toJSON(),
                });
            };

            pc.ontrack = (event) => {
                const stream = event.streams && event.streams[0];
                if (stream) attachRemoteAudio(remoteId, stream);
            };

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === "failed" || pc.connectionState === "closed") {
                    closePeer(remoteId);
                }
            };

            refreshPeerCount();
            return pc;
        },
        [attachRemoteAudio, closePeer, refreshPeerCount]
    );

    const startOffer = React.useCallback(
        async (remoteId: string) => {
            const current = networkRef.current;
            if (!current || remoteId === current.clientId || !voiceEnabledRef.current) return;

            const pc = createPeer(remoteId);
            if (!pc || pc.signalingState !== "stable") return;

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                current.socket.emit("voice-offer", {
                    room: current.room,
                    to: remoteId,
                    sdp: pc.localDescription,
                });
            } catch (e: any) {
                setVoiceStatus("error");
                setVoiceError(e?.message || "Failed to start voice connection.");
            }
        },
        [createPeer]
    );

    const handleVoiceOffer = React.useCallback(
        async (payload: any) => {
            if (!voiceEnabledRef.current) return;

            const from = typeof payload?.from === "string" ? payload.from : "";
            const sdp = payload?.sdp as RTCSessionDescriptionInit | undefined;
            const current = networkRef.current;
            if (!from || !sdp || !current || from === current.clientId) return;

            const pc = createPeer(from);
            if (!pc) return;

            try {
                if (pc.signalingState !== "stable") {
                    try {
                        await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit);
                    } catch (_) {}
                }

                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                await flushQueuedIce(from);

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                current.socket.emit("voice-answer", {
                    room: current.room,
                    to: from,
                    sdp: pc.localDescription,
                });
            } catch (e: any) {
                setVoiceStatus("error");
                setVoiceError(e?.message || "Failed to answer voice connection.");
            }
        },
        [createPeer, flushQueuedIce]
    );

    const handleVoiceAnswer = React.useCallback(
        async (payload: any) => {
            const from = typeof payload?.from === "string" ? payload.from : "";
            const sdp = payload?.sdp as RTCSessionDescriptionInit | undefined;
            const peer = from ? peersRef.current[from] : null;
            if (!peer || !sdp || peer.pc.signalingState !== "have-local-offer") return;

            try {
                await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
                await flushQueuedIce(from);
            } catch (e: any) {
                setVoiceStatus("error");
                setVoiceError(e?.message || "Failed to connect voice answer.");
            }
        },
        [flushQueuedIce]
    );

    const handleVoiceIce = React.useCallback(
        async (payload: any) => {
            if (!voiceEnabledRef.current) return;

            const from = typeof payload?.from === "string" ? payload.from : "";
            const candidate = payload?.candidate as RTCIceCandidateInit | undefined;
            const current = networkRef.current;
            if (!from || !candidate || !current || from === current.clientId) return;

            if (!peersRef.current[from]) {
                createPeer(from);
            }
            await queueOrAddIce(from, candidate);
        },
        [createPeer, queueOrAddIce]
    );

    React.useEffect(() => {
        const socket = network?.socket;
        if (!socket) return;

        const onVoiceUsers = (payload: any) => {
            if (!voiceEnabledRef.current) return;
            const current = networkRef.current;
            if (!current) return;

            const users = Array.isArray(payload?.users) ? payload.users : [];
            users.forEach((remoteId: unknown) => {
                if (typeof remoteId !== "string" || remoteId === current.clientId) return;
                createPeer(remoteId);
                if (shouldInitiateOffer(current.clientId, remoteId)) {
                    startOffer(remoteId);
                }
            });
        };

        const onVoiceUserJoined = (payload: any) => {
            if (!voiceEnabledRef.current) return;
            const current = networkRef.current;
            const remoteId = typeof payload?.id === "string" ? payload.id : "";
            if (!current || !remoteId || remoteId === current.clientId) return;

            createPeer(remoteId);
            if (shouldInitiateOffer(current.clientId, remoteId)) {
                startOffer(remoteId);
            }
        };

        const onVoiceUserLeft = (payload: any) => {
            const remoteId = typeof payload?.id === "string" ? payload.id : "";
            if (remoteId) closePeer(remoteId);
        };

        socket.on("voice-users", onVoiceUsers);
        socket.on("voice-user-joined", onVoiceUserJoined);
        socket.on("voice-user-left", onVoiceUserLeft);
        socket.on("voice-offer", handleVoiceOffer);
        socket.on("voice-answer", handleVoiceAnswer);
        socket.on("voice-ice", handleVoiceIce);

        return () => {
            socket.off?.("voice-users", onVoiceUsers);
            socket.off?.("voice-user-joined", onVoiceUserJoined);
            socket.off?.("voice-user-left", onVoiceUserLeft);
            socket.off?.("voice-offer", handleVoiceOffer);
            socket.off?.("voice-answer", handleVoiceAnswer);
            socket.off?.("voice-ice", handleVoiceIce);
        };
    }, [
        network,
        createPeer,
        startOffer,
        closePeer,
        handleVoiceOffer,
        handleVoiceAnswer,
        handleVoiceIce,
    ]);

    const stopVoice = React.useCallback(
        (notifyServer = true) => {
            const current = networkRef.current;
            if (notifyServer && current) {
                current.socket.emit("voice-ready", {
                    room: current.room,
                    enabled: false,
                });
            }

            localStreamRef.current?.getTracks().forEach((track) => track.stop());
            localStreamRef.current = null;
            voiceEnabledRef.current = false;

            closeAllPeers();
            setVoiceEnabled(false);
            setVoiceStatus("idle");
            setMicMuted(false);
        },
        [closeAllPeers]
    );

    React.useEffect(() => {
        return () => {
            stopVoice(false);
        };
    }, [stopVoice]);

    const startVoice = React.useCallback(async () => {
        const current = networkRef.current;
        if (!current) {
            setVoiceStatus("error");
            setVoiceError("Network is not ready yet.");
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            setVoiceStatus("error");
            setVoiceError("This browser does not support microphone capture.");
            return;
        }

        setVoiceStatus("starting");
        setVoiceError(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: false,
            });

            localStreamRef.current = stream;
            voiceEnabledRef.current = true;
            setVoiceEnabled(true);
            setVoiceStatus("live");
            setMicMuted(false);

            current.socket.emit("voice-ready", {
                room: current.room,
                enabled: true,
            });
        } catch (e: any) {
            localStreamRef.current = null;
            voiceEnabledRef.current = false;
            setVoiceEnabled(false);
            setVoiceStatus("error");
            setVoiceError(e?.message || "Microphone permission was denied.");
        }
    }, []);

    const toggleMute = React.useCallback(() => {
        const nextMuted = !micMuted;
        localStreamRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = !nextMuted;
        });
        setMicMuted(nextMuted);
    }, [micMuted]);

    const submitChat = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const text = normalizeText(draft);
        const current = networkRef.current;
        if (!text || !current) return;

        const payload = {
            id: makeMessageId(),
            text,
            sentAt: Date.now(),
        };

        addMessage({
            ...payload,
            senderId: current.clientId,
            self: true,
        });

        const NAF = (window as any).NAF;
        try {
            NAF?.connection?.broadcastDataGuaranteed?.(CHAT_DATA_TYPE, payload);
        } catch (e) {
            console.warn("NAF chat broadcast failed:", e);
        }

        setDraft("");
    };

    const stopSceneKeys = (event: React.KeyboardEvent) => {
        event.stopPropagation();
    };

    const stopScenePointer = (event: React.PointerEvent) => {
        event.stopPropagation();
    };

    const connected = !!network;
    const statusText = connected ? `Online ${shortId(network.clientId)}` : "Connecting...";
    const voiceText =
        voiceStatus === "starting"
            ? "Starting..."
            : voiceEnabled
            ? "Leave Voice"
            : "Join Voice";

    return (
        <section
            onPointerDown={stopScenePointer}
            style={{
                position: "fixed",
                left: 16,
                bottom: 16,
                zIndex: 10050,
                width: compact ? 280 : 340,
                maxWidth: "calc(100vw - 32px)",
                padding: 10,
                borderRadius: 8,
                background: "rgba(18, 18, 18, 0.78)",
                color: "white",
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                pointerEvents: "auto",
                userSelect: "none",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.24)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 8,
                }}
            >
                <div style={{ fontWeight: 800, fontSize: 14 }}>Chat & Voice</div>
                <div
                    style={{
                        fontSize: 11,
                        color: connected ? "#98f5b0" : "#ffd37a",
                        whiteSpace: "nowrap",
                    }}
                >
                    {statusText}
                </div>
            </div>

            <div
                style={{
                    height: 150,
                    overflowY: "auto",
                    borderRadius: 8,
                    background: "rgba(255, 255, 255, 0.08)",
                    padding: 8,
                    marginBottom: 8,
                }}
            >
                {messages.length === 0 ? (
                    <div style={{ opacity: 0.68, fontSize: 12, lineHeight: 1.45 }}>
                        Type a message for everyone in this room.
                    </div>
                ) : (
                    messages.map((message) => (
                        <div
                            key={`${message.senderId}-${message.id}`}
                            style={{
                                marginBottom: 7,
                                textAlign: message.self ? "right" : "left",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 10,
                                    color: "rgba(255, 255, 255, 0.55)",
                                    marginBottom: 2,
                                }}
                            >
                                {message.self ? "Me" : `User ${shortId(message.senderId)}`}
                            </div>
                            <span
                                style={{
                                    display: "inline-block",
                                    maxWidth: "92%",
                                    overflowWrap: "anywhere",
                                    borderRadius: 8,
                                    padding: "6px 8px",
                                    color: "white",
                                    background: message.self
                                        ? "rgba(28, 126, 214, 0.78)"
                                        : "rgba(255, 255, 255, 0.12)",
                                    fontSize: 13,
                                    lineHeight: 1.35,
                                    textAlign: "left",
                                }}
                            >
                                {message.text}
                            </span>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            <form
                onSubmit={submitChat}
                style={{ display: "flex", gap: 8, marginBottom: 8 }}
            >
                <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={stopSceneKeys}
                    onKeyUp={stopSceneKeys}
                    disabled={!connected}
                    maxLength={240}
                    placeholder={connected ? "Message..." : "Waiting for network"}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        borderRadius: 8,
                        border: "1px solid rgba(255, 255, 255, 0.18)",
                        background: "rgba(255, 255, 255, 0.1)",
                        color: "white",
                        padding: "8px 9px",
                        fontSize: 13,
                        outline: "none",
                    }}
                />
                <button
                    type="submit"
                    disabled={!connected || !normalizeText(draft)}
                    style={{
                        borderRadius: 8,
                        border: "1px solid rgba(255, 255, 255, 0.18)",
                        background:
                            connected && normalizeText(draft)
                                ? "rgba(46, 160, 67, 0.9)"
                                : "rgba(255, 255, 255, 0.08)",
                        color: "white",
                        padding: "8px 12px",
                        fontWeight: 700,
                        cursor: connected ? "pointer" : "default",
                    }}
                >
                    Send
                </button>
            </form>

            <div style={{ display: "flex", gap: 8 }}>
                <button
                    type="button"
                    onClick={voiceEnabled ? () => stopVoice(true) : startVoice}
                    disabled={!connected || voiceStatus === "starting"}
                    style={{
                        flex: 1,
                        borderRadius: 8,
                        border: "1px solid rgba(255, 255, 255, 0.18)",
                        background: voiceEnabled
                            ? "rgba(220, 53, 69, 0.75)"
                            : "rgba(255, 255, 255, 0.1)",
                        color: "white",
                        padding: "8px 10px",
                        fontWeight: 800,
                        cursor: connected ? "pointer" : "default",
                    }}
                >
                    {voiceText}
                </button>
                <button
                    type="button"
                    onClick={toggleMute}
                    disabled={!voiceEnabled}
                    style={{
                        width: 86,
                        borderRadius: 8,
                        border: "1px solid rgba(255, 255, 255, 0.18)",
                        background:
                            voiceEnabled && micMuted
                                ? "rgba(255, 193, 7, 0.75)"
                                : "rgba(255, 255, 255, 0.1)",
                        color: "white",
                        padding: "8px 10px",
                        fontWeight: 700,
                        cursor: voiceEnabled ? "pointer" : "default",
                    }}
                >
                    {micMuted ? "Unmute" : "Mute"}
                </button>
            </div>

            <div
                style={{
                    marginTop: 7,
                    fontSize: 11,
                    color: voiceError ? "#ffb4b4" : "rgba(255, 255, 255, 0.68)",
                    lineHeight: 1.35,
                }}
            >
                {voiceError || `Voice peers: ${voicePeerCount}`}
            </div>
        </section>
    );
}


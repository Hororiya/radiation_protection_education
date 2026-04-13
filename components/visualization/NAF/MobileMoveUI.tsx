import React from "react";

type Mode = "tilt" | "geo";

function isProbablyMobile() {
    if (typeof window === "undefined") return false;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const small = window.matchMedia?.("(max-width: 900px)")?.matches;
    return Boolean(coarse || small);
}

async function requestMotionPermissionIfNeeded() {
    const w = window as any;
    const DeviceOrientationEventAny = w.DeviceOrientationEvent;
    if (DeviceOrientationEventAny?.requestPermission) {
        const res = await DeviceOrientationEventAny.requestPermission();
        if (res !== "granted") throw new Error("DeviceOrientation permission denied");
    }

    const DeviceMotionEventAny = w.DeviceMotionEvent;
    if (DeviceMotionEventAny?.requestPermission) {
        const res = await DeviceMotionEventAny.requestPermission();
        if (res !== "granted") throw new Error("DeviceMotion permission denied");
    }
}

export function MobileMoveUI() {
    const [enabled, setEnabled] = React.useState(false);
    const [mode, setMode] = React.useState<Mode>("tilt");
    const [visible, setVisible] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        setVisible(isProbablyMobile());
    }, []);

    const dispatch = React.useCallback((nextEnabled: boolean, nextMode: Mode) => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(
            new CustomEvent("naf-mobile-move", {
                detail: { enabled: nextEnabled, mode: nextMode },
            })
        );
    }, []);

    const onEnableTilt = async () => {
        setError(null);
        try {
            await requestMotionPermissionIfNeeded();
            setMode("tilt");
            setEnabled(true);
            dispatch(true, "tilt");
        } catch (e: any) {
            setError(e?.message || "Unable to enable sensors.");
        }
    };

    const onEnableGeo = async () => {
        setError(null);
        setMode("geo");
        setEnabled(true);
        dispatch(true, "geo");
    };

    const onDisable = () => {
        setError(null);
        setEnabled(false);
        dispatch(false, mode);
    };

    if (!visible) return null;

    return (
        <div
            style={{
                position: "fixed",
                right: 16,
                bottom: 78,
                zIndex: 10040,
                padding: 10,
                borderRadius: 12,
                background: "rgba(0,0,0,0.55)",
                color: "white",
                fontSize: 12,
                maxWidth: 220,
                pointerEvents: "auto",
                userSelect: "none",
            }}
        >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Mobile Move</div>
            <div style={{ display: "flex", gap: 8 }}>
                <button
                    type="button"
                    onClick={onEnableTilt}
                    style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background:
                            enabled && mode === "tilt"
                                ? "rgba(46,125,50,0.35)"
                                : "rgba(255,255,255,0.08)",
                        color: "white",
                    }}
                >
                    Tilt
                </button>
                <button
                    type="button"
                    onClick={onEnableGeo}
                    style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background:
                            enabled && mode === "geo"
                                ? "rgba(217,119,6,0.35)"
                                : "rgba(255,255,255,0.08)",
                        color: "white",
                    }}
                >
                    GPS
                </button>
            </div>
            <button
                type="button"
                onClick={onDisable}
                disabled={!enabled}
                style={{
                    width: "100%",
                    marginTop: 8,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: enabled
                        ? "rgba(220,38,38,0.35)"
                        : "rgba(255,255,255,0.05)",
                    color: "white",
                    opacity: enabled ? 1 : 0.6,
                }}
            >
                Off
            </button>
            {error ? (
                <div style={{ marginTop: 8, color: "#ffb4b4", lineHeight: 1.3 }}>
                    {error}
                </div>
            ) : (
                <div style={{ marginTop: 8, opacity: 0.8, lineHeight: 1.3 }}>
                    Current:{" "}
                    {enabled ? (mode === "tilt" ? "Tilt control" : "GPS move") : "Disabled"}
                </div>
            )}
        </div>
    );
}


import React from "react";
import { applyBasePath } from "../../../utils";

declare global {
    namespace JSX {
        interface IntrinsicElements {
            "a-entity": any;
            "a-image": any;
        }
    }
}

export type EmoteBillboardProps = {
    /** Image URL (relative to public/ is ok, e.g. "/emotes/smile.svg") */
    src: string;
    /** Position relative to parent entity */
    position?: string;
    /** Size in meters (A-Frame units) */
    width?: number;
    height?: number;
    /** Billboard axis mode */
    axis?: "y" | "all";
    /** CSS selector for target camera (defaults to "#player-camera") */
    target?: string;
    visible?: boolean;
};

function registerBillboardOnce() {
    if (typeof window === "undefined") return;
    const AFRAME = (window as any).AFRAME;
    if (!AFRAME?.registerComponent) return;
    if (AFRAME.components?.billboard) return;

    const THREE = AFRAME.THREE;

    AFRAME.registerComponent("billboard", {
        schema: {
            target: { type: "selector" },
            axis: { default: "y" }, // "y" (yaw-only) or "all"
        },
        tick: function () {
            const el = this.el;
            const obj = el && el.object3D;
            if (!obj) return;

            const sceneEl = el.sceneEl;
            const camObj: any =
                (this.data.target && this.data.target.object3D) ||
                sceneEl?.camera;
            if (!camObj) return;

            const camPos = new THREE.Vector3();
            camObj.getWorldPosition(camPos);

            if (this.data.axis === "y") {
                const elPos = new THREE.Vector3();
                obj.getWorldPosition(elPos);
                camPos.y = elPos.y;
            }

            obj.lookAt(camPos);
        },
    });
}

export function EmoteBillboard({
    src,
    position = "0 0.6 0",
    width = 0.1,
    height = 0.1,
    axis = "y",
    target = "#player-camera",
    visible = true,
}: EmoteBillboardProps) {
    React.useEffect(() => {
        registerBillboardOnce();
    }, []);

    // Use A-Frame primitive <a-image>. Keep shader flat so it looks like UI.
    const resolvedSrc = src.startsWith("#") ? src : applyBasePath(src);
    return (
        <a-image
            src={resolvedSrc}
            position={position}
            width={width}
            height={height}
            visible={visible}
            billboard={`target: ${target}; axis: ${axis}`}
            material="shader: flat; transparent: true; alphaTest: 0.01"
        />
    );
}


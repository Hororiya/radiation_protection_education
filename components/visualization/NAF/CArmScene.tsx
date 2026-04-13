import React, { useEffect, useMemo, useRef, useState } from "react";
import { CArm_Configure } from "../../models/VolumeData/C-Arm/C-Arm_Configure";
import { applyBasePath } from "../../../utils";
import { registerCArmVolumeComponent } from "./CArmVolumeEntity";

// ==========
// Store
import { useStore } from "../../store";
import type { ResultsByName } from "../../../src";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "a-scene": any;
      "a-entity": any;
      "a-image": any;
      "a-camera": any;
      "a-assets": any;
      "a-asset-item": any;
      "a-sky": any;
      "a-cursor": any;
    }
  }
}

// Convert arrays to string "x y z"
const vec3 = (v: number[]) => `${v[0]} ${v[1]} ${v[2]}`;
const deg = (rad: number) => (rad * 180) / Math.PI;
const rot3 = (v: number[]) => `${deg(v[0])} ${deg(v[1])} ${deg(v[2])}`;

const AVATAR_TEMPLATE_ID = "avatar-template-selfmade";
const PLAYER_CAMERA_ID = "player-camera";
const YAW_RIG_COMPONENT = "yaw-rig-from-look-controls";
const GROUND_ALIGN_COMPONENT = "ground-align-once";
const PLAYER_EQUIPMENTS_COMPONENT = "player-equipments";
const CHAT_BUBBLE_COMPONENT = "naf-chat-bubble";

const DOSIMETER_SITES = [
  {
    name: "mixamorigLeftEyeDosimeter",
    displayName: "Left Eye",
    category: "goggle",
    coefficient: 0.1,
    multiplier: 1.0,
  },
  {
    name: "mixamorigRightEyeDosimeter",
    displayName: "Right Eye",
    category: "goggle",
    coefficient: 0.1,
    multiplier: 1.0,
  },
  {
    name: "mixamorigNeckDosimeter",
    displayName: "Neck",
    category: "neck",
    coefficient: 0.1,
    multiplier: 0.9,
  },
  {
    name: "mixamorigSpine1Dosimeter",
    displayName: "Chest",
    category: "apron",
    coefficient: 0.1,
    multiplier: 0.7,
  },
  {
    name: "mixamorigLeftHandDosimeter",
    displayName: "Left Hand",
    category: "glove",
    coefficient: 0.1,
    multiplier: 1.2,
  },
  {
    name: "mixamorigRightHandDosimeter",
    displayName: "Right Hand",
    category: "glove",
    coefficient: 0.1,
    multiplier: 1.2,
  },
] as const;

const CArmScene = () => {
  const cArmRef = useRef<any>(null);
  const playerRigRef = useRef<any>(null);
  const patientGroupRef = useRef<any>(null);

  const [loaded, setLoaded] = useState(false);
  const [isNafReady, setIsNafReady] = useState(false); // adapter + schema ready

  const [set, debug, objectVisibles, equipments] = useStore((state) => [
    state.set,
    state.debug,
    state.sceneStates.objectVisibles,
    state.sceneStates.playerState.equipments,
  ]);
  const [urlDebug, setUrlDebug] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    setUrlDebug(q.get("debug") === "1" || q.get("nafDebug") === "1");
  }, []);
  const showDebug = debug || urlDebug;

  // Models
  const cArmModelSrc = applyBasePath("/models/glb/environments/machine/C-Arm_rough.glb");
  const patientModelSrc = applyBasePath("/models/glb/radiation/x-ray/x-ray_patient.glb");
  const bedModelSrc = applyBasePath("/models/glb/radiation/x-ray/x-ray_bed.glb");
  // Same player model used by `pages/visualization/C-Arm/[type].tsx` (SelfMadePlayer)
  const playerModelSrc = applyBasePath("/models/glb/Self-Made_Player.glb");
  // Base URL for animation state machine GLBs (same as AnimationStates in game/controls)
  const animsBaseUrl = applyBasePath("/models/glb/animations");

  // Config
  const machineGroupWithPatientConfig = CArm_Configure.object3d;
  const cArmConfig = CArm_Configure.object3d.model;
  const patientConfig = CArm_Configure.object3d.patient;
  const volumeConfig = CArm_Configure.volume;
  const volumeNrrdUrl = applyBasePath("/models/nrrd/c-arm/animation/c-arm_accumulate.nrrd");
  const volumeColormapUrl = applyBasePath("/textures/colormap/cm_viridis.png");
  const showVolumeEntity = true;
  // dose 体渲染变换：NAF 中手动摆放正确后的值（与 C-Arm 页视觉一致）
  const volumePosition: [number, number, number] = [-1.7, 2.5, 1.95];
  const volumeRotationDeg: [number, number, number] = [180, -90, 90]; // A-Frame 用度
  const volumeScale = 0.053;
  // 与原始 C-Arm 页一致：Machine & Patient 无父级变换，世界坐标；相机高度 1.6
  const cameraEyeHeight = 1.6;

  const doseSimConfig = useMemo(() => {
    // Rough, fake "distance attenuation" model (µSv per scan)
    return {
      sourceStrengthAt1m: 0.00000018, // µSv at 1m (tune as needed)
      minDistance: 0.25, // meters
      maxDose: 250, // µSv clamp to keep UI stable
      updateIntervalMs: 200,
      epsilon: 0.005,
    };
  }, []);

  useEffect(() => {
    // Ensure A-Frame is loaded? usually handled by import in parent
    setLoaded(true);
  }, []);

  // Listen to UI -> scene emote events (SYNCED via NAF component)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (evt: any) => {
      const nextSrc: string | undefined = evt?.detail?.src;
      const durationMs: number = evt?.detail?.durationMs ?? 3000;
      if (!nextSrc) return;

      const playerEl = playerRigRef.current as any;
      if (!playerEl?.setAttribute) return;

      // Sync "src" and "hideAt" to all clients. Each client hides locally once time passes.
      playerEl.setAttribute("naf-emote", {
        src: nextSrc,
        hideAt: Date.now() + durationMs,
      });
    };

    window.addEventListener("naf-emote", handler as any);
    return () => {
      window.removeEventListener("naf-emote", handler as any);
    };
  }, []);

  // Listen to UI -> scene chat events (SYNCED via NAF component)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (evt: any) => {
      const text: string | undefined = evt?.detail?.text;
      const senderName: string | undefined = evt?.detail?.senderName;
      const durationMs: number = evt?.detail?.durationMs ?? 5000;
      const senderId: string | undefined = evt?.detail?.senderId;
      const nonce: string = String(evt?.detail?.nonce || Date.now());
      if (!text) return;

      const applyBubble = () => {
        let targetEl = playerRigRef.current as any;

        if (senderId && typeof document !== "undefined") {
          const avatars = document.querySelectorAll(".avatar");
          for (let i = 0; i < avatars.length; i++) {
            const el = avatars[i] as any;
            const parent = el.parentEl || el.parentElement;
            const owner =
              el.components?.networked?.data?.owner ??
              parent?.components?.networked?.data?.owner;
            if (owner === senderId) {
              targetEl = el;
              break;
            }
          }
        }

        if (!targetEl?.setAttribute) return false;
        targetEl.setAttribute(CHAT_BUBBLE_COMPONENT, {
          text,
          senderName: String(senderName || ""),
          hideAt: Date.now() + durationMs,
          nonce,
        });
        return true;
      };

      if (applyBubble()) return;

      let tries = 0;
      const retry = window.setInterval(() => {
        if (applyBubble() || ++tries > 20) {
          window.clearInterval(retry);
        }
      }, 100);
    };

    window.addEventListener("naf-chat-bubble", handler as any);
    return () => {
      window.removeEventListener("naf-chat-bubble", handler as any);
    };
  }, []);

  // ==================================================
  // Dosimeter simulation (no precomputed field yet)
  // Uses patient group center as radiation source and inverse-square falloff.
  useEffect(() => {
    if (!loaded) return;

    const intervalId = window.setInterval(() => {
      const playerEl = playerRigRef.current as any;
      const patientEl = patientGroupRef.current as any;
      if (!playerEl?.object3D || !patientEl?.object3D) return;

      const playerPos = playerEl.object3D.position.clone();
      playerEl.object3D.getWorldPosition(playerPos);

      const patientPos = patientEl.object3D.position.clone();
      patientEl.object3D.getWorldPosition(patientPos);

      const dx = playerPos.x - patientPos.x;
      const dy = playerPos.y - patientPos.y;
      const dz = playerPos.z - patientPos.z;
      const dist = Math.max(
        doseSimConfig.minDistance,
        Math.sqrt(dx * dx + dy * dy + dz * dz)
      );

      const invSq = 1 / (dist * dist + doseSimConfig.epsilon);
      const base = doseSimConfig.sourceStrengthAt1m * invSq;

      const results: ResultsByName[] = DOSIMETER_SITES.map((site) => {
        const value = Math.min(doseSimConfig.maxDose, base * site.multiplier);
        return {
          name: site.name,
          displayName: site.displayName,
          category: site.category,
          coefficient: site.coefficient,
          dose: [{ data: value, state: [] }],
        };
      });

      set((state) => ({
        sceneStates: {
          ...state.sceneStates,
          dosimeterResults: results,
        },
      }));
    }, doseSimConfig.updateIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [doseSimConfig, loaded, set]);

  // 在首个 a-scene 创建前劫持 canvas.getContext，使 Three.js 获得 WebGL2 上下文（体渲染 3D 纹理需要）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const AScene = customElements.get("a-scene");
    if (!AScene?.prototype?.setupRenderer) return;
    const proto = AScene.prototype as any;
    if (proto._webgl2PatchApplied) return;
    const origSetupRenderer = proto.setupRenderer;
    proto.setupRenderer = function (this: any) {
      const canvas = this.canvas;
      if (canvas && typeof canvas.getContext === "function" && !canvas._webgl2Patched) {
        canvas._webgl2Patched = true;
        const origGetContext = canvas.getContext.bind(canvas);
        canvas.getContext = function (requestType: string, contextAttributes?: unknown) {
          if (requestType === "webgl" || requestType === "experimental-webgl") {
            return origGetContext("webgl2", contextAttributes) || origGetContext(requestType, contextAttributes);
          }
          return origGetContext(requestType, contextAttributes);
        };
      }
      return origSetupRenderer.call(this);
    };
    proto._webgl2PatchApplied = true;
  }, []);

  useEffect(() => {
    if (!loaded) return;

    registerCArmVolumeComponent();

    // Register an A-Frame component that transfers yaw from camera look-controls
    // to the player entity, so avatar only rotates around Y axis.
    // This keeps camera pitch local (not applied to the avatar / networked rotation).
    if (typeof window !== "undefined") {
      const w = window as any;
      const AFRAME = w.AFRAME;
      if (AFRAME?.registerComponent && !AFRAME.components?.[YAW_RIG_COMPONENT]) {
        AFRAME.registerComponent(YAW_RIG_COMPONENT, {
          schema: {
            camera: { type: "selector" },
          },
          init: function () {
            this._yaw = this.el?.object3D?.rotation?.y || 0;
            this._lastAppliedYaw = this._yaw;
            this._hasAppliedYaw = false;
          },
          _applyYaw: function (yaw: number, force?: boolean) {
            const delta = yaw - this._lastAppliedYaw;
            if (!force && this._hasAppliedYaw && Math.abs(delta) < 0.000001) return;

            this._yaw = yaw;
            this._lastAppliedYaw = yaw;
            this._hasAppliedYaw = true;

            if (this.el?.object3D?.rotation) {
              this.el.object3D.rotation.set(0, yaw, 0);
            }

            this.el.setAttribute("rotation", {
              x: 0,
              y: (yaw * 180) / Math.PI,
              z: 0,
            });
          },
          tick: function () {
            const camEl = this.data && this.data.camera;
            if (!camEl) return;

            const lc = camEl.components && camEl.components["look-controls"];
            // Prefer internal yawObject if available (split yaw/pitch)
            const yawObj = lc && lc.yawObject;
            if (!yawObj) {
              // Fallback: just clamp to yaw from camera rotation
              const y = camEl.object3D?.rotation?.y || 0;
              this._applyYaw(y);
              return;
            }

            // Transfer delta yaw from camera to rig, then zero out camera yaw
            const deltaYaw = yawObj.rotation.y || 0;
            if (Math.abs(deltaYaw) > 0.000001) {
              yawObj.rotation.y = 0;
              this._applyYaw(this._yaw + deltaYaw);
              return;
            }

            if (!this._hasAppliedYaw) {
              this._applyYaw(this._yaw, true);
            }
          },
        });
      }
    }

    // Register player-equipments: sync goggle/neck/apron/glove visibility on avatar GLB (same mesh names as SelfMade_Player)
    if (typeof window !== "undefined") {
      const w = window as any;
      const AFRAME = w.AFRAME;
      if (AFRAME?.registerComponent && !AFRAME.components?.[PLAYER_EQUIPMENTS_COMPONENT]) {
        AFRAME.registerComponent(PLAYER_EQUIPMENTS_COMPONENT, {
          schema: {
            goggle: { type: "boolean", default: false },
            neck: { type: "boolean", default: false },
            apron: { type: "boolean", default: false },
            glove: { type: "boolean", default: false },
          },
          init: function () {
            this._meshes = { goggle: null, neck: null, apron: null, glove: null };
            const gltfEl = this.el.querySelector("[gltf-model]");
            if (!gltfEl) return;
            const onLoaded = () => {
              const obj = gltfEl.object3D;
              if (!obj) return;
              obj.traverse((child: any) => {
                if (!child.isMesh) return;
                const name = (child.name || "").toLowerCase();
                if (name === "equipmentgoggle") this._meshes.goggle = child;
                else if (name === "equipmentneck_guard") this._meshes.neck = child;
                else if (name === "equipmentapron") this._meshes.apron = child;
                else if (name === "equipmentglove") this._meshes.glove = child;
              });
              this._applyVisibility();
            };
            if (gltfEl.object3D && gltfEl.object3D.children && gltfEl.object3D.children.length > 0) onLoaded();
            else gltfEl.addEventListener("model-loaded", onLoaded);
          },
          _applyVisibility: function () {
            const d = this.data;
            if (this._meshes.goggle) this._meshes.goggle.visible = !!d.goggle;
            if (this._meshes.neck) this._meshes.neck.visible = !!d.neck;
            if (this._meshes.apron) this._meshes.apron.visible = !!d.apron;
            if (this._meshes.glove) this._meshes.glove.visible = !!d.glove;
          },
          update: function () {
            this._applyVisibility();
          },
          tick: function () {
            // Re-apply when _meshes get populated after model loads (setAttribute may run before model-loaded)
            this._applyVisibility();
          },
        });
      }
    }

    // Register a synced emote component (applies to child .emote-plane and billboards it)
    if (typeof window !== "undefined") {
      const w = window as any;
      const AFRAME = w.AFRAME;
      if (AFRAME?.registerComponent && !AFRAME.components?.["naf-emote"]) {
        const THREE = AFRAME.THREE;
        AFRAME.registerComponent("naf-emote", {
          schema: {
            src: { type: "string", default: "#emote-check" },
            hideAt: { type: "number", default: 0 },
          },
          init: function () {
            this._plane = null;
          },
          tick: function () {
            const el = this.el;
            if (!el) return;

            // Find the emote plane created in the avatar template.
            if (!this._plane) {
              this._plane = el.querySelector(".emote-plane");
              if (!this._plane) return;
            }

            const now = Date.now();
            const show = now < (this.data.hideAt || 0);
            this._plane.setAttribute("visible", show);

            if (show) {
              this._plane.setAttribute("src", this.data.src);

              // Billboard: always face local camera
              const sceneEl = el.sceneEl;
              const camObj: any = sceneEl?.camera;
              if (!camObj || !this._plane.object3D) return;

              const camPos = new THREE.Vector3();
              camObj.getWorldPosition(camPos);
              this._plane.object3D.lookAt(camPos);
            }
          },
        });
      }
    }

    // Register a synced chat bubble component. Text is rendered to a canvas texture
    // so CJK glyphs can use browser/system fonts instead of A-Frame's limited SDF font.
    if (typeof window !== "undefined") {
      const w = window as any;
      const AFRAME = w.AFRAME;
      if (AFRAME?.registerComponent && !AFRAME.components?.[CHAT_BUBBLE_COMPONENT]) {
        const THREE = AFRAME.THREE;
        AFRAME.registerComponent(CHAT_BUBBLE_COMPONENT, {
          schema: {
            text: { type: "string", default: "" },
            senderName: { type: "string", default: "" },
            hideAt: { type: "number", default: 0 },
            nonce: { type: "string", default: "" },
          },
          init: function () {
            this._bubble = null;
            this._plane = null;
            this._canvas = document.createElement("canvas");
            this._ctx = this._canvas.getContext("2d");
            this._texture = null;
            this._material = null;
            this._lastText = "";
            this._lastRenderKey = "";
            this._dirty = true;
          },
          update: function () {
            this._dirty = true;
          },
          _ensureParts: function () {
            if (this._bubble && document.body.contains(this._bubble)) return true;
            this._bubble = this.el.querySelector(".chat-bubble");
            if (!this._bubble) return false;
            this._plane = this._bubble.querySelector(".chat-bubble-plane");
            this._dirty = true;
            return true;
          },
          _formatText: function (raw: string) {
            const trimmed = String(raw || "").replace(/\s+/g, " ").trim();
            return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
          },
          _wrapText: function (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
            const lines: string[] = [];
            let line = "";

            const pushLine = () => {
              if (line) lines.push(line);
              line = "";
            };

            for (let i = 0; i < text.length; i++) {
              const char = text[i];
              if (char === "\n") {
                pushLine();
                continue;
              }

              const next = line + char;
              if (ctx.measureText(next).width <= maxWidth || !line) {
                line = next;
              } else {
                pushLine();
                line = char;
              }
            }
            pushLine();
            return lines.slice(0, 4);
          },
          _drawRoundedRect: function (
            ctx: CanvasRenderingContext2D,
            x: number,
            y: number,
            width: number,
            height: number,
            radius: number
          ) {
            const r = Math.min(radius, width / 2, height / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + width - r, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + r);
            ctx.lineTo(x + width, y + height - r);
            ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
            ctx.lineTo(x + r, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
          },
          _renderBubbleTexture: function (text: string, senderName: string) {
            if (!this._ctx || !this._plane) return false;

            const ctx = this._ctx as CanvasRenderingContext2D;
            const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
            const nameFontSize = 24;
            const fontSize = 36;
            const nameLineHeight = senderName ? 32 : 0;
            const lineHeight = 48;
            const paddingX = 34;
            const paddingY = 26;
            const tailHeight = 26;
            const maxTextWidth = 560;
            const fontFamily =
              '"Noto Sans CJK JP", "Noto Sans CJK SC", "Yu Gothic", "Meiryo", "Microsoft YaHei", "PingFang SC", "Hiragino Sans", sans-serif';

            ctx.font = `700 ${fontSize}px ${fontFamily}`;
            const lines = this._wrapText(ctx, text, maxTextWidth);
            ctx.font = `800 ${nameFontSize}px ${fontFamily}`;
            const measuredNameWidth = senderName ? ctx.measureText(senderName).width : 0;
            ctx.font = `700 ${fontSize}px ${fontFamily}`;
            const measuredWidth = Math.max(
              80,
              measuredNameWidth,
              ...lines.map((line: string) => ctx.measureText(line).width)
            );

            const logicalWidth = Math.ceil(Math.min(maxTextWidth, measuredWidth) + paddingX * 2);
            const logicalHeight = Math.ceil(
              nameLineHeight + lines.length * lineHeight + paddingY * 2 + tailHeight
            );
            const rectHeight = logicalHeight - tailHeight;

            this._canvas.width = Math.ceil(logicalWidth * dpr);
            this._canvas.height = Math.ceil(logicalHeight * dpr);
            this._canvas.style.width = `${logicalWidth}px`;
            this._canvas.style.height = `${logicalHeight}px`;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, logicalWidth, logicalHeight);
            ctx.font = `700 ${fontSize}px ${fontFamily}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 5;
            ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
            this._drawRoundedRect(ctx, 4, 4, logicalWidth - 8, rectHeight - 8, 30);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(logicalWidth / 2 - 18, rectHeight - 7);
            ctx.lineTo(logicalWidth / 2, logicalHeight - 4);
            ctx.lineTo(logicalWidth / 2 + 18, rectHeight - 7);
            ctx.closePath();
            ctx.fill();

            ctx.shadowColor = "transparent";
            ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
            ctx.lineWidth = 2;
            this._drawRoundedRect(ctx, 4, 4, logicalWidth - 8, rectHeight - 8, 30);
            ctx.stroke();

            let textStartY = paddingY;
            if (senderName) {
              ctx.font = `800 ${nameFontSize}px ${fontFamily}`;
              ctx.fillStyle = "#2f6f9f";
              ctx.fillText(senderName, logicalWidth / 2, paddingY + nameFontSize / 2);
              textStartY += nameLineHeight;
            }

            ctx.font = `700 ${fontSize}px ${fontFamily}`;
            ctx.fillStyle = "#111111";
            lines.forEach((line: string, index: number) => {
              const y =
                textStartY +
                lineHeight / 2 +
                index * lineHeight +
                Math.max(
                  0,
                  (rectHeight - paddingY * 2 - nameLineHeight - lines.length * lineHeight) / 2
                );
              ctx.fillText(line, logicalWidth / 2, y);
            });

            if (this._texture) this._texture.dispose();
            this._texture = new THREE.CanvasTexture(this._canvas);
            this._texture.minFilter = THREE.LinearFilter;
            this._texture.magFilter = THREE.LinearFilter;
            this._texture.needsUpdate = true;

            const mesh = this._plane.getObject3D("mesh");
            if (mesh) {
              if (!this._material) {
                this._material = new THREE.MeshBasicMaterial({
                  map: this._texture,
                  transparent: true,
                  depthWrite: false,
                });
              }
              this._material.map = this._texture;
              this._material.needsUpdate = true;
              mesh.material = this._material;
            }

            const worldWidth = Math.min(2.2, Math.max(0.8, logicalWidth / 340));
            const worldHeight = worldWidth * (logicalHeight / logicalWidth);
            this._plane.setAttribute("width", worldWidth);
            this._plane.setAttribute("height", worldHeight);
            return !!mesh;
          },
          tick: function () {
            if (!this._ensureParts()) return;

            const text = this._formatText(this.data.text);
            const senderName = this._formatText(this.data.senderName).slice(0, 24);
            const show = !!text && Date.now() < (this.data.hideAt || 0);
            this._bubble.setAttribute("visible", show);
            if (!show) return;

            const renderKey = `${this.data.nonce || ""}|${senderName}|${text}`;
            if (this._dirty || renderKey !== this._lastRenderKey || !this._material) {
              this._lastText = text;
              if (this._renderBubbleTexture(text, senderName)) {
                this._lastRenderKey = renderKey;
                this._dirty = false;
              }
            }

            const sceneEl = this.el.sceneEl;
            const camObj: any = sceneEl?.camera;
            if (!camObj || !this._bubble.object3D) return;

            const camPos = new THREE.Vector3();
            camObj.getWorldPosition(camPos);
            this._bubble.object3D.lookAt(camPos);
          },
        });
      }
    }

    // Register an A-Frame component that aligns an entity's bounding box to ground (y=0) once.
    if (typeof window !== "undefined") {
      const w = window as any;
      const AFRAME = w.AFRAME;
      if (AFRAME?.registerComponent && !AFRAME.components?.[GROUND_ALIGN_COMPONENT]) {
        const THREE = AFRAME.THREE;
        AFRAME.registerComponent(GROUND_ALIGN_COMPONENT, {
          schema: {
            targetY: { type: "number", default: 0 },
          },
          init: function () {
            this._aligned = false;
          },
          tick: function () {
            if (this._aligned) return;
            const obj = this.el && this.el.object3D;
            if (!obj) return;

            // Wait until something actually loaded into the object3D tree
            if (!obj.children || obj.children.length === 0) return;

            const box = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3();
            box.getSize(size);

            // If box is empty / not ready yet, try later
            if (!isFinite(box.min.y) || size.length() < 0.001) return;

            // Shift so that the lowest point touches targetY (usually 0)
            const delta = this.data.targetY - box.min.y;
            obj.position.y += delta;
            this._aligned = true;
          },
        });
      }
    }

    const tryInitNaf = () => {
      if (typeof window === "undefined") return;
      const w = window as any;
      const NAF = w.NAF;
      if (!NAF?.schemas?.add) return;

      // Wait until our socketio adapter is registered
      if (!w.__NAF_SOCKETIO_ADAPTER_READY__) return;

      try {
        // Avoid spamming schemas.add across renders (per template id)
        const schemaFlag = `__NAF_AVATAR_SCHEMA_REGISTERED__${AVATAR_TEMPLATE_ID}`;
        if (!w[schemaFlag]) {
          NAF.schemas.add({
            template: `#${AVATAR_TEMPLATE_ID}`,
            components: [
              "position",
              "rotation",
              "naf-emote",
              PLAYER_EQUIPMENTS_COMPONENT,
            ],
          });
          w[schemaFlag] = true;
        }
        setIsNafReady(true);
      } catch (e) {
        console.error("NAF: Error registering schema:", e);
      }
    };

    tryInitNaf();
    const interval = setInterval(tryInitNaf, 100);
    const onAdapterReady = () => tryInitNaf();
    window.addEventListener("naf-socketio-adapter-ready", onAdapterReady);

    return () => {
      clearInterval(interval);
      window.removeEventListener("naf-socketio-adapter-ready", onAdapterReady);
    };
  }, [loaded]);

  const NAF_PLAYER_EQUIPMENTS_TYPE = "player-equipments";

  // Apply equipments to an avatar entity (the .avatar element that has or is under [networked])
  const applyEquipmentsToAvatarEl = React.useCallback((avatarEl: any, eq: { goggle?: boolean; neck?: boolean; apron?: boolean; glove?: boolean }) => {
    if (!avatarEl?.setAttribute || !eq || typeof eq !== "object") return;
    avatarEl.setAttribute(PLAYER_EQUIPMENTS_COMPONENT, {
      goggle: !!eq.goggle,
      neck: !!eq.neck,
      apron: !!eq.apron,
      glove: !!eq.glove,
    });
  }, []);

  // Find avatar element that belongs to ownerId (networked on self for remote, on parent for local #player)
  const findAvatarByOwner = React.useCallback((ownerId: string): any => {
    if (typeof document === "undefined") return null;
    const avatars = document.querySelectorAll(".avatar");
    for (let i = 0; i < avatars.length; i++) {
      const el = avatars[i] as any;
      const parent = el.parentEl || el.parentElement;
      const owner = el.components?.networked?.data?.owner ?? parent?.components?.networked?.data?.owner;
      if (owner === ownerId) return el;
    }
    return null;
  }, []);

  // Sync store Player/Equipments to local #player avatar and broadcast so remote clients apply it
  // Poll until #player .avatar exists (NAF may attach template after scene is ready)
  useEffect(() => {
    if (!loaded || !isNafReady || typeof document === "undefined") return;
    const payload = {
      goggle: equipments.goggle,
      neck: equipments.neck,
      apron: equipments.apron,
      glove: equipments.glove,
    };

    const applyLocal = () => {
      const playerEl = document.querySelector("#player");
      const avatarEl = playerEl?.querySelector(".avatar") as any;
      if (avatarEl?.setAttribute) {
        applyEquipmentsToAvatarEl(avatarEl, payload);
        return true;
      }
      return false;
    };

    if (!applyLocal()) {
      const tries = 50; // ~5s at 100ms
      let count = 0;
      const interval = setInterval(() => {
        if (applyLocal() || ++count >= tries) clearInterval(interval);
      }, 100);
      return () => clearInterval(interval);
    }

    const w = window as any;
    const NAF = w.NAF;
    if (NAF?.connection?.broadcastDataGuaranteed) {
      try {
        NAF.connection.broadcastDataGuaranteed(NAF_PLAYER_EQUIPMENTS_TYPE, { equipments: payload });
      } catch (_) {}
    }
  }, [loaded, isNafReady, equipments.goggle, equipments.neck, equipments.apron, equipments.glove, applyEquipmentsToAvatarEl]);

  // Pending remote equipments: apply when entity appears (NAF may deliver before remote avatar exists)
  const pendingEquipmentsRef = React.useRef<Map<string, Record<string, boolean>>>(new Map());

  // Subscribe to player-equipments: apply to remote avatar for senderId
  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    const w = window as any;
    const NAF = w.NAF;

    const handler = (senderId: string, _dataType: string, data: any) => {
      const eq = data?.equipments;
      if (!eq || typeof eq !== "object") return;
      const payload = {
        goggle: !!eq.goggle,
        neck: !!eq.neck,
        apron: !!eq.apron,
        glove: !!eq.glove,
      };
      pendingEquipmentsRef.current.set(senderId, payload);
      const avatarEl = findAvatarByOwner(senderId);
      if (avatarEl) applyEquipmentsToAvatarEl(avatarEl, payload);
    };

    let subscribed = false;
    const trySubscribe = () => {
      if (subscribed || !NAF?.connection?.subscribeToDataChannel) return;
      try {
        NAF.connection.subscribeToDataChannel(NAF_PLAYER_EQUIPMENTS_TYPE, handler);
        subscribed = true;
      } catch (e) {
        console.warn("NAF subscribe player-equipments failed:", e);
      }
    };
    trySubscribe();
    const interval = setInterval(trySubscribe, 200);

    // Retry applying pending equipments (in case remote avatar was created after broadcast)
    const retryInterval = setInterval(() => {
      const pending = pendingEquipmentsRef.current;
      if (pending.size === 0) return;
      pending.forEach((payload, senderId) => {
        const avatarEl = findAvatarByOwner(senderId);
        if (avatarEl) applyEquipmentsToAvatarEl(avatarEl, payload);
      });
    }, 500);

    return () => {
      clearInterval(interval);
      clearInterval(retryInterval);
      if (subscribed && NAF?.connection?.unsubscribeToDataChannel) {
        try {
          NAF.connection.unsubscribeToDataChannel(NAF_PLAYER_EQUIPMENTS_TYPE);
        } catch (_) {}
      }
    };
  }, [loaded, findAvatarByOwner, applyEquipmentsToAvatarEl]);

  useEffect(() => {
    const el = cArmRef.current;
    if (!el) return;

    const onModelLoaded = (evt: any) => {
      const mesh = el.getObject3D("mesh");
      if (!mesh) return;
      
      const updateBones = () => {
         const rollBone = mesh.getObjectByName("ArmRoll");
         if (rollBone) {
             rollBone.position.y = cArmConfig.height; 
             rollBone.rotation.y = cArmConfig.roll;
         }
         const pitchBone = mesh.getObjectByName("ArmPitch");
         if (pitchBone) {
             pitchBone.rotation.x = cArmConfig.pitch;
         }
      };

      updateBones();
    };

    el.addEventListener("model-loaded", onModelLoaded);
    return () => {
      el.removeEventListener("model-loaded", onModelLoaded);
    };
  }, [loaded]);
  const [startPos] = useState(() => {
      // Spawn near the machine/patient group, but not at the exact center.
      // Use a random point in an annulus (ring) around the scene center.
      const centerX = machineGroupWithPatientConfig.position[0];
      const centerZ = machineGroupWithPatientConfig.position[2];

      const minR = 1.2;
      const maxR = 2.5;
      const r = minR + Math.random() * (maxR - minR);
      const theta = Math.random() * Math.PI * 2;

      const x = centerX + Math.cos(theta) * r;
      const z = centerZ + Math.sin(theta) * r;

      // Player rig walks on ground plane (y=0). Camera is offset to eye level.
      return `${x.toFixed(3)} 0 ${z.toFixed(3)}`;
  });

  /* New State for Server URL */
  const [serverUrl, setServerUrl] = useState<string>("");
  const [entities, setEntities] = useState<{id: string, pos: string}[]>([]);
  const [animationDebug, setAnimationDebug] = useState<{
    position: { x: number; y: number; z: number };
    prevPos: { x: number; y: number; z: number };
    velocity: { x: number; z: number };
    speed: number;
    moveSum: number;
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    tickCount: number;
    mixerReady?: boolean;
    source?: string;
    _msg?: string;
    _error?: string;
  } | null>(null);
  const prevPosRef = React.useRef<{ x: number; y: number; z: number } | null>(null);
  const lastTimeRef = React.useRef<number>(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const override = params.get("naf") || params.get("nafServer");
      const hostname = window.location.hostname;
      const port = "8080";

      if (override) {
        // allow: http(s)://host:port  OR  host:port
        setServerUrl(override.startsWith("http") ? override : `${window.location.protocol}//${override}`);
        return;
      }

      const protocol = window.location.protocol === "http:" || window.location.protocol === "https:"
        ? window.location.protocol
        : "http:";
      
      if (window.location.protocol === "https:") {
        setServerUrl(`https://mt6ldb3b-8080.asse.devtunnels.ms/`);
      } else {
        setServerUrl(`${protocol}//${hostname}:${port}`);
      }
    }
  }, []);

  // Track entities for Debug UI
  useEffect(() => {
      if (!showDebug) return;
      const interval = setInterval(() => {
          // Only scan if NAF is ready
          if (!document.querySelector('a-scene')) return;

          const els = document.querySelectorAll('.avatar');
          const list: {id: string, pos: string}[] = [];
          els.forEach((el: any) => {
              // Ignore local player if needed, or include it. 
              // NAF remote entities usually don't have an ID unless set, or use NAF generated ID.
              // Local player has id="player" but inner avatar might strictly be class="avatar" depending on template.
              // Our template has class="avatar".
              
              // NAF adds 'networked' component.
              const networked = el.components && el.components.networked;
              const owner = networked ? networked.data.owner : (el.id === "player" ? "ME" : "Unknown");
              const pos = el.object3D ? el.object3D.position : {x:0, y:0, z:0};
              
              list.push({
                  id: owner,
                  pos: `${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`
              });
          });
          setEntities(list);
      }, 500);
      return () => clearInterval(interval);
  }, [showDebug]);

  // Poll #player position/velocity for debug (direct from scene)
  const zeroPos = { x: 0, y: 0, z: 0 };
  const zeroVel = { x: 0, z: 0 };
  useEffect(() => {
    if (!showDebug) return;
    const interval = setInterval(() => {
      const data = (window as any).__avatarAnimationDebug;
      if (data) {
        setAnimationDebug({
          position: data.position || zeroPos,
          prevPos: data.prevPos || zeroPos,
          velocity: data.velocity || zeroVel,
          speed: data.speed ?? 0,
          moveSum: data.moveSum ?? 0,
          forward: !!data.forward,
          backward: !!data.backward,
          left: !!data.left,
          right: !!data.right,
          tickCount: data.tickCount ?? 0,
          mixerReady: data.mixerReady,
          source: "component",
          _msg: data._msg,
          _error: data._error,
        });
        return;
      }
      const player = typeof document !== "undefined" ? document.querySelector("#player") : null;
      const el = player as any;
      if (!player) {
        setAnimationDebug({
          position: zeroPos,
          prevPos: zeroPos,
          velocity: zeroVel,
          speed: 0,
          moveSum: 0,
          forward: false,
          backward: false,
          left: false,
          right: false,
          tickCount: 0,
          mixerReady: false,
          source: "scene",
          _msg: " #player not found (wait for a-scene to mount or NAF Ready)",
        });
        return;
      }
      if (!el?.object3D?.position) {
        setAnimationDebug({
          position: zeroPos,
          prevPos: zeroPos,
          velocity: zeroVel,
          speed: 0,
          moveSum: 0,
          forward: false,
          backward: false,
          left: false,
          right: false,
          tickCount: 0,
          mixerReady: false,
          source: "scene",
          _msg: "player found, object3D not ready",
        });
        return;
      }
      const pos = el.object3D.position;
      const now = Date.now() / 1000;
      const px = pos.x;
      const py = pos.y;
      const pz = pos.z;
      const prev = prevPosRef.current;
      const lastT = lastTimeRef.current;
      if (prev !== null && lastT > 0 && now > lastT) {
        const d = now - lastT;
        const vx = (px - prev.x) / d;
        const vz = (pz - prev.z) / d;
        const speed = Math.sqrt(vx * vx + vz * vz);
        const thresh = 0.001;
        let forward = false;
        let backward = false;
        let left = false;
        let right = false;
        if (speed > thresh) {
          const THREE = (window as any).AFRAME?.THREE;
          const camEl = document.querySelector("#player-camera") as any;
          if (THREE && camEl?.object3D) {
            const q = new THREE.Quaternion();
            camEl.object3D.getWorldQuaternion(q);
            const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
            fwd.y = 0;
            if (fwd.lengthSq() > 1e-12) fwd.normalize();
            const rt = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
            rt.y = 0;
            if (rt.lengthSq() > 1e-12) rt.normalize();
            const fAmount = vx * fwd.x + vz * fwd.z;
            const rAmount = vx * rt.x + vz * rt.z;
            forward = fAmount > 0;
            backward = fAmount < 0;
            left = rAmount < 0;
            right = rAmount > 0;
          }
        }
        const moveSum = (forward ? 1 : 0) + (backward ? 1 : 0) + (left ? 1 : 0) + (right ? 1 : 0);
        setAnimationDebug({
          position: { x: px, y: py, z: pz },
          prevPos: { x: prev.x, y: prev.y, z: prev.z },
          velocity: { x: vx, z: vz },
          speed,
          moveSum,
          forward,
          backward,
          left,
          right,
          tickCount: 0,
          mixerReady: false,
          source: "scene",
        });
      } else {
        setAnimationDebug({
          position: { x: px, y: py, z: pz },
          prevPos: { x: px, y: py, z: pz },
          velocity: { x: 0, z: 0 },
          speed: 0,
          moveSum: 0,
          forward: false,
          backward: false,
          left: false,
          right: false,
          tickCount: 0,
          mixerReady: false,
          source: "scene",
        });
      }
      prevPosRef.current = { x: px, y: py, z: pz };
      lastTimeRef.current = now;
    }, 100);
    return () => clearInterval(interval);
  }, [showDebug]);

  if (!loaded) return <div>Loading...</div>;

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      {/* Avatar template must exist before NAF components initialize */}
      <template
        id={AVATAR_TEMPLATE_ID}
        dangerouslySetInnerHTML={{
          __html: `
            <a-entity class="avatar" avatar-animation-state-machine="animsBaseUrl: ${animsBaseUrl}" player-equipments="goggle: true; neck: true; apron: true; glove: true">
              <a-image
                class="emote-plane"
                src="#emote-check"
                position="0 ${cameraEyeHeight + 0.5} 0"
                width="0.5"
                height="0.5"
                visible="false"
                material="shader: flat; transparent: true; alphaTest: 0.01"
              ></a-image>
              <a-entity
                class="chat-bubble"
                position="0 ${cameraEyeHeight + 0.95} 0"
                visible="false"
              >
                <a-plane
                  class="chat-bubble-plane"
                  width="1.1"
                  height="0.45"
                  material="shader: flat; transparent: true; opacity: 1"
                ></a-plane>
              </a-entity>
              <!-- Render the same GLB as SelfMadePlayer (three.js scene) -->
              <!-- Player root is at eye-level (y=1.6), so offset model down to ground -->
              <a-entity
                gltf-model="#player-model"
                position="0 0 0"
                rotation="0 180 0"
                scale="1 1 1"
              ></a-entity>
            </a-entity>
          `,
        }}
      ></template>

      {/* Debug HUD: open ?debug=1 or ?nafDebug=1 to show */}
      {showDebug && (
        <div style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          zIndex: 9999,
          background: "rgba(0,0,0,0.7)",
          color: "#0f0",
          padding: "10px",
          fontFamily: "monospace",
          pointerEvents: "none", // allow clicking through
          maxWidth: "300px"
        }}>
          <div style={{ fontWeight: "bold", borderBottom: "1px solid #0f0", marginBottom: "5px" }}>NAF Debugger</div>
          <div>Server: {serverUrl}</div>
          <div>Status: {isNafReady ? "Ready" : "Init..."}</div>
          <div style={{ marginTop: "5px", borderTop: "1px solid #333", paddingTop: "5px" }}>
              <div>Entities ({entities.length}):</div>
              {entities.map((e, i) => (
                  <div key={i} style={{ fontSize: "0.8em", paddingLeft: "5px" }}>
                      [{e.id}]: {e.pos}
                  </div>
              ))}
          </div>
          <div style={{ marginTop: "8px", borderTop: "1px solid #333", paddingTop: "8px", fontSize: "0.85em" }}>
            <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Animation (local)</div>
            {animationDebug ? (
              <>
                {animationDebug._msg && <div style={{ color: "#fa0", marginBottom: "4px" }}>{animationDebug._msg}</div>}
                {animationDebug._error && <div style={{ color: "#f55", marginBottom: "4px" }}>错误: {animationDebug._error}</div>}
                {animationDebug.mixerReady === false && !animationDebug._msg && <div style={{ color: "#fa0" }}>mixer 未就绪</div>}
                <div>pos: {animationDebug.position.x.toFixed(3)}, {animationDebug.position.y.toFixed(3)}, {animationDebug.position.z.toFixed(3)}</div>
                <div>prev: {animationDebug.prevPos.x.toFixed(3)}, {animationDebug.prevPos.y.toFixed(3)}, {animationDebug.prevPos.z.toFixed(3)}</div>
                <div>vel: {animationDebug.velocity.x.toFixed(3)}, {animationDebug.velocity.z.toFixed(3)}</div>
                <div>speed: {animationDebug.speed.toFixed(4)} · moveSum: {animationDebug.moveSum}</div>
                <div>f/b/l/r: {String(animationDebug.forward)}/{String(animationDebug.backward)}/{String(animationDebug.left)}/{String(animationDebug.right)}</div>
                <div>tick: {animationDebug.tickCount}</div>
                {animationDebug.source && <div style={{ color: "#888", fontSize: "0.75em" }}>来源: {animationDebug.source}</div>}
              </>
            ) : (
              <div style={{ color: "#888" }}> No DATA!</div>
            )}
          </div>
        </div>
      )}

       {serverUrl && isNafReady && (
          <a-scene 
            embedded 
            stats
            renderer="colorManagement: true;" 
            networked-scene={`serverURL: ${serverUrl}; app: radiation-protection; room: default; adapter: socketio; audio: false; debug: true;`}
            avatar-animation-driver={`animsBaseUrl: ${animsBaseUrl}`}
          >
            <a-assets>
              <a-asset-item id="c-arm-model" src={cArmModelSrc}></a-asset-item>
              <a-asset-item id="patient-model" src={patientModelSrc}></a-asset-item>
              <a-asset-item id="bed-model" src={bedModelSrc}></a-asset-item>
              <a-asset-item id="player-model" src={playerModelSrc}></a-asset-item>
              {/* Emote textures */}
              <img id="emote-check" src={applyBasePath("/emotes/check.svg")} />
              <img id="emote-question" src={applyBasePath("/emotes/question.svg")} />
              <img id="emote-exclamation" src={applyBasePath("/emotes/exclamation.svg")} />
              <img id="emote-cross" src={applyBasePath("/emotes/cross.svg")} />
            </a-assets>
    
            <a-sky color="#ECECEC"></a-sky>

            {/* Ground plane */}
            <a-entity
              visible={objectVisibles.grid}
              geometry="primitive: plane; width: 50; height: 50"
              rotation="-90 0 0"
              position="0 0 0"
              material="shader: standard; color: #9aa0a6; metalness: 0; roughness: 0.9"
            ></a-entity>

            {/* Networked Player (Parent Entity with Controls) */}
            {/* We attach template to local so you can see your own avatar */}
            <a-entity
                id="player"
                ref={playerRigRef}
                networked={`template:#${AVATAR_TEMPLATE_ID};attachTemplateToLocal:true;`}
                {...({ [YAW_RIG_COMPONENT]: `camera: #${PLAYER_CAMERA_ID}` } as any)}
                position={startPos}
                rotation="0 0 0"
                wasd-controls="fly: false; acceleration: 4"
                naf-emote="src: #emote-check; hideAt: 0"
                naf-chat-bubble="text: ; senderName: ; hideAt: 0"
                visible={objectVisibles.player}
            >
                 {/* Camera handles view pitch (and temporary yaw, transferred to rig) */}
                 <a-camera 
                    id={PLAYER_CAMERA_ID}
                    position={`0 ${cameraEyeHeight} 0`}
                    look-controls="pointerLockEnabled: true"
                    wasd-controls-enabled="false"
                 ></a-camera>
            </a-entity>
            
            {/* Volume entity: 使用 NAF 中手动摆放正确后的 dose 变换 */}
            {showVolumeEntity && (
              <a-entity
                {...({ "c-arm-volume": `nrrdUrl: ${volumeNrrdUrl}; colormapUrl: ${volumeColormapUrl}; clim2: ${volumeConfig.clim2.accumulate}; isPerspective: true` } as any)}
                position={vec3(volumePosition)}
                rotation={`${volumeRotationDeg[0]} ${volumeRotationDeg[1]} ${volumeRotationDeg[2]}`}
                scale={`${volumeScale} ${volumeScale} ${volumeScale}`}
                visible={objectVisibles.dose}
              ></a-entity>
            )}

            {/* Machine & Patient：与原始 C-Arm 页一致，无父级 position/rotation/scale，Patient 与 C-Arm 为同级世界坐标 */}
            <a-entity
                {...({ [GROUND_ALIGN_COMPONENT]: "targetY: 0" } as any)}
                position="0 0 0"
                rotation="0 0 0"
                scale="1 1 1"
                visible={objectVisibles.object3d}
            >
                {/* C-Arm machine：世界坐标 object3d.model */}
                <a-entity
                    ref={cArmRef}
                    gltf-model={cArmModelSrc}
                    position={vec3(cArmConfig.position)}
                    rotation={rot3(cArmConfig.rotation)}
                    scale={`${cArmConfig.scale} ${cArmConfig.scale} ${cArmConfig.scale}`}
                ></a-entity>
                {/* Patient：世界坐标 object3d.patient */}
                <a-entity
                    ref={patientGroupRef}
                    position={vec3(patientConfig.position)}
                    rotation={rot3(patientConfig.rotation)}
                    scale={`${patientConfig.scale} ${patientConfig.scale} ${patientConfig.scale}`}
                >
                    <a-entity gltf-model={bedModelSrc}></a-entity>
                    <a-entity gltf-model={patientModelSrc}></a-entity>
                </a-entity>
            </a-entity>
    
          </a-scene>
      )}
    </div>
  );
};

export default CArmScene;

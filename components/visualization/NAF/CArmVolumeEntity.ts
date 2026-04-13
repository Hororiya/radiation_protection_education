/**
 * A-Frame 体渲染组件：完全使用 AFRAME.THREE 实现，与 A-Frame 场景共用同一 WebGL 上下文。
 * 加载 NRRD 体积数据，用 MIP 体渲染 shader 显示，与 pages/visualization/C-Arm 视觉效果一致。
 */

import { NRRDLoader } from "three-stdlib";
import type { Volume } from "three-stdlib";
import { VOLUME_VERTEX_SHADER, VOLUME_FRAGMENT_SHADER } from "./volumeShaderNoClip";

const COMPONENT_NAME = "c-arm-volume";

export type CArmVolumeSchema = {
  nrrdUrl: { type: "string"; default: "" };
  colormapUrl: { type: "string"; default: "" };
  clim2: { type: "number"; default: 5e-6 };
  isPerspective: { type: "boolean"; default: true };
};

export function registerCArmVolumeComponent(): void {
  if (typeof window === "undefined") return;
  const w = window as any;
  const AFRAME = w.AFRAME;
  if (!AFRAME?.registerComponent) return;
  if (AFRAME.components?.[COMPONENT_NAME]) return;

  AFRAME.registerComponent(COMPONENT_NAME, {
    schema: {
      nrrdUrl: { type: "string", default: "" },
      colormapUrl: { type: "string", default: "" },
      clim2: { type: "number", default: 5e-6 },
      isPerspective: { type: "boolean", default: true },
    } as CArmVolumeSchema,

    init: function () {
      this._mesh = null as any;
      this._material = null as any;
      const url = this.data.nrrdUrl;
      if (!url) {
        console.warn("[c-arm-volume] nrrdUrl is empty");
        return;
      }
      const THREE = AFRAME.THREE;
      if (!THREE) {
        console.warn("[c-arm-volume] AFRAME.THREE not available");
        return;
      }
      const renderer = this.el.sceneEl?.renderer;
      const isWebGL2 = renderer?.capabilities?.isWebGL2 ?? (typeof WebGL2RenderingContext !== "undefined");
      if (!isWebGL2) {
        console.warn("[c-arm-volume] WebGL2 required for 3D texture; volume disabled.");
        return;
      }

      const loader = new NRRDLoader();
      loader.load(
        url,
        (volume: Volume) => {
          this._buildVolumeMesh(volume, THREE);
        },
        undefined,
        (err) => {
          console.error("[c-arm-volume] NRRD load failed:", err);
        }
      );
    },

    _buildVolumeMesh: function (volume: Volume, THREE: any) {
      const clim2 = this.data.clim2 ?? 5e-6;
      const w = volume.xLength;
      const h = volume.yLength;
      const d = volume.zLength;

      const texture = new THREE.Data3DTexture(
        volume.data,
        w,
        h,
        d
      );
      texture.format = THREE.RedFormat;
      texture.type = THREE.FloatType;
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;

      const uniforms = {
        u_size: { value: new THREE.Vector3(w, h, d) },
        u_renderstyle: { value: 0 },
        u_renderthreshold: { value: 0.1 },
        u_coefficient: { value: 1.0 },
        u_offset: { value: 0.0 },
        u_boardCoefficient: { value: 0.01 },
        u_boardOffset: { value: 0.0 },
        u_opacity: { value: 0.75 }, // 半透明，可透过体渲染看到 C-Arm/病床
        u_clim: { value: new THREE.Vector2(0, clim2) },
        u_data: { value: texture },
        u_cmdata: { value: null as any },
        u_modelMatrix: { value: new THREE.Matrix4() },
      };

      const material = new THREE.RawShaderMaterial({
        glslVersion: (THREE as any).GLSL3 || "300 es",
        uniforms,
        vertexShader: VOLUME_VERTEX_SHADER,
        fragmentShader: VOLUME_FRAGMENT_SHADER,
        side: THREE.BackSide,
        transparent: true,
        depthTest: false,
        depthWrite: true,
      });
      this._material = material;

      const geometry = new THREE.BoxGeometry(w, h, d);
      geometry.translate(w / 2 - 0.5, h / 2 - 0.5, d / 2 - 0.5);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 10; // 体渲染在 C-Arm/病床之后绘制，便于透明混合
      this.el.object3D.add(mesh);
      this._mesh = mesh;

      const colormapUrl = this.data.colormapUrl;
      if (colormapUrl) {
        const texLoader = new THREE.TextureLoader();
        texLoader.load(
          colormapUrl,
          (tex: any) => {
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            if (material.uniforms?.u_cmdata) material.uniforms.u_cmdata.value = tex;
          },
          undefined,
          (err: any) => console.warn("[c-arm-volume] colormap load failed:", err)
        );
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const grd = ctx.createLinearGradient(0, 0, 256, 0);
          grd.addColorStop(0, "#000004");
          grd.addColorStop(0.2, "#3b0f70");
          grd.addColorStop(0.4, "#8c2981");
          grd.addColorStop(0.6, "#de4968");
          grd.addColorStop(0.8, "#fe9f6d");
          grd.addColorStop(1, "#fcfdbf");
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, 256, 1);
        }
        const fallbackTex = new THREE.CanvasTexture(canvas);
        fallbackTex.minFilter = THREE.LinearFilter;
        fallbackTex.magFilter = THREE.LinearFilter;
        if (material.uniforms?.u_cmdata) material.uniforms.u_cmdata.value = fallbackTex;
      }
    },

    tick: function () {
      const mesh = this._mesh;
      const mat = this._material;
      if (!mesh?.material?.uniforms?.u_modelMatrix) return;
      mesh.updateMatrixWorld(true);
      mat.uniforms.u_modelMatrix.value.copy(mesh.matrixWorld);
    },

    remove: function () {
      if (this._mesh) {
        this.el.object3D.remove(this._mesh);
        if (this._mesh.geometry) this._mesh.geometry.dispose();
        if (this._mesh.material) {
          if (this._mesh.material.uniforms?.u_data?.value) this._mesh.material.uniforms.u_data.value.dispose();
          this._mesh.material.dispose();
        }
        this._mesh = null;
        this._material = null;
      }
    },
  });
}

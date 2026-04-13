/**
 * NAF avatar animation state machine (Unreal-style).
 *
 * Velocity is derived from the rig entity's position delta. For NAF, the rig position
 * is the one NAF writes/interpolates (networked position), so we read rig.object3D
 * each frame and velocity = (pos - prevPos) / delta. Same for local (wasd updates
 * #player position) and remote (NAF interpolates position). No input (keys) used.
 */
(function () {
  var ACTION_CONFIG = [
    { actionName: "Idle", file: "Idle.glb" },
    { actionName: "Falling Idle", file: "Falling Idle.glb" },
    { actionName: "Standard Walk", file: "Standard Walk.glb" },
    { actionName: "Walking Backward", file: "Walking Backward.glb" },
    { actionName: "Left Strafe Walking", file: "Left Strafe Walking.glb" },
    { actionName: "Right Strafe Walking", file: "Right Strafe Walking.glb" },
  ];

  /**
   * Derive movement state by projecting world velocity onto camera forward/right.
   * When speed > threshold, use SIGN of projection for direction (no extra threshold) so walk triggers reliably.
   */
  function deriveMovementState(worldVelocity, cameraForward, cameraRight, velocityThreshold, grounded) {
    var speed = Math.sqrt(worldVelocity.x * worldVelocity.x + worldVelocity.z * worldVelocity.z);
    var threshold = velocityThreshold > 0 ? velocityThreshold : 0.01;
    var forwardAmount = worldVelocity.x * cameraForward.x + worldVelocity.z * cameraForward.z;
    var rightAmount = worldVelocity.x * cameraRight.x + worldVelocity.z * cameraRight.z;

    var forward = false;
    var backward = false;
    var left = false;
    var right = false;
    if (speed > threshold) {
      forward = forwardAmount > 0;
      backward = forwardAmount < 0;
      left = rightAmount < 0;
      right = rightAmount > 0;
    }
    var moveCount = (forward ? 1 : 0) + (backward ? 1 : 0);

    return {
      speed: speed,
      forward: forward,
      backward: backward,
      left: left,
      right: right,
      moveSum: moveCount,
      isGround: grounded,
      grounded: grounded,
    };
  }

  /** Flatten to XZ and normalize (Y-up). If length too small, set to -Z. */
  function flattenXZNormalize(v) {
    var x = v.x;
    var z = v.z;
    var len = Math.sqrt(x * x + z * z);
    if (len < 1e-6) {
      v.x = 0;
      v.y = 0;
      v.z = -1;
      return;
    }
    v.x = x / len;
    v.y = 0;
    v.z = z / len;
  }

  /**
   * Weight for a single movement direction: only when grounded and that direction is active.
   * Split 1.0 among active directions (moveSum).
   */
  function moveWeight(directionActive, controls) {
    var moveSum = controls.moveSum;
    return moveSum ? (controls.isGround && directionActive ? 1 / moveSum : 0) : 0;
  }

  function weightFns() {
    return {
      Idle: function (controls) {
        return controls.isGround && controls.moveSum === 0 ? 1 : 0;
      },
      "Falling Idle": function (controls) {
        return controls.grounded ? 0 : 1;
      },
      "Standard Walk": function (controls) {
        return moveWeight(controls.forward, controls);
      },
      "Walking Backward": function (controls) {
        return moveWeight(controls.backward, controls);
      },
      "Left Strafe Walking": function () {
        return 0;
      },
      "Right Strafe Walking": function () {
        return 0;
      },
    };
  }

  if (typeof AFRAME === "undefined") {
    console.warn("avatar-animation-state-machine: AFRAME not found.");
    return;
  }

  AFRAME.registerComponent("avatar-animation-state-machine", {
    schema: {
      animsBaseUrl: { type: "string", default: "/models/glb/animations" },
      /** Camera entity for forward direction (selector). Default: same entity (player rig = camera yaw). */
      camera: { type: "selector", default: "" },
      /** Min speed to count as moving (m/s); lower = more sensitive. */
      velocityThreshold: { type: "number", default: 0.001 },
      grounded: { type: "boolean", default: true },
      debug: { type: "boolean", default: false },
    },

    init: function () {
      this._mixer = null;
      this._actions = {};
      this._ready = false;
      this._loading = false;
      this._modelLoaded = false;
      this._modelLoadedListenerAdded = false;
      this._weightFns = weightFns();
      this._grounded = this.data.grounded;
      var THREE = AFRAME.THREE;
      this._prevPos = new THREE.Vector3();
      this._velocity = new THREE.Vector3();
      this._forward = new THREE.Vector3();
      this._right = new THREE.Vector3();
      this._up = new THREE.Vector3(0, 1, 0);
      this._tickCount = 0;
      this._warnedNoModel = false;
      var modelEl = this._getModelEl();
      if (modelEl) {
        this._addModelLoadedListener(modelEl);
      }
    },

    _addModelLoadedListener: function (modelEl) {
      if (this._modelLoadedListenerAdded) return;
      this._modelLoadedListenerAdded = true;
      var self = this;
      modelEl.addEventListener("model-loaded", function () {
        self._modelLoaded = true;
      });
    },

    update: function (oldData) {
      if (this.data.grounded !== undefined) {
        this._grounded = this.data.grounded;
      }
    },

    _getModelEl: function () {
      var el = this.el;
      var direct = el.querySelector("[gltf-model]");
      if (direct) return direct;
      var withAvatar = el.querySelector(".avatar [gltf-model]");
      if (withAvatar) return withAvatar;
      if (el.id === "player" && el.sceneEl) {
        var byPlayer = el.sceneEl.querySelector("#player [gltf-model]");
        if (byPlayer) return byPlayer;
      }
      return null;
    },

    _getRig: function () {
      var el = this.el;
      if (el.id === "player" || (el.components && el.components["wasd-controls"])) return el;
      var parent = el.parentEl;
      return parent || el;
    },

    /** For remote: the rig is the entity whose position NAF syncs. That can be this.el (template root) or a parent (e.g. #player). */
    _getRigForRemote: function () {
      var el = this.el;
      if (el.components && el.components.networked) return el;
      while (el && el.parentEl) {
        var parent = el.parentEl;
        if (parent.components && parent.components.networked) return parent;
        el = parent;
      }
      return this.el;
    },

    _ensureMixer: function () {
      if (this._ready) return true;
      if (this._loading) return false;
      var modelEl = this._getModelEl();
      if (!modelEl || !modelEl.object3D) {
        if (this.data.debug && !this._warnedNoModel) {
          this._warnedNoModel = true;
        }
        return false;
      }
      this._addModelLoadedListener(modelEl);
      var hasModel = this._modelLoaded || (modelEl.object3D.children && modelEl.object3D.children.length > 0);
      if (!hasModel) return false;
      var root = modelEl.object3D;
      var THREE = AFRAME.THREE;
      if (!THREE || !THREE.AnimationMixer) return false;

      this._loading = true;
      this._mixer = new THREE.AnimationMixer(root);
      var raw = (this.data.animsBaseUrl || "/models/glb/animations").trim();
      var baseUrl = raw.replace(/^['"]|['"]$/g, "");
      if (!baseUrl.startsWith("/") && !baseUrl.startsWith("http")) {
        baseUrl = "/" + baseUrl;
      }
      var base = baseUrl.charAt(baseUrl.length - 1) === "/" ? baseUrl : baseUrl + "/";
      var loader = new THREE.GLTFLoader();
      var self = this;
      var pending = ACTION_CONFIG.length;

      function onLoaded(actionName, gltf) {
        if (gltf && gltf.animations && gltf.animations.length) {
          var clip = gltf.animations[0];
          var action = self._mixer.clipAction(clip);
          action.enabled = true;
          action.setEffectiveWeight(actionName === "Idle" ? 1 : 0);
          action.play();
          self._actions[actionName] = action;
        }
        pending--;
        if (pending === 0) {
          self._ready = true;
        }
      }

      function onError(url, err) {
        pending--;
        if (pending === 0) {
          self._ready = true;
        }
      }

      var origin = typeof window !== "undefined" && window.location && window.location.origin ? window.location.origin : "";
      for (var i = 0; i < ACTION_CONFIG.length; i++) {
        var cfg = ACTION_CONFIG[i];
        var path = base + cfg.file;
        var url = path.startsWith("http") ? path : (origin + (path.startsWith("/") ? path : "/" + path));
        (function (actionName) {
          loader.load(
            url,
            function (gltf) {
              onLoaded(actionName, gltf);
            },
            undefined,
            function (err) {
              onError(url, err);
            }
          );
        })(cfg.actionName);
      }
      return false;
    },

    _setWeight: function (actionName, weight) {
      var action = this._actions[actionName];
      if (action) {
        action.enabled = true;
        action.setEffectiveWeight(weight);
      }
    },

    tick: function (time, delta) {
      var el = this.el;
      var rig = this._getRig();
      var isLocalPlayer = rig && (rig.id === "player" || (rig.components && rig.components["wasd-controls"]));
      if (typeof window !== "undefined" && isLocalPlayer) {
        try {
          var pos = rig.object3D ? rig.object3D.getWorldPosition(new AFRAME.THREE.Vector3()) : null;
          window.__avatarAnimationDebug = {
            position: pos ? { x: pos.x, y: pos.y, z: pos.z } : { x: 0, y: 0, z: 0 },
            prevPos: { x: this._prevPos.x, y: this._prevPos.y, z: this._prevPos.z },
            velocity: { x: this._velocity.x, z: this._velocity.z },
            speed: 0,
            moveSum: 0,
            forward: false,
            backward: false,
            left: false,
            right: false,
            tickCount: this._tickCount,
            mixerReady: this._ready,
          };
        } catch (e) {
          window.__avatarAnimationDebug = {
            position: { x: 0, y: 0, z: 0 },
            prevPos: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, z: 0 },
            speed: 0,
            moveSum: 0,
            forward: false,
            backward: false,
            left: false,
            right: false,
            tickCount: this._tickCount,
            mixerReady: this._ready,
            _error: String(e && e.message ? e.message : e),
          };
        }
      }
      var deltaSec = (delta || 0) / 1000;
      deltaSec = deltaSec <= 0 ? 0.016 : deltaSec;
      if (!isLocalPlayer) {
        rig = this._getRigForRemote() || this.el.parentEl || rig;
      }
      var rigObj = rig ? rig.object3D : null;
      var worldPos = new AFRAME.THREE.Vector3();
      if (rigObj) {
        var posAttr = rig.getAttribute && rig.getAttribute("position");
        if (posAttr != null) {
          var px = 0, py = 0, pz = 0;
          if (typeof posAttr === "string") {
            var parts = posAttr.trim().split(/\s+/);
            if (parts.length >= 3) { px = parseFloat(parts[0]) || 0; py = parseFloat(parts[1]) || 0; pz = parseFloat(parts[2]) || 0; }
          } else {
            px = posAttr.x != null ? Number(posAttr.x) : 0;
            py = posAttr.y != null ? Number(posAttr.y) : 0;
            pz = posAttr.z != null ? Number(posAttr.z) : 0;
          }
          worldPos.set(px, py, pz);
        } else {
          rig.object3D.updateMatrixWorld(true);
          rigObj.getWorldPosition(worldPos);
        }
      } else {
        worldPos.copy(this._prevPos);
      }
      this._ensureMixer();
      if (this._tickCount === 0) {
        this._prevPos.copy(worldPos);
        this._tickCount = 1;
      } else {
        this._velocity.set(
          (worldPos.x - this._prevPos.x) / deltaSec,
          0,
          (worldPos.z - this._prevPos.z) / deltaSec
        );
        this._prevPos.copy(worldPos);
      }

      var isLocalForCam = rig && (rig.id === "player" || (rig.components && rig.components["wasd-controls"]));
      if (rigObj) {
        if (isLocalForCam) {
          var camEl = rig.querySelector("#player-camera") || rig.querySelector("a-camera");
          if (camEl && camEl.object3D) {
            this._forward.set(0, 0, -1).applyQuaternion(camEl.object3D.getWorldQuaternion(new AFRAME.THREE.Quaternion()));
          } else {
            this._forward.set(0, 0, -1).applyQuaternion(rigObj.getWorldQuaternion(new AFRAME.THREE.Quaternion()));
          }
        } else {
          this._forward.set(0, 0, -1).applyQuaternion(rigObj.getWorldQuaternion(new AFRAME.THREE.Quaternion()));
        }
      } else {
        this._forward.set(0, 0, -1);
      }
      this._forward.y = 0;
      flattenXZNormalize(this._forward);
      this._right.crossVectors(this._up, this._forward);
      flattenXZNormalize(this._right);
      var wasd = rig.components && rig.components["wasd-controls"];
      var grounded = this._grounded;
      if (wasd && wasd.data && wasd.data.fly === true) {
        grounded = false;
      }
      var state = deriveMovementState(
        this._velocity,
        this._forward,
        this._right,
        this.data.velocityThreshold,
        grounded
      );
      if (typeof window !== "undefined" && isLocalPlayer) {
        window.__avatarAnimationDebug = {
          position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
          prevPos: { x: this._prevPos.x, y: this._prevPos.y, z: this._prevPos.z },
          velocity: { x: this._velocity.x, z: this._velocity.z },
          speed: state.speed,
          moveSum: state.moveSum,
          forward: state.forward,
          backward: state.backward,
          left: state.left,
          right: state.right,
          tickCount: this._tickCount,
          mixerReady: this._ready,
        };
      }
      if (this._ready) {
        var fns = this._weightFns;
        for (var actionName in fns) {
          if (fns.hasOwnProperty(actionName)) {
            var w = fns[actionName](state);
            this._setWeight(actionName, w);
          }
        }
        if (this._mixer && deltaSec > 0) {
          this._mixer.update(deltaSec);
        }
      }
      this._tickCount++;
    },

  });

  /**
   * System: drives animation for ALL .avatar entities (local + remote).
   * NAF may not initialize the component on cloned remote avatars; this system
   * runs every tick and updates every .avatar so remote players get animation too.
   */
  AFRAME.registerSystem("avatar-animation-driver", {
    schema: {
      animsBaseUrl: { type: "string", default: "/models/glb/animations" },
      velocityThreshold: { type: "number", default: 0.001 },
    },
    init: function () {
      this._stateByAvatar = new Map();
      this._THREE = AFRAME.THREE;
      this._weightFns = weightFns();
      this._lastDeferredTime = 0;
    },
    /** Rig = entity with networked (position synced). Can be avatarEl (template root) or a parent. */
    _getRigForRemote: function (avatarEl) {
      var el = avatarEl;
      if (el.components && el.components.networked) return el;
      while (el && el.parentEl) {
        var parent = el.parentEl;
        if (parent.components && parent.components.networked) return parent;
        el = parent;
      }
      return avatarEl;
    },
    _getState: function (avatarEl) {
      var state = this._stateByAvatar.get(avatarEl);
      if (state) return state;
      var THREE = this._THREE;
      state = {
        prevPos: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        forward: new THREE.Vector3(),
        right: new THREE.Vector3(),
        up: new THREE.Vector3(0, 1, 0),
        mixer: null,
        actions: {},
        ready: false,
        loading: false,
        modelLoaded: false,
        listenerAdded: false,
        tickCount: 0,
      };
      this._stateByAvatar.set(avatarEl, state);
      return state;
    },
    _ensureMixer: function (avatarEl, state) {
      if (state.ready) return true;
      if (state.loading) return false;
      var modelEl = avatarEl.querySelector("[gltf-model]");
      if (!modelEl || !modelEl.object3D) return false;
      if (!state.listenerAdded) {
        state.listenerAdded = true;
        var self = this;
        modelEl.addEventListener("model-loaded", function () {
          state.modelLoaded = true;
        });
      }
      var hasModel = state.modelLoaded || (modelEl.object3D.children && modelEl.object3D.children.length > 0);
      if (!hasModel) return false;
      var THREE = this._THREE;
      if (!THREE || !THREE.AnimationMixer) return false;
      state.loading = true;
      var root = modelEl.object3D;
      state.mixer = new THREE.AnimationMixer(root);
      var baseUrl = (this.data.animsBaseUrl || "/models/glb/animations").trim().replace(/^['"]|['"]$/g, "");
      if (!baseUrl.startsWith("/") && !baseUrl.startsWith("http")) baseUrl = "/" + baseUrl;
      var base = baseUrl.charAt(baseUrl.length - 1) === "/" ? baseUrl : baseUrl + "/";
      var loader = new THREE.GLTFLoader();
      var self = this;
      var pending = ACTION_CONFIG.length;
      function onLoaded(actionName, gltf) {
        if (gltf && gltf.animations && gltf.animations.length) {
          var clip = gltf.animations[0];
          var action = state.mixer.clipAction(clip);
          action.enabled = true;
          action.setEffectiveWeight(actionName === "Idle" ? 1 : 0);
          action.play();
          state.actions[actionName] = action;
        }
        pending--;
        if (pending === 0) state.ready = true;
      }
      function onError() {
        pending--;
        if (pending === 0) state.ready = true;
      }
      var origin = typeof window !== "undefined" && window.location && window.location.origin ? window.location.origin : "";
      for (var i = 0; i < ACTION_CONFIG.length; i++) {
        var cfg = ACTION_CONFIG[i];
        var path = base + cfg.file;
        var url = path.startsWith("http") ? path : (origin + (path.startsWith("/") ? path : "/" + path));
        (function (actionName) {
          loader.load(url, function (g) { onLoaded(actionName, g); }, undefined, onError);
        })(cfg.actionName);
      }
      return false;
    },
    _setWeight: function (state, actionName, weight) {
      var action = state.actions[actionName];
      if (action) {
        action.enabled = true;
        action.setEffectiveWeight(weight);
      }
    },
    tick: function (time, delta) {
      var scene = this.el;
      if (!scene || !scene.object3D) return;
      var avatars = scene.querySelectorAll(".avatar");
      var deltaSec = (delta || 0) / 1000;
      deltaSec = deltaSec <= 0 ? 0.016 : deltaSec;
      var THREE = this._THREE;
      var toProcess = [];
      for (var i = 0; i < avatars.length; i++) {
        var avatarEl = avatars[i];
        if (!document.body.contains(avatarEl)) {
          this._stateByAvatar.delete(avatarEl);
          continue;
        }
        var rig = this._getRigForRemote(avatarEl);
        if (!rig || !rig.object3D) continue;
        if (rig.id === "player" || (rig.components && rig.components["wasd-controls"])) {
          continue;
        }
        if (avatarEl.components && avatarEl.components["avatar-animation-state-machine"]) {
          continue;
        }
        toProcess.push({ avatarEl: avatarEl, rig: rig });
      }
      var self = this;
      if (toProcess.length > 0) {
        requestAnimationFrame(function () {
          var now = performance.now();
          var d = self._lastDeferredTime ? (now - self._lastDeferredTime) / 1000 : deltaSec;
          self._lastDeferredTime = now;
          if (d <= 0) d = 0.016;
          for (var j = 0; j < toProcess.length; j++) {
            var item = toProcess[j];
            var aEl = item.avatarEl;
            var r = item.rig;
            if (!document.body.contains(aEl) || !r || !r.object3D) continue;
            var state = self._getState(aEl);
            self._ensureMixer(aEl, state);
            var worldPos = r.object3D.getWorldPosition(new THREE.Vector3());
            if (state.tickCount === 0) {
              state.prevPos.copy(worldPos);
              state.tickCount = 1;
            } else {
              state.velocity.set(
                (worldPos.x - state.prevPos.x) / d,
                0,
                (worldPos.z - state.prevPos.z) / d
              );
              state.prevPos.copy(worldPos);
            }
            state.forward.set(0, 0, -1).applyQuaternion(r.object3D.getWorldQuaternion(new THREE.Quaternion()));
            state.forward.y = 0;
            flattenXZNormalize(state.forward);
            state.right.crossVectors(state.up, state.forward);
            flattenXZNormalize(state.right);
            var movementState = deriveMovementState(
              state.velocity,
              state.forward,
              state.right,
              self.data.velocityThreshold,
              true
            );
            if (state.ready) {
              var fns = self._weightFns;
              for (var actionName in fns) {
                if (fns.hasOwnProperty(actionName)) {
                  var w = fns[actionName](movementState);
                  self._setWeight(state, actionName, w);
                }
              }
              if (state.mixer && d > 0) state.mixer.update(d);
            }
            state.tickCount++;
          }
        });
      }
    },
  });
})();

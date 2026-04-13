/* global NAF */
(function() {
  class SocketIOAdapter {
    constructor() {
      if (typeof io === 'undefined') {
        console.warn('SocketIOAdapter: io is not defined. Make sure to load socket.io-client script first.');
      }
      this.app = 'default';
      this.room = 'default';
      this.socket = null;
      this.connectedClients = [];
      // Track per-client "data channel" status for NAF.
      // If we always report IS_CONNECTED, NAF won't call startStreamConnection(),
      // which prevents initial sync for late joiners.
      this._connectStatus = {};
    }

    setServerUrl(url) {
      console.log("SocketIOAdapter: Setting server URL to", url);
      this.serverUrl = url;
    }

    setApp(app) {
      this.app = app;
    }

    setRoom(room) {
      this.room = room;
    }

    setWebRtcOptions(options) {
      // No WebRTC support in this simple adapter
    }

    setServerConnectListeners(successListener, failureListener) {
      this.connectSuccess = successListener;
      this.connectFailure = failureListener;
    }

    setRoomOccupantListener(occupantListener) {
      this.occupantListener = occupantListener;
    }

    setDataChannelListeners(openListener, closedListener, messageListener) {
      this.openListener = openListener;
      this.closedListener = closedListener;
      this.messageListener = messageListener;
    }

    connect() {
      if (!this.serverUrl) {
         console.error("SocketIOAdapter: No server URL set!");
         return;
      }

      console.log("SocketIOAdapter: Connecting to", this.serverUrl);
      this.socket = io(this.serverUrl);

      this.socket.on('connect', () => {
        console.log("SocketIOAdapter: Connected to socket server");
        
        // NAF 0.12+ style joining
        // We emit 'joinRoom' as expected by our server.js
        this.socket.emit('joinRoom', this.room);

        if (this.connectSuccess) {
          this.connectSuccess(this.socket.id);
        }
      });

      this.socket.on('connect_error', (err) => {
         console.error("SocketIOAdapter: Connection error", err);
         if (this.connectFailure) {
             this.connectFailure(err.message, err);
         }
      });

      const emitOccupants = () => {
        if (!this.occupantListener) return;
        const occupantMap = {};
        this.connectedClients.forEach(id => {
          // values are userData objects; empty is fine for our use
          occupantMap[id] = {};
        });
        this.occupantListener(occupantMap);
      };

      this.socket.on('userJoined', (clientId) => {
          console.log("SocketIOAdapter: User joined", clientId);
          if (clientId && clientId !== this.socket.id && !this.connectedClients.includes(clientId)) {
            this.connectedClients.push(clientId);
          }
          if (clientId && clientId !== this.socket.id) {
            this._connectStatus[clientId] = NAF.adapters.IS_NOT_CONNECTED;
          }
          emitOccupants();
      });
      
      this.socket.on('roomOccupants', (occupants) => {
          console.log("SocketIOAdapter: Room occupants received", occupants);
          // occupants is an array of IDs from our server.js
          this.connectedClients = [];
          this._connectStatus = {};
          occupants.forEach(id => {
            if (id && id !== this.socket.id && !this.connectedClients.includes(id)) {
              this.connectedClients.push(id);
              this._connectStatus[id] = NAF.adapters.IS_NOT_CONNECTED;
            }
          });
          emitOccupants();
      });

      this.socket.on('userLeft', (clientId) => {
          console.log("SocketIOAdapter: User left", clientId);
          const idx = this.connectedClients.indexOf(clientId);
          if (idx > -1) {
              this.connectedClients.splice(idx, 1);
          }
          if (clientId && this._connectStatus) {
            delete this._connectStatus[clientId];
          }
          emitOccupants();
          if (this.closedListener) {
              this.closedListener(clientId);
          }
      });

      this.socket.on('receive', (data) => {
          // data structure: { from, type, data, to }
          // NAF expects: senderId, dataType, data, targetId
          
          // Our server.js forwards exact object received in 'send'.
          // format: { room, from, to, type, data } (implied)
          
          // Let's verify what NAF sends.
          // NAF sends: { to: targetId, type: dataType, data: data, sending: true/false }
          // We need to wrap it with 'from'.
          
          // IMPORTANT:
          // NAF sendDataGuaranteed is point-to-point. The server should deliver
          // to a specific socket id. Still, we defensively filter by "to".
          if (data && data.to && this.socket && data.to !== this.socket.id) return;

          // Pass targetId as 4th arg (NAF adapter API)
          if (this.messageListener) this.messageListener(data.from, data.type, data.data, data.to);
      });
      
      this.socket.on('broadcast', (data) => {
          if (this.messageListener) this.messageListener(data.from, data.type, data.data, undefined);
      });
    }

    shouldStartConnectionTo(client) {
      // Never connect to self
      return !!client && (!this.socket || client !== this.socket.id);
    }

    startStreamConnection(clientId) {
      if (clientId && this._connectStatus) {
        this._connectStatus[clientId] = NAF.adapters.IS_CONNECTED;
      }
      if (this.openListener) {
        this.openListener(clientId);
      }
    }

    closeStreamConnection(clientId) {
      if (clientId && this._connectStatus) {
        this._connectStatus[clientId] = NAF.adapters.IS_NOT_CONNECTED;
      }
      if (this.closedListener) {
        this.closedListener(clientId);
      }
    }

    getConnectStatus(clientId) {
      if (!clientId) return NAF.adapters.IS_NOT_CONNECTED;
      if (!this._connectStatus) return NAF.adapters.IS_NOT_CONNECTED;
      return this._connectStatus[clientId] ?? NAF.adapters.IS_NOT_CONNECTED;
    }

    sendData(toClientId, dataType, data) {
      this.sendDataGuaranteed(toClientId, dataType, data);
    }

    sendDataGuaranteed(toClientId, dataType, data) {
      const packet = {
        from: this.socket.id,
        to: toClientId,
        type: dataType,
        data: data,
        room: this.room
      };
      this.socket.emit('send', packet);
    }

    broadcastData(dataType, data) {
      this.broadcastDataGuaranteed(dataType, data);
    }

    broadcastDataGuaranteed(dataType, data) {
       const packet = {
        from: this.socket.id,
        type: dataType,
        data: data,
        room: this.room
      };
      this.socket.emit('broadcast', packet);
    }

    getMediaStream(clientId) {
      return Promise.reject('Interface method not implemented: getMediaStream');
    }

    getServerTime() {
      return Date.now();
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
    
    // Stub methods for interface compliance
    getUserData(clientId) { return {}; }
  }

  // Register adapter
  // Try interval in case NAF loads slowly
  const register = () => {
      if (window.NAF) {
          window.NAF.adapters.register('socketio', SocketIOAdapter);
          console.log("SocketIOAdapter: Registered 'socketio' adapter with NAF.");

          // Signal readiness for React gating
          window.__NAF_SOCKETIO_ADAPTER_READY__ = true;
          try {
              window.dispatchEvent(new Event('naf-socketio-adapter-ready'));
          } catch (e) {
              // IE/old browsers fallback (not expected)
          }
      } else {
          setTimeout(register, 100);
      }
  };
  register();

})();

// Online Multiplayer Manager using MQTT over WebSocket (zero-NAT, works on GitHub Pages)

class PoolNetwork {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.client = null;
    this.clientId = 'p_' + Math.random().toString(36).slice(2, 10);
    this.roomCode = null;
    this.isHost = false;
    this.connected = false;
    this.paired = false;
    this.playerName = 'Người chơi';
    this.mode = '8ball';
    this.brokers = [
      'wss://broker.emqx.io:8084/mqtt',
      'wss://broker.hivemq.com:8884/mqtt',
      'wss://test.mosquitto.org:8081/mqtt',
    ];
    this.brokerIdx = 0;
    this.seekTimer = null;
  }

  connect(onReady) {
    if (typeof mqtt === 'undefined') {
      if (this.handlers.onError) {
        this.handlers.onError('Chưa tải được thư viện mạng MQTT. Hãy tải lại trang!');
      }
      return;
    }
    if (this.client && this.connected) {
      onReady();
      return;
    }
    this.disconnect();

    const url = this.brokers[this.brokerIdx % this.brokers.length];
    this.client = mqtt.connect(url, {
      clientId: this.clientId,
      clean: true,
      connectTimeout: 3500,
      reconnectPeriod: 0,
    });

    let calledReady = false;
    const timeout = setTimeout(() => {
      if (!this.connected) {
        this.brokerIdx++;
        if (this.brokerIdx < this.brokers.length) {
          this.connect(onReady);
        } else if (this.handlers.onError) {
          this.handlers.onError('Không thể kết nối máy chủ mạng. Vui lòng kiểm tra mạng và thử lại!');
        }
      }
    }, 3800);

    this.client.on('connect', () => {
      clearTimeout(timeout);
      this.connected = true;
      if (!calledReady) {
        calledReady = true;
        onReady();
      }
    });

    this.client.on('message', (topic, payload) => {
      try {
        const msg = JSON.parse(payload.toString());
        if (msg.sender === this.clientId) return;
        this.handleMessage(topic, msg);
      } catch (e) {
        console.warn('Invalid network message', e);
      }
    });

    this.client.on('error', () => {
      // handled by timeout / reconnect
    });
  }

  roomTopic(code) {
    return `bida-skill-v1/room/${code}`;
  }

  lobbyTopic(mode) {
    return `bida-skill-v1/lobby/${mode}`;
  }

  createRoom(name, mode) {
    this.playerName = name;
    this.mode = mode;
    this.isHost = true;
    this.paired = false;
    this.brokerIdx = 0;
    this.roomCode = String(Math.floor(1000 + Math.random() * 9000));

    this.connect(() => {
      this.client.subscribe(this.roomTopic(this.roomCode), () => {
        if (this.handlers.onRoomCreated) {
          this.handlers.onRoomCreated(this.roomCode);
        }
      });
    });
  }

  joinRoom(code, name) {
    this.playerName = name;
    this.isHost = false;
    this.paired = false;
    this.brokerIdx = 0;
    this.roomCode = code.trim().toUpperCase();

    this.connect(() => {
      this.client.subscribe(this.roomTopic(this.roomCode), () => {
        this.sendRoom({
          type: 'JOIN',
          name: this.playerName,
        });
      });
    });
  }

  quickMatch(name, mode) {
    this.playerName = name;
    this.mode = mode;
    this.paired = false;
    this.brokerIdx = 0;
    this.roomCode = String(Math.floor(100000 + Math.random() * 900000));

    this.connect(() => {
      const topic = this.lobbyTopic(mode);
      this.client.subscribe(topic, () => {
        const announce = () => {
          if (this.paired) return;
          this.publish(topic, {
            type: 'SEEKING',
            name: this.playerName,
            roomCode: this.roomCode,
            mode: this.mode,
          });
        };
        announce();
        this.seekTimer = setInterval(announce, 2200);
      });
    });
  }

  stopSeeking() {
    if (this.seekTimer) {
      clearInterval(this.seekTimer);
      this.seekTimer = null;
    }
    if (this.client && this.connected) {
      this.client.unsubscribe(this.lobbyTopic(this.mode));
    }
  }

  publish(topic, data) {
    if (!this.client || !this.connected) return;
    this.client.publish(topic, JSON.stringify({ ...data, sender: this.clientId }));
  }

  sendRoom(data) {
    if (!this.roomCode) return;
    this.publish(this.roomTopic(this.roomCode), data);
  }

  handleMessage(topic, msg) {
    // Handle Quick Match Lobby
    if (topic.startsWith('bida-skill-v1/lobby/') && msg.type === 'SEEKING' && !this.paired) {
      // Deterministic host election: smaller clientId hosts
      this.stopSeeking();
      if (this.clientId < msg.sender) {
        this.isHost = true;
        this.client.subscribe(this.roomTopic(this.roomCode));
      } else {
        this.isHost = false;
        this.roomCode = msg.roomCode;
        this.client.subscribe(this.roomTopic(this.roomCode), () => {
          this.sendRoom({ type: 'JOIN', name: this.playerName });
        });
      }
      return;
    }

    // Handle Room messages
    if (msg.type === 'JOIN' && this.isHost && !this.paired) {
      this.paired = true;
      if (this.handlers.onPeerJoined) {
        this.handlers.onPeerJoined(msg.name);
      }
      return;
    }

    if (msg.type === 'WELCOME' && !this.isHost && !this.paired) {
      this.paired = true;
      this.mode = msg.mode;
      if (this.handlers.onWelcome) {
        this.handlers.onWelcome(msg);
      }
      return;
    }

    if (this.handlers.onGameMessage) {
      this.handlers.onGameMessage(msg);
    }
  }

  disconnect() {
    this.stopSeeking();
    this.paired = false;
    this.connected = false;
    if (this.client) {
      try {
        this.client.end(true);
      } catch (_) {}
      this.client = null;
    }
  }
}

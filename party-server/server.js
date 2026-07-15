export default class Server {
  constructor(room) {
    this.room = room;
    this.players = new Map();
    this.scene = [];
  }

  async onStart() {
    this.scene = (await this.room.storage.get('scene')) || [];
  }

  onConnect(connection) {
    connection.send(JSON.stringify({
      type: 'snapshot',
      scene: this.scene,
      players: [...this.players.values()],
    }));
  }

  async onMessage(rawMessage, sender) {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (message.type === 'publish_scene' && Array.isArray(message.scene)) {
      this.scene = message.scene;
      await this.room.storage.put('scene', this.scene);
      sender.send(JSON.stringify({ type: 'published' }));
      this.room.broadcast(JSON.stringify({ type: 'scene_published', scene: this.scene }), [sender.id]);
      return;
    }

    if (message.type === 'join' && message.player) {
      const player = {
        id: message.player.id || sender.id,
        name: String(message.player.name || 'Visitante').slice(0, 28),
        color: Number(message.player.color || 0x397bc5),
        x: 0,
        z: 12,
        ry: 0,
      };
      this.players.set(sender.id, player);
      sender.send(JSON.stringify({
        type: 'snapshot',
        scene: this.scene,
        players: [...this.players.values()],
      }));
      this.room.broadcast(JSON.stringify({ type: 'player_joined', player }), [sender.id]);
      return;
    }

    if (message.type === 'move' && message.player) {
      const existing = this.players.get(sender.id);
      if (!existing) return;
      const player = {
        ...existing,
        x: Number(message.player.x || 0),
        z: Number(message.player.z || 0),
        ry: Number(message.player.ry || 0),
      };
      this.players.set(sender.id, player);
      this.room.broadcast(JSON.stringify({ type: 'player_moved', player }), [sender.id]);
      return;
    }

    if (message.type === 'door') {
      this.room.broadcast(JSON.stringify({
        type: 'door',
        objectId: message.objectId,
        open: Boolean(message.open),
      }), [sender.id]);
    }
  }

  onClose(connection) {
    const player = this.players.get(connection.id);
    this.players.delete(connection.id);
    if (player) this.room.broadcast(JSON.stringify({ type: 'player_left', id: player.id }));
  }
}

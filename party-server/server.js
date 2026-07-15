export default class Server {
  constructor(room) {
    this.room = room;
    this.players = new Map();
  }

  onConnect(connection) {
    connection.send(JSON.stringify({
      type: 'snapshot',
      players: [...this.players.values()],
    }));
  }

  onMessage(message, sender) {
    if (typeof message !== 'string' || message.length > 4096) return;
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === 'join') {
      const player = this.sanitizePlayer(data, sender.id);
      this.players.set(sender.id, player);
      sender.setState?.({ playerId: player.id, name: player.name });
      this.room.broadcast(JSON.stringify({ type: 'player-joined', player }), [sender.id]);
      sender.send(JSON.stringify({ type: 'snapshot', players: [...this.players.values()] }));
      return;
    }

    if (data.type === 'move') {
      const current = this.players.get(sender.id);
      if (!current) return;
      const player = this.sanitizePlayer({ ...current, ...data }, current.id);
      this.players.set(sender.id, player);
      this.room.broadcast(JSON.stringify({ type: 'player-moved', player }), [sender.id]);
    }
  }

  onClose(connection) {
    const player = this.players.get(connection.id);
    this.players.delete(connection.id);
    if (player) {
      this.room.broadcast(JSON.stringify({ type: 'player-left', id: player.id }));
    }
  }

  onError(connection) {
    this.onClose(connection);
  }

  sanitizePlayer(data, fallbackId) {
    return {
      id: this.cleanText(data.id, fallbackId, 80),
      name: this.cleanText(data.name, 'Visitante', 28),
      color: this.cleanNumber(data.color, 0, 0xffffff, 0x397bc5),
      x: this.cleanNumber(data.x, -15, 15, 0),
      z: this.cleanNumber(data.z, -15, 15, 11),
      ry: this.cleanNumber(data.ry, -Math.PI * 4, Math.PI * 4, 0),
    };
  }

  cleanText(value, fallback, maxLength) {
    const text = typeof value === 'string' ? value.trim() : '';
    return (text || fallback).slice(0, maxLength);
  }

  cleanNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }
}

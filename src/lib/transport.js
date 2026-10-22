// Reloj de reproducción por deck (etapa 1: solo visual).
// En la etapa 2 este módulo se conecta al motor de audio (Web Audio) y
// getPosition() leerá la posición real del buffer.

export function createTransport(deckCount = 2) {
  const decks = Array.from({ length: deckCount }, () => ({
    basePos: 0,
    startedAt: 0,
    playing: false,
    rate: 1,
    loop: null, // { start, end }
    duration: 0,
  }));

  const now = () => performance.now() / 1000;

  function getPosition(i) {
    const d = decks[i];
    let pos = d.playing ? d.basePos + (now() - d.startedAt) * d.rate : d.basePos;
    if (d.loop && pos >= d.loop.end) {
      const len = d.loop.end - d.loop.start;
      pos = d.loop.start + ((pos - d.loop.start) % len);
    }
    if (d.duration && pos >= d.duration) {
      pos = d.duration;
      if (d.playing) { d.playing = false; d.basePos = pos; }
    }
    return Math.max(0, pos);
  }

  function rebase(i) {
    const d = decks[i];
    d.basePos = getPosition(i);
    d.startedAt = now();
  }

  return {
    decks,
    getPosition,
    load(i, duration, startPos = 0) {
      Object.assign(decks[i], { basePos: startPos, startedAt: now(), playing: false, loop: null, duration });
    },
    play(i) { rebase(i); decks[i].playing = true; },
    pause(i) { rebase(i); decks[i].playing = false; },
    toggle(i) { decks[i].playing ? this.pause(i) : this.play(i); return decks[i].playing; },
    seek(i, pos) { decks[i].basePos = Math.max(0, pos); decks[i].startedAt = now(); },
    setRate(i, rate) { rebase(i); decks[i].rate = rate; },
    setLoop(i, loop) { rebase(i); decks[i].loop = loop; },
    isPlaying(i) { return decks[i].playing; },
  };
}

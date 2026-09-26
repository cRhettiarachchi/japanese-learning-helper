const STORAGE_KEY = "japanese-learner-audio-progress-v1";
function bindAudioProgress({
  audio,
  checkbox,
  storage,
  progress,
  id,
  now = Date.now,
  status = () => {},
}) {
  let initialized = false,
    lastSaved = -Infinity,
    owner = progress?.user?.id || "local",
    lastSnapshot;
  const listeners = [];
  function listen(target, event, handler) {
    target.addEventListener(event, handler);
    listeners.push(() => target.removeEventListener(event, handler));
  }
  function readAll() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      const data = raw === null ? {} : JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw Error("Invalid progress");
      return data;
    } catch {
      status("Audio progress could not be read. Existing data has been kept.");
      return null;
    }
  }
  function read() {
    if (progress) {
      const p = progress.get("audio", id, "position");
      return {
        done: progress.get("audio", id, "done"),
        position: p?.seconds,
        duration: p?.duration,
        ended: p?.ended,
      };
    }
    return readAll()?.[id] || {};
  }
  function write(patch) {
    if (progress) {
      if (progress.canEdit && !progress.canEdit()) return;
      if (Object.hasOwn(patch, "done"))
        progress.set("audio", id, "done", patch.done);
      else
        progress.set("audio", id, "position", {
          seconds: patch.position,
          duration: patch.duration,
          ended: patch.ended,
        });
      return;
    }
    const all = readAll();
    if (!all) return;
    all[id] = { ...all[id], ...patch };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(all));
      status("Audio progress saved in this browser only.");
    } catch {
      status("Audio progress could not be saved in this browser.");
    }
  }
  function syncOwner() {
    const current = progress?.user?.id || "local";
    if (current === owner) return false;
    owner = current;
    initialized = false;
    lastSaved = -Infinity;
    if (!audio.paused) audio.pause();
    audio.currentTime = 0;
    restore();
    return true;
  }
  function savePosition(force = false) {
    if (progress && syncOwner()) return;
    if (!initialized || !Number.isFinite(audio.duration) || audio.duration <= 0)
      return;
    if (!force && now() - lastSaved < 5000) return;
    if (!Number.isFinite(audio.currentTime)) return;
    const ended = audio.ended;
    write({
      position: ended
        ? 0
        : Math.max(0, Math.min(audio.currentTime, audio.duration)),
      duration: audio.duration,
      ended,
    });
    lastSaved = now();
  }
  function restore() {
    if (
      initialized ||
      (progress?.canEdit && !progress.canEdit()) ||
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0
    )
      return;
    const saved = read();
    const position = Number.isFinite(saved.position) ? saved.position : 0;
    if (!saved.ended && position > 0 && position < audio.duration - 1)
      audio.currentTime = position;
    lastSnapshot = JSON.stringify(progress?.get("audio", id, "position"));
    initialized = true;
  }
  checkbox.checked = read().done === true;
  listen(checkbox, "change", () => write({ done: checkbox.checked }));
  listen(audio, "loadedmetadata", restore);
  listen(audio, "timeupdate", () => {
    if (!audio.paused && !audio.seeking) savePosition();
  });
  listen(audio, "pause", () => savePosition(true));
  listen(audio, "seeked", () => savePosition(true));
  listen(audio, "ended", () => savePosition(true));
  restore();
  return {
    save: () => savePosition(true),
    refreshDone: () => {
      if (progress) {
        syncOwner();
        restore();
        const saved = progress.get("audio", id, "position"),
          snapshot = JSON.stringify(saved);
        if (
          initialized &&
          audio.paused &&
          !audio.seeking &&
          (!progress.canEdit || progress.canEdit()) &&
          snapshot !== lastSnapshot
        ) {
          const seconds = saved?.ended ? 0 : saved?.seconds;
          if (
            Number.isFinite(seconds) &&
            seconds >= 0 &&
            seconds < audio.duration - 1
          )
            audio.currentTime = seconds;
          lastSnapshot = snapshot;
        }
      }
      checkbox.checked = read().done === true;
    },
    dispose: () => listeners.forEach((remove) => remove()),
  };
}

module.exports = { bindAudioProgress };

class VideoNoteStore {
  constructor({ auth, data, request, getAuth }) {
    this.auth = auth;
    this.data = data || { userId: auth.user.id, available: false, items: [] };
    this.request = request;
    this.getAuth = getAuth;
    this.busy = false;
    this.listeners = [];
  }
  subscribe(fn) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }
  emit() {
    for (const fn of this.listeners) fn();
  }
  accept(data) {
    if (data.userId !== this.auth.user.id)
      throw Object.assign(Error("Account changed. Reconnect before saving."), {
        status: 403,
      });
    const items = new Map(this.data.items.map((row) => [row.video_id, row]));
    for (const row of data.items)
      if ((items.get(row.video_id)?.revision || 0) <= row.revision)
        items.set(row.video_id, row);
    this.data = { ...data, items: [...items.values()] };
    this.emit();
  }
  get(id) {
    return this.data.items.find((row) => row.video_id === id) || null;
  }
  async load() {
    this.accept(await this.request("/api/video-notes"));
  }
  async save(body) {
    if (this.busy)
      throw Object.assign(Error("A note is already saving. Please wait."), {
        status: 409,
      });
    this.busy = true;
    this.emit();
    try {
      const auth = await this.getAuth();
      if (auth?.user.id !== this.auth.user.id)
        throw Object.assign(Error("Your account changed. Reopen the note."), {
          status: 401,
        });
      this.accept(
        await this.request("/api/video-notes", {
          method: "POST",
          csrf: auth.csrf,
          body,
        }),
      );
    } finally {
      this.busy = false;
      this.emit();
    }
  }
}
module.exports = { VideoNoteStore };

class VocabularyStore {
  constructor({ request, storage, getAuth, uuid = () => crypto.randomUUID() }) {
    this.request = request;
    this.getAuth = getAuth;
    this.storage = storage;
    this.uuid = uuid;
    this.auth = null;
    this.data = null;
    this.busy = false;
    this.error = "";
    this.lastRating = null;
    this.listeners = [];
  }
  subscribe(fn) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((x) => x !== fn));
  }
  emit() {
    for (const fn of this.listeners) fn();
  }
  prefix() {
    return "learner.vocabulary.pending." + this.auth.user.id + ":";
  }
  pending() {
    const result = [];
    const prefix = this.prefix();
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(prefix))
        result.push({ key, ...JSON.parse(this.storage.getItem(key)) });
    }
    return result.sort((a, b) => a.at - b.at);
  }
  accept(data) {
    if (data.userId !== this.auth?.user.id) {
      this.data = null;
      this.lastRating = null;
      throw Error("Account changed. Refresh to reconnect.");
    }
    this.data = data;
    if (data.lastRating) this.lastRating = data.lastRating;
    if (
      this.lastRating &&
      data.items.find((e) => e.entry_id === this.lastRating.entryId)
        ?.revision !== this.lastRating.revision
    )
      this.lastRating = null;
    this.emit();
  }
  async send(body) {
    return this.request("/api/vocabulary", {
      method: "POST",
      csrf: this.auth.csrf,
      body,
    });
  }
  async load() {
    if (this.busy) return false;
    this.busy = true;
    this.error = "";
    this.emit();
    try {
      const auth = this.getAuth
        ? await this.getAuth()
        : await this.request("/api/auth/session");
      if (!auth)
        throw Object.assign(Error("Sign in required"), { status: 401 });
      if (auth.user.id !== this.auth?.user.id) {
        this.data = null;
        this.lastRating = null;
      }
      this.auth = auth;
      for (const pending of this.pending()) {
        try {
          this.accept(await this.send(pending.body));
          this.storage.removeItem(pending.key);
        } catch (e) {
          if (e.status && e.status < 500) this.storage.removeItem(pending.key);
          throw e;
        }
      }
      this.accept(await this.request("/api/vocabulary"));
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    } finally {
      this.busy = false;
      this.emit();
    }
  }
  fail(e) {
    if (e.status === 401) {
      this.auth = null;
      this.data = null;
      this.lastRating = null;
      this.error = "Sign in to save and review vocabulary.";
    } else
      this.error =
        e.status === 409
          ? "This word changed on another device. Refresh before rating it again."
          : e.message ||
            "Cannot connect. Your pending change is kept for Retry.";
  }
  async mutate(input) {
    if (this.busy || !this.auth) return false;
    this.busy = true;
    this.error = "";
    this.emit();
    let key;
    try {
      if (this.pending().length)
        throw Error("A previous change needs Retry before another action.");
      const body = { ...input, mutationId: this.uuid() };
      key = this.prefix() + body.mutationId;
      this.storage.setItem(key, JSON.stringify({ body, at: Date.now() }));
      this.accept(await this.send(body));
      this.storage.removeItem(key);
      if (input.action === "undo") this.lastRating = null;
      return true;
    } catch (e) {
      if (key && e.status && e.status < 500) this.storage.removeItem(key);
      this.fail(e);
      return false;
    } finally {
      this.busy = false;
      this.emit();
    }
  }
  has(id) {
    return !!this.data?.items.some((item) => item.entry_id === id);
  }
}

module.exports = { VocabularyStore };

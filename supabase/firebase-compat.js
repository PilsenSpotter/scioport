// Minimal Firebase/Auth + Firestore compatibility layer backed by Supabase.
// It supports only the calls used by index.html during the migration.
(function () {
  const supabase = window.supabaseClient;

  function nowIso() {
    return new Date().toISOString();
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
      const random = Math.random() * 16 | 0;
      const value = char === "x" ? random : (random & 0x3 | 0x8);
      return value.toString(16);
    });
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function makeTimestamp(value) {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return {
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: (date.getTime() % 1000) * 1000000,
      toDate: function () {
        return new Date(date.getTime());
      },
      toMillis: function () {
        return date.getTime();
      }
    };
  }

  const SERVER_TIMESTAMP = { __scioCompatFieldValue: "serverTimestamp" };

  function increment(amount) {
    return {
      __scioCompatFieldValue: "increment",
      amount: Number(amount) || 0
    };
  }

  function isServerTimestamp(value) {
    return value && value.__scioCompatFieldValue === "serverTimestamp";
  }

  function isIncrement(value) {
    return value && value.__scioCompatFieldValue === "increment";
  }

  function resolveValue(value) {
    if (isServerTimestamp(value)) {
      return nowIso();
    }
    if (value && typeof value.toDate === "function") {
      return value.toDate().toISOString();
    }
    if (Array.isArray(value)) {
      return value.map(resolveValue);
    }
    if (value && typeof value === "object" && !isIncrement(value)) {
      const result = {};
      Object.keys(value).forEach(function (key) {
        if (typeof value[key] !== "undefined") {
          result[key] = resolveValue(value[key]);
        }
      });
      return result;
    }
    return value;
  }

  function stripUndefined(payload) {
    const result = {};
    Object.keys(payload || {}).forEach(function (key) {
      if (typeof payload[key] !== "undefined") {
        result[key] = payload[key];
      }
    });
    return result;
  }

  function fieldToColumn(kind, field) {
    const maps = {
      profiles: {
        emailLower: "email_lower",
        displayName: "display_name",
        className: "class_name",
        classNameLower: "class_name_lower",
        avatarOutfit: "avatar_outfit",
        greenShirtUnlocked: "green_shirt_unlocked",
        redShirtUnlocked: "red_shirt_unlocked",
        redBlueShirtUnlocked: "red_blue_shirt_unlocked",
        createdAt: "created_at",
        updatedAt: "updated_at"
      },
      subjects: {
        nameLower: "name_lower",
        createdAt: "created_at"
      },
      templates: {
        proofType: "proof_type",
        recipientType: "recipient_type",
        recipientValue: "recipient_value",
        recipientValueLower: "recipient_value_lower",
        createdAt: "created_at",
        createdAtClient: "created_at_client",
        createdBy: "created_by",
        createdByEmail: "created_by_email",
        sentBatchId: "sent_batch_id"
      },
      entries: {
        timestamp: "created_at",
        createdAt: "created_at",
        workMood: "work_mood",
        workMoods: "work_moods",
        attachmentCount: "attachment_count",
        fileId: "file_id",
        templateId: "template_id",
        templateTitle: "template_title"
      },
      comments: {
        createdAt: "created_at",
        authorEmail: "author_email",
        authorRole: "author_role",
        authorUserId: "author_user_id",
        authorUid: "author_user_id"
      },
      templateResponses: {
        templateId: "template_id",
        templateTitle: "template_title",
        proofType: "proof_type",
        recipientType: "recipient_type",
        recipientValue: "recipient_value",
        userId: "user_id",
        userEmail: "user_email",
        userEmailLower: "user_email_lower",
        createdAt: "created_at",
        updatedAt: "updated_at"
      },
      reflections: {
        dateKey: "date_key",
        createdAt: "created_at"
      }
    };
    if (field === "__name__") {
      return "id";
    }
    return (maps[kind] && maps[kind][field]) || field;
  }

  function columnToData(kind, row) {
    row = row || {};
    if (kind === "profiles") {
      return {
        email: row.email || "",
        emailLower: row.email_lower || "",
        displayName: row.display_name || "",
        name: row.name || "",
        className: row.class_name || "",
        classNameLower: row.class_name_lower || "",
        gender: row.gender || "",
        gems: Number(row.gems) || 0,
        avatarOutfit: row.avatar_outfit || "default",
        greenShirtUnlocked: Boolean(row.green_shirt_unlocked),
        redShirtUnlocked: Boolean(row.red_shirt_unlocked),
        redBlueShirtUnlocked: Boolean(row.red_blue_shirt_unlocked),
        createdAt: makeTimestamp(row.created_at),
        updatedAt: makeTimestamp(row.updated_at)
      };
    }
    if (kind === "subjects") {
      return {
        name: row.name || "",
        value: row.value || row.name || "",
        nameLower: row.name_lower || "",
        createdAt: makeTimestamp(row.created_at)
      };
    }
    if (kind === "templates") {
      return {
        title: row.title || "",
        subject: row.subject || "",
        subjects: Array.isArray(row.subjects) ? row.subjects : [],
        pillar: row.pillar || "",
        pillars: Array.isArray(row.pillars) ? row.pillars : [],
        instructions: row.instructions || "",
        proofType: row.proof_type || "",
        annotation: row.annotation || "",
        output: row.output || "",
        recipientType: row.recipient_type || "",
        recipientValue: row.recipient_value || "",
        recipientValueLower: row.recipient_value_lower || "",
        createdBy: row.created_by || "",
        createdByEmail: row.created_by_email || "",
        createdAt: makeTimestamp(row.created_at),
        createdAtClient: Number(row.created_at_client) || 0,
        sentBatchId: row.sent_batch_id || ""
      };
    }
    if (kind === "entries") {
      return {
        value: row.value || "",
        title: row.title || "",
        note: row.note || "",
        pillar: row.pillar || "",
        pillars: Array.isArray(row.pillars) ? row.pillars : [],
        subjects: Array.isArray(row.subjects) ? row.subjects : [],
        workMood: row.work_mood || "",
        workMoods: Array.isArray(row.work_moods) ? row.work_moods : [],
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        attachmentCount: Number(row.attachment_count) || 0,
        source: row.source || "",
        fileId: row.file_id || "",
        templateId: row.template_id || "",
        templateTitle: row.template_title || "",
        timestamp: makeTimestamp(row.created_at),
        createdAt: makeTimestamp(row.created_at)
      };
    }
    if (kind === "comments") {
      return {
        text: row.text || "",
        authorEmail: row.author_email || "",
        authorRole: row.author_role || "",
        isGuide: String(row.author_role || "").toLowerCase() === "guide",
        createdAt: makeTimestamp(row.created_at)
      };
    }
    if (kind === "templateResponses") {
      return {
        templateId: row.template_id || "",
        templateTitle: row.template_title || "",
        subject: row.subject || "",
        proofType: row.proof_type || "",
        response: row.response || "",
        subjects: Array.isArray(row.subjects) ? row.subjects : [],
        pillars: Array.isArray(row.pillars) ? row.pillars : [],
        recipientType: row.recipient_type || "",
        recipientValue: row.recipient_value || "",
        userId: row.user_id || "",
        userEmail: row.user_email || "",
        userEmailLower: row.user_email_lower || "",
        createdAt: makeTimestamp(row.created_at),
        updatedAt: makeTimestamp(row.updated_at)
      };
    }
    if (kind === "reflections") {
      return {
        dateKey: row.date_key || "",
        curiosity: Number(row.curiosity) || 0,
        values: Number(row.values) || 0,
        independence: Number(row.independence) || 0,
        mood: row.mood || "",
        createdAt: makeTimestamp(row.created_at)
      };
    }
    return row;
  }

  function tableForKind(kind) {
    return {
      profiles: "profiles",
      subjects: "subjects",
      templates: "templates",
      entries: "portfolio_entries",
      comments: "portfolio_comments",
      templateResponses: "template_responses",
      reflections: "daily_reflections"
    }[kind] || "";
  }

  function idForRow(kind, row) {
    if (kind === "templateResponses") {
      return row.template_id || row.id;
    }
    if (kind === "reflections") {
      return row.date_key || row.id;
    }
    return row.id;
  }

  function mapUser(user) {
    if (!user) {
      return null;
    }
    const meta = user.user_metadata || {};
    return {
      uid: user.id,
      id: user.id,
      email: user.email || "",
      displayName: meta.full_name || meta.name || user.email || "",
      photoURL: meta.avatar_url || ""
    };
  }

  function hasAuthResultInUrl() {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    return /(?:access_token|refresh_token|error|error_description)=/.test(hash)
      || /(?:code|error|error_description)=/.test(search);
  }

  function clearAuthResultFromUrl() {
    if (!hasAuthResultInUrl() || !window.history || !window.history.replaceState) {
      return;
    }
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }

  function payloadFor(kind, rawData, context) {
    const data = rawData || {};
    const payload = {};
    Object.keys(data).forEach(function (key) {
      if (key === "id" || isIncrement(data[key])) {
        return;
      }
      payload[fieldToColumn(kind, key)] = resolveValue(data[key]);
    });

    if (kind === "profiles") {
      payload.id = context.docId;
      payload.updated_at = payload.updated_at || nowIso();
      if (payload.email && !payload.email_lower) {
        payload.email_lower = normalizeEmail(payload.email);
      }
      if (payload.class_name && !payload.class_name_lower) {
        payload.class_name_lower = String(payload.class_name).trim().toLowerCase();
      }
    }
    if (kind === "entries") {
      payload.user_id = context.userId;
      if (payload.template_id && !isUuid(payload.template_id)) {
        payload.template_id = null;
      }
    }
    if (kind === "comments") {
      payload.entry_id = context.entryId;
      payload.author_user_id = payload.author_user_id || context.userId;
      if (!payload.author_role && data.isGuide) {
        payload.author_role = "guide";
      }
    }
    if (kind === "templateResponses") {
      payload.user_id = context.userId;
      payload.template_id = payload.template_id || context.docId;
      if (payload.user_email && !payload.user_email_lower) {
        payload.user_email_lower = normalizeEmail(payload.user_email);
      }
    }
    if (kind === "reflections") {
      payload.user_id = context.userId;
      payload.date_key = context.docId;
    }
    if (kind === "templates") {
      if (payload.recipient_value && !payload.recipient_value_lower) {
        payload.recipient_value_lower = String(payload.recipient_value).trim().toLowerCase();
      }
    }

    return stripUndefined(payload);
  }

  async function getAuthProfileDefaults(docId, payload) {
    let user = null;
    try {
      if (supabase && supabase.auth && typeof supabase.auth.getUser === "function") {
        const result = await supabase.auth.getUser();
        user = result && result.data ? result.data.user : null;
      }
    } catch (error) {
      console.warn("Unable to read Supabase user for profile defaults:", error);
    }

    const meta = user && user.user_metadata ? user.user_metadata : {};
    const email = payload.email || (user && user.email) || "";
    if (!email) {
      throw new Error("Cannot create profile without an authenticated email.");
    }

    return {
      id: docId,
      email: email,
      email_lower: payload.email_lower || normalizeEmail(email),
      display_name: payload.display_name || meta.full_name || meta.name || email,
      created_at: payload.created_at || nowIso(),
      updated_at: payload.updated_at || nowIso()
    };
  }

  async function ensureProfileExists(docId, payload) {
    const defaults = await getAuthProfileDefaults(docId, payload || {});
    const insertPayload = Object.assign({}, defaults, payload || {}, {
      id: docId,
      email: (payload && payload.email) || defaults.email,
      email_lower: (payload && payload.email_lower) || normalizeEmail((payload && payload.email) || defaults.email)
    });

    const { error } = await supabase
      .from("profiles")
      .insert(insertPayload);
    if (error && error.code !== "23505") {
      throw error;
    }
  }

  async function upsertProfile(docId, data) {
    const payload = payloadFor("profiles", data, { docId: docId });
    const gemsIncrement = data && isIncrement(data.gems) ? data.gems.amount : 0;
    if (gemsIncrement) {
      delete payload.gems;
    }

    if (Object.keys(payload).length > 1) {
      const updatePayload = Object.assign({}, payload);
      delete updatePayload.id;

      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", docId)
        .select("id")
        .maybeSingle();
      if (updateError) {
        throw updateError;
      }
      if (!updatedProfile) {
        await ensureProfileExists(docId, payload);
      }
    }
    if (gemsIncrement) {
      if (Object.keys(payload).length <= 1) {
        await ensureProfileExists(docId, payload);
      }
      const { error } = await supabase.rpc("increment_gems", {
        p_user_id: docId,
        p_amount: gemsIncrement
      });
      if (error) {
        throw error;
      }
    }
  }

  class CompatDocumentSnapshot {
    constructor(ref, row, kind) {
      this.ref = ref;
      this.id = ref.id;
      this._row = row || null;
      this._kind = kind;
    }

    get exists() {
      return Boolean(this._row);
    }

    data() {
      if (!this._row) {
        return undefined;
      }
      return columnToData(this._kind, this._row);
    }
  }

  class CompatQuerySnapshot {
    constructor(docs) {
      this.docs = docs || [];
      this.empty = this.docs.length === 0;
      this.size = this.docs.length;
    }

    forEach(callback) {
      this.docs.forEach(callback);
    }
  }

  class CompatDocumentReference {
    constructor(collectionRef, id) {
      this.collectionRef = collectionRef;
      this.id = id || randomId();
    }

    collection(name) {
      const parent = this.collectionRef;
      if (parent.kind === "profiles" && name === "data") {
        return new CompatCollectionReference("entries", { userId: this.id });
      }
      if (parent.kind === "profiles" && name === "dailyReflections") {
        return new CompatCollectionReference("reflections", { userId: this.id });
      }
      if (parent.kind === "profiles" && name === "templateResponses") {
        return new CompatCollectionReference("templateResponses", { userId: this.id });
      }
      if (parent.kind === "entries" && name === "comments") {
        return new CompatCollectionReference("comments", {
          userId: parent.context.userId,
          entryId: this.id
        });
      }
      throw new Error("Unsupported subcollection: " + name);
    }

    async get() {
      const kind = this.collectionRef.kind;
      const table = tableForKind(kind);
      if (!supabase || !table) {
        return new CompatDocumentSnapshot(this, null, kind);
      }

      let query = supabase.from(table).select("*");
      if (kind === "entries" && String(this.id || "").startsWith("template-")) {
        query = query
          .eq("user_id", this.collectionRef.context.userId)
          .eq("template_id", this.id.slice("template-".length));
      } else if (kind === "templateResponses") {
        query = query
          .eq("user_id", this.collectionRef.context.userId)
          .eq("template_id", this.id);
      } else if (kind === "reflections") {
        query = query
          .eq("user_id", this.collectionRef.context.userId)
          .eq("date_key", this.id);
      } else {
        query = query.eq("id", this.id);
        if (kind === "entries" && this.collectionRef.context.userId) {
          query = query.eq("user_id", this.collectionRef.context.userId);
        }
        if (kind === "comments" && this.collectionRef.context.entryId) {
          query = query.eq("entry_id", this.collectionRef.context.entryId);
        }
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        throw error;
      }
      return new CompatDocumentSnapshot(this, data || null, kind);
    }

    async set(data, options) {
      const kind = this.collectionRef.kind;
      const merge = Boolean(options && options.merge);

      if (!supabase) {
        throw new Error("Supabase client is not available.");
      }
      if (kind === "profiles") {
        await upsertProfile(this.id, data || {});
        return;
      }

      const table = tableForKind(kind);
      let payload = payloadFor(kind, data || {}, Object.assign({}, this.collectionRef.context, { docId: this.id }));

      if (kind === "entries" && String(this.id || "").startsWith("template-")) {
        const templateId = this.id.slice("template-".length);
        payload.template_id = templateId;
        const { error } = await supabase
          .from(table)
          .upsert(payload, { onConflict: "user_id,template_id" });
        if (error) {
          throw error;
        }
        return;
      }

      if (kind === "templateResponses") {
        const { error } = await supabase
          .from(table)
          .upsert(payload, { onConflict: "user_id,template_id" });
        if (error) {
          throw error;
        }
        return;
      }

      if (kind === "reflections") {
        const { error } = await supabase
          .from(table)
          .upsert(payload, { onConflict: "user_id,date_key" });
        if (error) {
          throw error;
        }
        return;
      }

      if (kind !== "subjects" && kind !== "templates" && kind !== "comments" && isUuid(this.id)) {
        payload.id = this.id;
      } else if ((kind === "subjects" || kind === "templates" || kind === "comments") && this.id) {
        payload.id = this.id;
      }

      if (merge && payload.id) {
        const { error } = await supabase
          .from(table)
          .upsert(payload, { onConflict: "id" });
        if (error) {
          throw error;
        }
        return;
      }

      const { error } = await supabase
        .from(table)
        .upsert(payload, { onConflict: "id" });
      if (error) {
        throw error;
      }
    }

    async delete() {
      const kind = this.collectionRef.kind;
      const table = tableForKind(kind);
      if (!supabase || !table) {
        return;
      }

      let query = supabase.from(table).delete();
      if (kind === "templateResponses") {
        query = query
          .eq("user_id", this.collectionRef.context.userId)
          .eq("template_id", this.id);
      } else if (kind === "reflections") {
        query = query
          .eq("user_id", this.collectionRef.context.userId)
          .eq("date_key", this.id);
      } else {
        query = query.eq("id", this.id);
        if (kind === "entries" && this.collectionRef.context.userId) {
          query = query.eq("user_id", this.collectionRef.context.userId);
        }
      }
      const { error } = await query;
      if (error) {
        throw error;
      }
    }
  }

  class CompatQuery {
    constructor(kind, context, filters, order, maxRows) {
      this.kind = kind;
      this.context = context || {};
      this.filters = filters || [];
      this.order = order || null;
      this.maxRows = maxRows || null;
    }

    where(field, op, value) {
      return new CompatQuery(this.kind, this.context, this.filters.concat([{ field, op, value }]), this.order, this.maxRows);
    }

    orderBy(field, direction) {
      return new CompatQuery(this.kind, this.context, this.filters, { field, direction }, this.maxRows);
    }

    limit(count) {
      return new CompatQuery(this.kind, this.context, this.filters, this.order, Number(count) || null);
    }

    _refForRow(row) {
      return new CompatDocumentReference(new CompatCollectionReference(this.kind, this.context), idForRow(this.kind, row));
    }

    _applyBaseFilters(query) {
      if (this.kind === "entries" && this.context.userId) {
        query = query.eq("user_id", this.context.userId);
      }
      if (this.kind === "comments" && this.context.entryId) {
        query = query.eq("entry_id", this.context.entryId);
      }
      if (this.kind === "templateResponses" && this.context.userId) {
        query = query.eq("user_id", this.context.userId);
      }
      if (this.kind === "reflections" && this.context.userId) {
        query = query.eq("user_id", this.context.userId);
      }
      return query;
    }

    _applyQueryParts(query) {
      query = this._applyBaseFilters(query);
      this.filters.forEach((filter) => {
        const column = fieldToColumn(this.kind, filter.field);
        if (filter.op !== "==") {
          throw new Error("Unsupported query operator: " + filter.op);
        }
        query = query.eq(column, filter.value);
      });
      if (this.order && this.order.field) {
        query = query.order(fieldToColumn(this.kind, this.order.field), {
          ascending: String(this.order.direction || "asc").toLowerCase() !== "desc"
        });
      }
      if (this.maxRows) {
        query = query.limit(this.maxRows);
      }
      return query;
    }

    async get() {
      const table = tableForKind(this.kind);
      if (!supabase || !table) {
        return new CompatQuerySnapshot([]);
      }
      const { data, error } = await this._applyQueryParts(supabase.from(table).select("*"));
      if (error) {
        throw error;
      }
      const docs = (Array.isArray(data) ? data : []).map((row) => {
        const ref = this._refForRow(row);
        return new CompatDocumentSnapshot(ref, row, this.kind);
      });
      return new CompatQuerySnapshot(docs);
    }

    onSnapshot(callback, errorCallback) {
      let stopped = false;
      let timer = 0;
      const emit = async () => {
        if (stopped) {
          return;
        }
        try {
          const snapshot = await this.get();
          if (!stopped) {
            callback(snapshot);
          }
        } catch (error) {
          if (typeof errorCallback === "function") {
            errorCallback(error);
          } else {
            console.error("Supabase compat listener failed:", error);
          }
        }
      };
      const schedule = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(emit, 80);
      };
      emit();

      let channel = null;
      const table = tableForKind(this.kind);
      if (supabase && typeof supabase.channel === "function" && table) {
        channel = supabase
          .channel("compat-" + table + "-" + randomId())
          .on("postgres_changes", { event: "*", schema: "public", table: table }, schedule)
          .subscribe();
      }

      return function unsubscribe() {
        stopped = true;
        window.clearTimeout(timer);
        if (channel && supabase && typeof supabase.removeChannel === "function") {
          supabase.removeChannel(channel);
        }
      };
    }
  }

  class CompatCollectionReference extends CompatQuery {
    constructor(kind, context) {
      super(kind, context || {}, [], null, null);
    }

    doc(id) {
      return new CompatDocumentReference(this, id || randomId());
    }

    async add(data) {
      const docRef = this.doc();
      await docRef.set(data || {});
      return docRef;
    }
  }

  class CompatFirestore {
    collection(name) {
      if (name === "users") {
        return new CompatCollectionReference("profiles");
      }
      if (name === "subjects") {
        return new CompatCollectionReference("subjects");
      }
      if (name === "templates") {
        return new CompatCollectionReference("templates");
      }
      throw new Error("Unsupported collection: " + name);
    }

    collectionGroup(name) {
      if (name === "templateResponses") {
        return new CompatCollectionReference("templateResponses");
      }
      throw new Error("Unsupported collection group: " + name);
    }

    batch() {
      const operations = [];
      return {
        set: function (ref, data, options) {
          operations.push(function () {
            return ref.set(data, options);
          });
        },
        commit: function () {
          return Promise.all(operations.map(function (operation) {
            return operation();
          }));
        }
      };
    }

    async runTransaction(callback) {
      const operations = [];
      const transaction = {
        get: function (ref) {
          return ref.get();
        },
        set: function (ref, data, options) {
          operations.push(function () {
            return ref.set(data, options);
          });
        }
      };
      const result = await callback(transaction);
      await Promise.all(operations.map(function (operation) {
        return operation();
      }));
      return result;
    }
  }

  const authCompat = {
    _currentUser: null,
    get currentUser() {
      return this._currentUser;
    },
    async signOut() {
      if (!supabase || !supabase.auth) {
        return;
      }
      await supabase.auth.signOut();
    },
    onAuthStateChanged(callback) {
      if (!supabase || !supabase.auth) {
        window.setTimeout(function () {
          callback(null);
        }, 0);
        return function () {};
      }

      let settled = false;
      const authResultInUrl = hasAuthResultInUrl();

      const applySession = function (session) {
        settled = true;
        authCompat._currentUser = mapUser(session && session.user ? session.user : null);
        if (authCompat._currentUser) {
          clearAuthResultFromUrl();
        }
        callback(authCompat._currentUser);
      };

      const subscription = supabase.auth.onAuthStateChange(function (_event, session) {
        if (authResultInUrl && !session && !settled) {
          return;
        }
        applySession(session);
      });

      window.setTimeout(function () {
        if (settled && !(authResultInUrl && !authCompat._currentUser)) {
          return;
        }
        supabase.auth.getSession().then(function (result) {
          applySession(result && result.data ? result.data.session : null);
        }).catch(function (error) {
          console.error("Supabase auth session failed:", error);
          applySession(null);
        });
      }, authResultInUrl ? 900 : 0);

      return function unsubscribe() {
        const sub = subscription && subscription.data ? subscription.data.subscription : null;
        if (sub && typeof sub.unsubscribe === "function") {
          sub.unsubscribe();
        }
      };
    }
  };

  const firestoreFactory = function () {
    return new CompatFirestore();
  };
  firestoreFactory.FieldValue = {
    serverTimestamp: function () {
      return SERVER_TIMESTAMP;
    },
    increment: increment
  };

  window.firebase = {
    initializeApp: function () {
      return {};
    },
    auth: function () {
      return authCompat;
    },
    firestore: firestoreFactory
  };
})();

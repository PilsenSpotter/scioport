// Supabase-based "Data" debug page.
// - Normal mode: shows current user's portfolio entries.
// - Admin mode: for guides, shows recent portfolio entries across users.
(function () {
  const supabase = window.supabaseClient;
  const loginUrl = new URL("login/index.html", window.location.href).toString();

  let adminMode = false;
  let currentUser = null;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getGuideEmails() {
    if (Array.isArray(window.SCIO_GUIDE_EMAILS) && window.SCIO_GUIDE_EMAILS.length) {
      return window.SCIO_GUIDE_EMAILS.map(function (item) {
        return String(item || "").trim().toLowerCase();
      }).filter(Boolean);
    }
    return [
      "oliver.bocko@scioskola.cz",
      "tobias.pokorny@scioskola.cz",
      "jiri.prevorovsky@scioskola.cz"
    ];
  }

  function hasGuideAccess(email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return getGuideEmails().indexOf(normalized) >= 0;
  }

  async function renderData() {
    const emailEl = $("user-email");
    const dataEl = $("user-data");
    if (!emailEl || !dataEl) {
      return;
    }

    if (!currentUser || !currentUser.id) {
      window.location.replace(loginUrl);
      return;
    }

    if (!supabase) {
      emailEl.textContent = "Supabase není dostupný.";
      dataEl.innerHTML = "";
      return;
    }

    dataEl.innerHTML = "";

    if (!adminMode) {
      emailEl.textContent = currentUser.email || "";
      const { data: rows, error } = await supabase
        .from("portfolio_entries")
        .select("id,value,created_at")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        console.error("Load entries failed:", error);
        dataEl.innerHTML = '<span style="color:#b91c1c">Nepodařilo se načíst data.</span>';
        return;
      }

      const parts = (Array.isArray(rows) ? rows : []).map(function (row) {
        const value = String(row && row.value ? row.value : "").trim();
        return value ? "<div>" + esc(value) + "</div>" : "";
      }).filter(Boolean);

      dataEl.innerHTML = parts.length
        ? parts.join("")
        : '<span style="color:gray;">No data</span>';
      return;
    }

    if (!hasGuideAccess(currentUser.email)) {
      emailEl.textContent = "Admin Mode";
      dataEl.innerHTML = '<span style="color:#b91c1c">Přístup má pouze průvodce.</span>';
      return;
    }

    emailEl.textContent = "Admin Mode: All Users (recent)";

    const { data: entries, error: entriesError } = await supabase
      .from("portfolio_entries")
      .select("user_id,value,created_at")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (entriesError) {
      console.error("Load admin entries failed:", entriesError);
      dataEl.innerHTML = '<span style="color:#b91c1c">Nepodařilo se načíst data.</span>';
      return;
    }

    const normalizedEntries = Array.isArray(entries) ? entries : [];
    const userIds = Array.from(new Set(normalizedEntries.map(function (row) {
      return row && row.user_id ? String(row.user_id) : "";
    }).filter(Boolean)));

    const profileMap = new Map();
    if (userIds.length) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,email,display_name,name")
        .in("id", userIds)
        .limit(2000);
      if (profilesError) {
        console.warn("Load profiles failed:", profilesError);
      } else {
        (Array.isArray(profiles) ? profiles : []).forEach(function (row) {
          profileMap.set(String(row.id), String(row.email || "").trim());
        });
      }
    }

    const byUser = new Map();
    normalizedEntries.forEach(function (row) {
      const userId = row && row.user_id ? String(row.user_id) : "";
      const value = String(row && row.value ? row.value : "").trim();
      if (!userId || !value) {
        return;
      }
      if (!byUser.has(userId)) {
        byUser.set(userId, []);
      }
      byUser.get(userId).push(value);
    });

    const html = Array.from(byUser.entries()).map(function (entry) {
      const userId = entry[0];
      const values = entry[1] || [];
      const email = profileMap.get(userId) || userId;
      const lines = values.slice(0, 80).map(function (value) {
        return "<div>" + esc(value) + "</div>";
      });
      return "<h2>" + esc(email) + "</h2>" + (lines.length ? lines.join("") : '<span style="color:gray;">No data</span>') + "<hr>";
    }).join("");

    dataEl.innerHTML = html || '<span style="color:gray;">No data</span>';
  }

  async function handleAuthSession(session) {
    const user = session && session.user ? session.user : null;
    currentUser = user ? { id: user.id, email: user.email || "" } : null;
    if (!currentUser || !currentUser.id) {
      window.location.replace(loginUrl);
      return;
    }
    await renderData();
  }

  document.addEventListener("DOMContentLoaded", function () {
    const adminButton = $("admin");
    if (adminButton) {
      adminButton.addEventListener("click", async function () {
        adminMode = !adminMode;
        await renderData();
      });
    }
  });

  if (!supabase || !supabase.auth) {
    console.error("Supabase client not available. Check supabase/config.js.");
    return;
  }

  supabase.auth.onAuthStateChange(function (_event, session) {
    handleAuthSession(session);
  });

  supabase.auth.getSession().then(function (result) {
    const session = result && result.data ? result.data.session : null;
    handleAuthSession(session);
  });
})();

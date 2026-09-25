const SUPA_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = supabase.createClient(SUPA_URL, SUPA_KEY);
let session = null;

const $ = (id) => document.getElementById(id);

function show(id) {
  ["view-hour", "view-wall", "view-desk", "view-auth"].forEach((v) => {
    const el = $(v);
    if (!el) return;
    el.classList.toggle("hidden", v !== id && !(id === "view-hour" && v === "view-wall"));
  });
  if (id === "view-desk") {
    $("view-hour").classList.add("hidden");
    $("view-wall").classList.add("hidden");
    $("view-auth").classList.add("hidden");
    $("view-desk").classList.remove("hidden");
  }
  if (id === "view-auth") {
    $("view-hour").classList.add("hidden");
    $("view-wall").classList.add("hidden");
    $("view-desk").classList.add("hidden");
    $("view-auth").classList.remove("hidden");
  }
  if (id === "view-wall") {
    $("view-hour").classList.remove("hidden");
    $("view-wall").classList.remove("hidden");
    $("view-desk").classList.add("hidden");
    $("view-auth").classList.add("hidden");
  }
}

function hourKey(d = new Date()) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x.toISOString().slice(0, 13);
}

async function loadHour() {
  const { data } = await sb.from("tide_hours").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return;
  $("hourKicker").textContent = data.kicker || "This hour";
  $("hourHeadline").textContent = data.headline;
  $("hourBody").textContent = data.body;
  const pulse = Array.isArray(data.pulse) ? data.pulse : [];
  $("hourPulse").innerHTML = pulse.map((p) => `<li><b>${escapeHtml(p.label)}</b>${escapeHtml(p.value)}</li>`).join("");
  $("hourTick").textContent = "Hour key " + data.hour_key;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function card(slip, mine) {
  const when = new Date(slip.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const actions = mine
    ? `<div class="meta"><button class="tiny" data-toggle="${slip.id}" data-pub="${slip.is_public}">${slip.is_public ? "Unpin" : "Pin to wall"}</button><button class="tiny" data-del="${slip.id}">Burn</button></div>`
    : `<div class="meta">${when}</div>`;
  return `<article class="card"><h3>${escapeHtml(slip.title)}</h3><p>${escapeHtml(slip.body)}</p>${actions}</article>`;
}

async function loadWall() {
  const { data } = await sb.from("tide_slips").select("id,title,body,created_at,is_public").eq("is_public", true).order("created_at", { ascending: false }).limit(40);
  $("wall").innerHTML = (data && data.length) ? data.map((s) => card(s, false)).join("") : `<p class="lede">The wall is empty. Pin a slip from your desk.</p>`;
}

async function loadMine() {
  if (!session) {
    $("mine").innerHTML = "";
    $("slipForm").classList.add("hidden");
    $("deskHint").textContent = "Sign in to keep slips. Nothing leaves the drawer unless you pin it.";
    return;
  }
  $("slipForm").classList.remove("hidden");
  $("deskHint").textContent = "Drafts stay here. Pin one if the room should see it.";
  const { data } = await sb.from("tide_slips").select("*").eq("author_id", session.user.id).order("created_at", { ascending: false });
  $("mine").innerHTML = (data && data.length) ? data.map((s) => card(s, true)).join("") : `<p class="lede">No slips yet.</p>`;
}

function paintWho() {
  const btn = $("authBtn");
  if (session) {
    btn.textContent = "Sign out";
    $("who").textContent = session.user.email;
  } else {
    btn.textContent = "Sign in";
    $("who").textContent = "Guest";
  }
}

document.querySelectorAll("[data-go]").forEach((b) => {
  b.addEventListener("click", () => {
    const go = b.getAttribute("data-go");
    if (go === "desk") show("view-desk");
    else show("view-wall");
  });
});

$("authBtn").addEventListener("click", async () => {
  if (session) {
    await sb.auth.signOut();
    return;
  }
  show("view-auth");
});

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("authErr").textContent = "";
  const fd = new FormData(e.target);
  const email = fd.get("email");
  const password = fd.get("password");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  $("authErr").textContent = error ? error.message : "";
});

$("signUpBtn").addEventListener("click", async () => {
  $("authErr").textContent = "";
  const fd = new FormData($("authForm"));
  const email = fd.get("email");
  const password = fd.get("password");
  const { error } = await sb.auth.signUp({ email, password });
  $("authErr").textContent = error ? error.message : "Account created. If email confirm is on, check your inbox; otherwise sign in.";
});

$("slipForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session) return;
  const fd = new FormData(e.target);
  const { error } = await sb.from("tide_slips").insert({
    author_id: session.user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: fd.get("is_public") === "on",
  });
  if (error) alert(error.message);
  else {
    e.target.reset();
    loadMine();
    loadWall();
  }
});

$("mine").addEventListener("click", async (e) => {
  const t = e.target;
  if (t.dataset.del) {
    await sb.from("tide_slips").delete().eq("id", t.dataset.del);
    loadMine();
    loadWall();
  }
  if (t.dataset.toggle) {
    const next = t.dataset.pub !== "true";
    await sb.from("tide_slips").update({ is_public: next, updated_at: new Date().toISOString() }).eq("id", t.dataset.toggle);
    loadMine();
    loadWall();
  }
});

sb.auth.onAuthStateChange((_e, s) => {
  session = s;
  paintWho();
  loadMine();
  if (s) show("view-desk");
});

(async function boot() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  paintWho();
  await loadHour();
  await loadWall();
  await loadMine();
})();

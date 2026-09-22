let __fakePairRealtimeResolve;
let __fakePairRealtimeReject;
window.FakePairRealtimeReady = new Promise((resolve,reject)=>{__fakePairRealtimeResolve=resolve;__fakePairRealtimeReject=reject;});
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getDatabase, ref, set, update, onValue, onDisconnect, runTransaction, push, serverTimestamp, remove } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDvdT2J831GjXtzqApPqYguOLaGLHzW-Ho",
  authDomain: "fakepair.firebaseapp.com",
  databaseURL: "https://fakepair-default-rtdb.firebaseio.com",
  projectId: "fakepair",
  storageBucket: "fakepair.firebasestorage.app",
  messagingSenderId: "719898123313",
  appId: "1:719898123313:web:a3275193cfbb66c77ac910",
  measurementId: "G-C66P0NC61V"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let uid = null;
let queueRef = null;
let queueListener = null;
let messagesListener = null;
let activeMatchId = null;
let activePartnerRole = null;
let leaving = false;

const status = (fn, text) => { if (fn) fn(text); };

async function ensureAuth() {
  if (auth.currentUser) {
    uid = auth.currentUser.uid;
    return;
  }
  const credential = await signInAnonymously(auth);
  uid = credential.user.uid;
}

function oppositeRole(role) {
  return role === "Fake Girlfriend" ? "Fake Boyfriend" : "Fake Girlfriend";
}

async function publishQueue(partnerRole) {
  const lookingFor = oppositeRole(partnerRole);
  queueRef = ref(db, "mysteryQueue/" + uid);

  await set(queueRef, {
    status: "waiting",
    partnerRole,
    lookingFor,
    joinedAt: serverTimestamp()
  });

  onDisconnect(queueRef).remove();
  return lookingFor;
}

async function tryClaim(candidateId, partnerRole, opts) {
  const candidateRef = ref(db, "mysteryQueue/" + candidateId);

  const tx = await runTransaction(candidateRef, current => {
    if (!current || current.status !== "waiting") return;
    if (current.lookingFor !== partnerRole) return;
    return {
      ...current,
      status: "matched",
      matchedBy: uid
    };
  });

  if (!tx.committed) return false;

  const matchRef = ref(db, "mysteryMatches/" + candidateId);
  await set(matchRef, {
    userA: candidateId,
    userB: uid,
    partnerRoleA: tx.snapshot.val().partnerRole,
    partnerRoleB: partnerRole,
    status: "active",
    createdAt: serverTimestamp()
  });

  await update(ref(db, "mysteryQueue/" + uid), {
    status: "matched",
    matchId: candidateId
  });

  await update(ref(db, "mysteryQueue/" + candidateId), {
    status: "matched",
    matchId: candidateId
  });

  return true;
}

function connectMatch(matchId, opts) {
  if (activeMatchId === matchId && messagesListener) return;

  activeMatchId = matchId;
  status(opts.setStatus, "Mystery connection active");

  const messagesRef = ref(db, "mysteryChats/" + matchId + "/messages");

  if (messagesListener) messagesListener();
  messagesListener = onValue(messagesRef, snapshot => {
    snapshot.forEach(child => {
      const message = child.val();
      if (!message || message.sender === uid) return;

      const el = document.createElement("div");
      el.className = "chat-bubble received";
      el.dataset.msgId = child.key;
      el.textContent = message.text;

      if (!document.querySelector('[data-msg-id="' + child.key + '"]')) {
        document.getElementById("chatMessages").appendChild(el);
        document.getElementById("chatMessages").scrollTop =
          document.getElementById("chatMessages").scrollHeight;
      }
    });
  });
}

async function start(opts) {
  leaving = false;

  try {
    await ensureAuth();

    activePartnerRole = opts.partner.role;
    const lookingFor = await publishQueue(activePartnerRole);

    status(opts.setStatus, "Searching for " + lookingFor + "…");

    if (queueListener) queueListener();

    queueListener = onValue(ref(db, "mysteryQueue"), async snapshot => {
      if (leaving || activeMatchId) return;

      const candidates = [];
      snapshot.forEach(child => {
        const value = child.val();
        if (
          child.key !== uid &&
          value &&
          value.status === "waiting" &&
          value.lookingFor === activePartnerRole
        ) {
          candidates.push({ id: child.key, joinedAt: value.joinedAt || 0 });
        }
      });

      candidates.sort((a, b) => Number(a.joinedAt) - Number(b.joinedAt));

      for (const candidate of candidates) {
        if (await tryClaim(candidate.id, activePartnerRole, opts)) break;
      }
    });

    // Watch our own queue record. Both users receive the same matchId.
    onValue(ref(db, "mysteryQueue/" + uid), snapshot => {
      const value = snapshot.val();
      if (!value?.matchId || activeMatchId) return;
      connectMatch(value.matchId, opts);
    });

  } catch (error) {
    console.error("FakePair realtime error:", error);
    status(opts.setStatus, "Realtime connection error: " + (error?.message || "Check Firebase setup"));
  }
}

async function send(text) {
  if (!activeMatchId || !uid) return false;

  const messageRef = push(ref(db, "mysteryChats/" + activeMatchId + "/messages"));

  await set(messageRef, {
    sender: uid,
    text,
    createdAt: serverTimestamp()
  });

  const el = document.createElement("div");
  el.className = "chat-bubble sent";
  el.dataset.msgId = messageRef.key;
  el.textContent = text;

  document.getElementById("chatMessages").appendChild(el);
  document.getElementById("chatMessages").scrollTop =
    document.getElementById("chatMessages").scrollHeight;

  return true;
}

async function leave() {
  leaving = true;

  if (queueListener) {
    queueListener();
    queueListener = null;
  }

  if (messagesListener) {
    messagesListener();
    messagesListener = null;
  }

  if (queueRef) {
    await remove(queueRef).catch(() => {});
    queueRef = null;
  }

  activeMatchId = null;
}

window.FakePairRealtime = { start, send, leave };
__fakePairRealtimeResolve(window.FakePairRealtime);

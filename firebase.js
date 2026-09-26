let __fakePairRealtimeResolve;
let __fakePairRealtimeReject;
window.FakePairRealtimeReady = new Promise((resolve,reject)=>{__fakePairRealtimeResolve=resolve;__fakePairRealtimeReject=reject;});
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getDatabase, ref, set, update, onValue, onDisconnect, runTransaction, push, serverTimestamp, remove, get } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

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
let ownQueueListener = null;
let messagesListener = null;
let revealListener = null;
let matchListener = null;
let activeMatchId = null;
let activePartnerRole = null;
let leaving = false;

const status = (fn, text) => { if (fn) fn(text); };

async function ensureAuth() {
  if (auth.currentUser) {
    uid = auth.currentUser.uid;
    console.info("FakePair Firebase auth ready:", uid);
    return;
  }
  try {
    const credential = await signInAnonymously(auth);
    uid = credential.user.uid;
    console.info("FakePair anonymous auth ready:", uid);
  } catch (error) {
    console.error("FakePair anonymous auth failed:", error);
    throw new Error("Firebase anonymous authentication is not enabled or is blocked.");
  }
}

function oppositeRole(role) {
  return role === "Fake Girlfriend" ? "Fake Boyfriend" : "Fake Girlfriend";
}

async function publishQueue(partnerRole) {
  const lookingFor = oppositeRole(partnerRole);
  queueRef = ref(db, "mysteryQueue/" + uid);

  console.info("FakePair queue publish:", uid, "lookingFor:", lookingFor);
  await set(queueRef, {
    status: "waiting",
    partnerRole,
    lookingFor,
    joinedAt: serverTimestamp()
  });

  await onDisconnect(queueRef).remove();
  console.info("FakePair queue published successfully:", uid);
  return lookingFor;
}

async function tryClaim(candidateId, partnerRole, opts) {
  if (uid >= candidateId) return false;

  const candidateRef = ref(db, "mysteryQueue/" + candidateId);
  const matchId = push(ref(db, "mysteryMatches")).key;

  const tx = await runTransaction(candidateRef, current => {
    if (!current || current.status !== "waiting") return;
    if (current.lookingFor !== partnerRole) return;

    return {
      ...current,
      status: "matched",
      matchId,
      matchedBy: uid
    };
  });

  if (!tx.committed) return false;

  const candidate = tx.snapshot.val();
  if (!candidate || candidate.matchId !== matchId) return false;

  await set(ref(db, "mysteryMatches/" + matchId), {
    userA: candidateId,
    userB: uid,
    partnerRoleA: candidate.partnerRole,
    partnerRoleB: partnerRole,
    status: "active",
    contextOwner: candidateId,
    createdAt: serverTimestamp()
  });

  await update(ref(db, "mysteryQueue/" + uid), {
    status: "matched",
    matchId,
    matchedWith: candidateId
  });

  await update(ref(db, "mysteryQueue/" + candidateId), {
    status: "matched",
    matchId,
    matchedWith: uid
  });

  // Connect the claimant immediately after the match is fully created.
  // The candidate will connect through its own queue listener.
  await connectMatch(matchId, opts);
  return true;
}

function watchRevealRequests(matchId, opts) {
  const requestsRef = ref(db, "mysteryMatches/" + matchId + "/revealRequests");

  if (revealListener) revealListener();
  revealListener = onValue(requestsRef, snapshot => {
    snapshot.forEach(child => {
      const request = child.val();
      if (!request || request.requester === uid) return;

      if (request.status === "pending" && opts?.onRevealRequest) {
        opts.onRevealRequest({ id: child.key });
      }
      if (request.status === "revealed" && opts?.onRevealResult) {
        opts.onRevealResult({ revealed: true, requestId: child.key });
      }
      if (request.status === "declined" && opts?.onRevealResult) {
        opts.onRevealResult({ revealed: false, requestId: child.key });
      }
    });
  });
}

async function connectMatch(matchId, opts) {
  if (activeMatchId === matchId && messagesListener) return;

  try {
    const matchSnap = await get(ref(db, "mysteryMatches/" + matchId));
    const match = matchSnap.val();

    if (!match || match.status !== "active" ||
        (match.userA !== uid && match.userB !== uid)) {
      console.warn("FakePair rejected unauthorized/stale match:", matchId);
      // The queue can briefly contain matchId before the match record exists.
      // Retry so the second participant cannot miss the connection.
      setTimeout(() => connectMatch(matchId, opts), 500);
      return;
    }

    activeMatchId = matchId;
    if (opts.onMatched) opts.onMatched({
      id: matchId,
      createdAt: match.createdAt,
      contextOwner: match.contextOwner === uid
    });

    status(opts.setStatus, "Mystery connection active");

    watchRevealRequests(matchId, opts);

    // The match is temporary. The AI context is written only after matching,
    // never continuously into the waiting queue.
    const matchRef = ref(db, "mysteryMatches/" + matchId);
    let contextDelivered = false;
    if (matchListener) matchListener();
    matchListener = onValue(matchRef, snapshot => {
      const value = snapshot.val();
      if (!value || value.status === "ended") {
        if (activeMatchId === matchId && opts?.onDisconnected) {
          opts.onDisconnected();
        }
        return;
      }
      if (!contextDelivered && Array.isArray(value.context) && value.context.length && opts?.onContext) {
        contextDelivered = true;
        opts.onContext(value.context);
      }
    });
    onDisconnect(matchRef).remove();

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
  } catch (error) {
    console.error("FakePair match verification failed:", error);
    status(opts.setStatus, "Mystery connection unavailable");
  }
}

async function start(opts) {
  leaving = false;

  try {
    await ensureAuth();

    activePartnerRole = opts.partner.role;
    const lookingFor = await publishQueue(activePartnerRole);

    status(opts.setStatus, "Searching for " + lookingFor + "…");

    if (queueListener) queueListener();

    queueListener = onValue(
      ref(db, "mysteryQueue"),
      async snapshot => {
        if (leaving || activeMatchId) return;

        console.info("FakePair queue update received. Users:", snapshot.size);

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

        console.info("FakePair compatible candidates:", candidates.length);

        for (const candidate of candidates) {
          try {
            if (await tryClaim(candidate.id, activePartnerRole, opts)) break;
          } catch (error) {
            console.error("FakePair match claim failed:", error);
          }
        }
      },
      error => {
        console.error("FakePair queue listener failed:", error);
        status(opts.setStatus, "Mystery connection unavailable");
      }
    );

    if (ownQueueListener) ownQueueListener();
    ownQueueListener = onValue(
      ref(db, "mysteryQueue/" + uid),
      snapshot => {
        const value = snapshot.val();
        console.info("FakePair own queue state:", value);
        if (!value?.matchId || activeMatchId) return;
        connectMatch(value.matchId, opts);
      },
      error => {
        console.error("FakePair own queue listener failed:", error);
        status(opts.setStatus, "Mystery connection unavailable");
      }
    );

  } catch (error) {
    console.error("FakePair realtime error:", error);
    const code = error?.code || "";
    if (code.includes("permission-denied")) {
      status(opts.setStatus, "Mystery connection unavailable");
    } else if (code.includes("auth")) {
      status(opts.setStatus, "Mystery connection unavailable");
    } else {
      status(opts.setStatus, "Mystery connection unavailable");
    }
  }
}

async function publishMatchContext(matchId, context) {
  if (!uid || !matchId || !Array.isArray(context)) return false;
  const matchRef = ref(db, "mysteryMatches/" + matchId);
  const snap = await get(matchRef);
  const match = snap.val();
  if (!match || match.status !== "active" || (match.userA !== uid && match.userB !== uid)) {
    return false;
  }
  await update(matchRef, {
    context: context.slice(-40),
    contextCreatedAt: serverTimestamp()
  });
  return true;
}

async function submitLearningExample(example) {
  if (!uid || !example || !example.userText || !example.reply) return false;
  const clean = value => String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\\/\\/\\S+/gi, "[link]")
    .replace(/\\b(?:\\+?91[- .]?)?[6-9]\\d{9}\\b/g, "[phone]")
    .slice(0, 500);
  try {
    const exampleRef = push(ref(db, "learningExamples/" + uid));
    await set(exampleRef, {
      userText: clean(example.userText),
      reply: clean(example.reply),
      partnerRole: String(example.partnerRole || ""),
      vibe: String(example.vibe || ""),
      mode: String(example.mode || "ai"),
      consentVersion: "2026-09-26-v1",
      createdAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("FakePair learning example failed:", error);
    return false;
  }
}

async function send(text) {
  if (!activeMatchId || !uid) return false;

  const matchSnap = await get(ref(db, "mysteryMatches/" + activeMatchId));
  const match = matchSnap.val();
  if (!match || match.status !== "active" ||
      (match.userA !== uid && match.userB !== uid)) {
    activeMatchId = null;
    return false;
  }

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

async function requestReveal() {
  if (!activeMatchId || !uid) return { mode: "none" };

  const matchSnap = await get(ref(db, "mysteryMatches/" + activeMatchId));
  const match = matchSnap.val();
  if (!match || match.status !== "active" ||
      (match.userA !== uid && match.userB !== uid)) {
    return { mode: "none" };
  }

  const requestRef = push(ref(db, "mysteryMatches/" + activeMatchId + "/revealRequests"));
  await set(requestRef, {
    requester: uid,
    status: "pending",
    createdAt: serverTimestamp()
  });

  return { mode: "human", requestId: requestRef.key };
}

async function respondReveal(requestId, reveal) {
  if (!activeMatchId || !requestId || !uid) return false;

  const requestRef = ref(db, "mysteryMatches/" + activeMatchId + "/revealRequests/" + requestId);
  const snap = await get(requestRef);
  const request = snap.val();
  if (!request || request.status !== "pending" || request.requester === uid) return false;

  await update(requestRef, {
    status: reveal ? "revealed" : "declined",
    responder: uid,
    respondedAt: serverTimestamp()
  });

  return true;
}

async function leave() {
  leaving = true;

  if (queueListener) {
    queueListener();
    queueListener = null;
  }
  if (ownQueueListener) {
    ownQueueListener();
    ownQueueListener = null;
  }
  if (messagesListener) {
    messagesListener();
    messagesListener = null;
  }
  if (revealListener) {
    revealListener();
    revealListener = null;
  }
  if (matchListener) {
    matchListener();
    matchListener = null;
  }

  const matchIdToDelete = activeMatchId;

  if (queueRef) {
    await remove(queueRef).catch(() => {});
    queueRef = null;
  }

  // Mystery chats are ephemeral: remove the entire match and its messages
  // as soon as either participant leaves.
  if (matchIdToDelete) {
    await remove(ref(db, "mysteryChats/" + matchIdToDelete)).catch(() => {});
    await remove(ref(db, "mysteryMatches/" + matchIdToDelete)).catch(() => {});
  }

  activeMatchId = null;
}

window.FakePairRealtime = { start, send, leave, requestReveal, respondReveal, publishMatchContext, submitLearningExample };
__fakePairRealtimeResolve(window.FakePairRealtime);

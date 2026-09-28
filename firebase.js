let __fakePairRealtimeResolve;
let __fakePairRealtimeReject;
window.FakePairRealtimeReady = new Promise((resolve,reject)=>{__fakePairRealtimeResolve=resolve;__fakePairRealtimeReject=reject;});

let initializeApp, getAuth, signInAnonymously;
let getDatabase, ref, set, update, onValue, onDisconnect, runTransaction, push, serverTimestamp, remove, get;

const firebaseInitPromise = (async () => {
  try {
    const [appMod, authMod, dbMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js")
    ]);
    ({ initializeApp } = appMod);
    ({ getAuth, signInAnonymously } = authMod);
    ({ getDatabase, ref, set, update, onValue, onDisconnect, runTransaction, push, serverTimestamp, remove, get } = dbMod);
    console.info("FakePair Firebase SDK loaded");
  } catch (error) {
    console.error("FakePair Firebase SDK load failed:", error);
    __fakePairRealtimeReject(error);
    throw error;
  }
})();

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

let app = null;
let auth = null;
let db = null;

async function initializeFirebase() {
  await firebaseInitPromise;
  if (app) return;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  console.info("FakePair Firebase initialized");
}

let uid = null;
let queueRef = null;
let queueListener = null;
let ownQueueListener = null;
let messagesListener = null;
let revealListener = null;
let matchListener = null;
let queuePollTimer = null;
let matchingInFlight = false;
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
  if (!uid || !candidateId || uid === candidateId) return false;

  // Use one deterministic match record for this exact pair. Both users can
  // attempt the same transaction; Firebase serializes it, so only one active
  // match record exists for the pair.
  const matchId = [uid, candidateId].sort().join("__");
  const matchRef = ref(db, "mysteryMatches/" + matchId);

  const newMatch = {
    userA: candidateId,
    userB: uid,
    partnerRoleA: null,
    partnerRoleB: partnerRole,
    status: "active",
    contextOwner: candidateId,
    createdAt: serverTimestamp()
  };

  let tx;
  try {
    tx = await runTransaction(matchRef, current => {
      if (current && current.status === "active") return current;
      return newMatch;
    });
  } catch (error) {
    console.error("FakePair match-lock transaction failed:", error);
    return false;
  }

  if (!tx.committed) return false;

  const match = tx.snapshot.val();
  if (!match || match.status !== "active") return false;

  // Fill in the candidate's role and publish both queue states. This is
  // deliberately separate from the lock transaction so a queue update cannot
  // prevent the match itself from existing.
  try {
    const candidateSnap = await get(ref(db, "mysteryQueue/" + candidateId));
    const candidate = candidateSnap.val();

    if (!candidate ||
        candidate.status !== "waiting" ||
        candidate.lookingFor !== partnerRole ||
        candidate.partnerRole === partnerRole) {
      // If this pair became invalid while the transaction was running, do not
      // connect to it.
      return false;
    }

    await update(ref(db), {
      ["mysteryMatches/" + matchId + "/partnerRoleA"]: candidate.partnerRole,
      ["mysteryMatches/" + matchId + "/partnerRoleB"]: partnerRole,
      ["mysteryQueue/" + uid + "/status"]: "matched",
      ["mysteryQueue/" + uid + "/matchId"]: matchId,
      ["mysteryQueue/" + uid + "/matchedWith"]: candidateId,
      ["mysteryQueue/" + candidateId + "/status"]: "matched",
      ["mysteryQueue/" + candidateId + "/matchId"]: matchId,
      ["mysteryQueue/" + candidateId + "/matchedWith"]: uid
    });

    console.info("FakePair deterministic match connected:", matchId);
    await connectMatch(matchId, opts);
    return true;
  } catch (error) {
    console.error("FakePair match connection update failed:", error);
    return false;
  }
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
  await initializeFirebase();
  matchingInFlight = false;

  try {
    await ensureAuth();

    activePartnerRole = opts.partner.role;
    const lookingFor = await publishQueue(activePartnerRole);

    // Keep the UI neutral. Matching details stay in the console only.
    status(opts.setStatus, "Searching for " + lookingFor + "…");

    const scanQueue = async snapshot => {
      if (leaving || activeMatchId || matchingInFlight) return;

      const candidates = [];
      snapshot.forEach(child => {
        const value = child.val();
        if (
          child.key !== uid &&
          value &&
          value.status === "waiting" &&
          value.partnerRole &&
          value.partnerRole !== activePartnerRole &&
          value.lookingFor === activePartnerRole
        ) {
          candidates.push({
            id: child.key,
            joinedAt: Number(value.joinedAt || 0)
          });
        }
      });

      candidates.sort((a, b) => a.joinedAt - b.joinedAt);
      console.info("FakePair compatible candidates:", candidates.length, candidates);

      for (const candidate of candidates) {
        if (leaving || activeMatchId) return;
        matchingInFlight = true;
        try {
          const connected = await tryClaim(candidate.id, activePartnerRole, opts);
          if (connected) return;
        } catch (error) {
          console.error("FakePair match claim failed:", error);
        } finally {
          matchingInFlight = false;
        }
      }
    };

    if (queueListener) queueListener();
    queueListener = onValue(
      ref(db, "mysteryQueue"),
      snapshot => {
        console.info("FakePair queue listener fired");
        scanQueue(snapshot).catch(error => console.error("FakePair queue scan failed:", error));
      },
      error => {
        console.error("FakePair queue listener failed:", error);
        // Do not replace the neutral Mystery UI with a backend error.
      }
    );

    // Polling is an intentional fallback for mobile/browser cases where the
    // realtime listener is delayed or interrupted. It also makes matching
    // recover automatically without requiring a page refresh.
    if (queuePollTimer) clearInterval(queuePollTimer);
    queuePollTimer = setInterval(async () => {
      if (leaving || activeMatchId) return;
      try {
        const snapshot = await get(ref(db, "mysteryQueue"));
        console.info("FakePair queue poll");
        await scanQueue(snapshot);
      } catch (error) {
        console.error("FakePair queue poll failed:", error);
      }
    }, 1500);

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
      }
    );

    // One immediate read removes the need to wait for either listener or poll.
    const initialQueue = await get(ref(db, "mysteryQueue"));
    await scanQueue(initialQueue);

  } catch (error) {
    console.error("FakePair realtime error:", error);
    // Keep Mystery Mode usable even if realtime matching is unavailable.
    status(opts.setStatus, "Searching for " + (lookingFor || "a partner") + "…");
  }
}

async function publishMatchContext(matchId, context) {
  await initializeFirebase();
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
  await initializeFirebase();
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
  await initializeFirebase();
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
  await initializeFirebase();
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
  await initializeFirebase();
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
  try { await initializeFirebase(); } catch (_) {}
  leaving = true;

  if (queueListener) {
    queueListener();
    queueListener = null;
  }
  if (queuePollTimer) {
    clearInterval(queuePollTimer);
    queuePollTimer = null;
  }
  matchingInFlight = false;
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
firebaseInitPromise
  .then(() => __fakePairRealtimeResolve(window.FakePairRealtime))
  .catch(error => console.error("FakePair realtime initialization failed:", error));

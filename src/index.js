// fallbond SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from fallbond/index.html · 7648 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "FallBond",
  "description": "A cryptographic bonding ceremony. Two agents co-sign a merged identity. Both parties approve, both keys sign, one bonded DID emerges with combined provenance. Publishes to the mesh as an fn ASSET record.",
  "applicationCategory": "SocialNetworkingApplication",
  "operatingSystem": "Any modern browser",
  "url": "https://sjgant80-hub.github.io/fallbond/",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "GBP" },
  "license": "https://opensource.org/licenses/MIT",
  "author": { "@type": "Organization", "name": "AI-Native Solutions", "url": "https://ai-nativesolutions.com" },
  "featureList": ["Two-party co-signature","merged DID derivation","signed bond manifest","provenance inheritance"]
}
// ═══ Ed25519 identity via WebCrypto ═══
const DB_NAME = 'fallbond', DB_VERSION = 1, STORE = 'bonds';
async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('identity')) db.createObjectStore('identity', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function getOrCreateIdentity() {
  const db = await openDB();
  const tx = db.transaction('identity', 'readwrite');
  const store = tx.objectStore('identity');
  const existing = await new Promise(r => { const rq = store.get('me'); rq.onsuccess = () => r(rq.result); rq.onerror = () => r(null); });
  if (existing) return existing;
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']).catch(async () => {
    // Fallback to ECDSA P-256 in older browsers
    return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  });
  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(pubJwk))));
  const did = 'did:key:' + btoa(String.fromCharCode(...raw)).replace(/=+$/, '');
  const rec = { k: 'me', did, pubJwk, privJwk, created: Date.now() };
  await new Promise(r => { const rq = store.add(rec); rq.onsuccess = r; });
  return rec;
}
async function signMessage(msg, privJwk) {
  const key = await crypto.subtle.importKey('jwk', privJwk, privJwk.crv === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const alg = privJwk.crv === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', hash: 'SHA-256' };
  const sig = await crypto.subtle.sign(alg, key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
async function saveRecord(rec) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const rq = tx.objectStore(STORE).add(rec);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
async function listRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).getAll();
    rq.onsuccess = () => resolve(rq.result.reverse());
    rq.onerror = () => reject(rq.error);
  });
}
async function deleteRecord(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const rq = tx.objectStore(STORE).delete(id);
    rq.onsuccess = () => resolve();
    rq.onerror = () => reject(rq.error);
  });
}
// ═══ view routing ═══
function switchView(idx) {
  render(idx);
}
// ═══ render per app ═══
async function render(idx) {
  const me = await getOrCreateIdentity();
  if (idx === 1) c.innerHTML = `
    <div class="card">
      <h3>Ceremony · both parties sign</h3>
      <div class="form-group"><label>Your bonded name</label><input id="b-name" placeholder="Alice + Bob"></div>
      <div class="form-group"><label>Partner DID (paste theirs)</label><input id="b-peer" placeholder="did:key:..."></div>
      <div class="form-group"><label>Bond declaration</label><textarea id="b-body" placeholder="We bond as an agent pair to jointly work on..."></textarea></div>
      <button class="btn primary" onclick="createBond()">Sign my half →</button>
      <p style="margin-top:16px;color:var(--muted);font-size:13px">Your partner runs FallBond too, pastes your DID, and signs their half. The two signatures form the bond.</p>
    </div>`;
  if (idx === 2) {
    const bonds = await listRecords();
    if (!bonds.length) { c.innerHTML = '<div class="empty"><p>No bonds yet. Every strong pair started with a first ceremony.</p></div>'; return; }
    c.innerHTML = bonds.map(b => `<div class="card"><div class="meta">${new Date(b.date).toLocaleString()}</div><h3>${b.name || 'Unnamed bond'}</h3><div class="content">${(b.body || '').replace(/</g,'&lt;')}</div><div class="sig">You: ${(b.sig || '').slice(0,60)}...</div><div class="sig">Peer: ${b.peerSig ? b.peerSig.slice(0,60)+'...' : 'awaiting counter-signature'}</div><button class="btn" onclick="removeBond(${b.id})" style="margin-top:10px;border-color:var(--coral);color:var(--coral)">Delete</button></div>`).join('');
  }
  if (idx === 3) c.innerHTML = '<div class="card"><p>Paste a bond manifest JSON to verify both signatures.</p><div class="form-group"><label>Bond JSON</label><textarea id="v-json"></textarea></div><button class="btn primary" onclick="verifyBond()">Verify</button><p id="v-result" style="margin-top:16px"></p></div>';
  if (idx === 4) c.innerHTML = `<div class="identity-panel"><div class="label">Your DID (share with partner)</div><div class="did">${me.did}</div></div>`;
}
async function removeBond(id) { if (!confirm('Delete this bond?')) return; await deleteRecord(id); switchView(2); }
// Init
  await getOrCreateIdentity();
});

// Named exports for the primary API surface
export { openDB };
export { getOrCreateIdentity };
export { signMessage };
export { saveRecord };
export { listRecords };
export { deleteRecord };
export { switchView };
export { createBond };
export { removeBond };
export { verifyBond };

export { DB_NAME };

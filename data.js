// ============================================
// Shop Payment Tracker - Data Layer
// Dual persistence: localStorage + IndexedDB
// Auto-backup system for data protection
// ============================================

// ---- IndexedDB Manager ----
const IDB = {
  DB_NAME: 'ShopPaymentTracker',
  DB_VERSION: 1,
  STORE_NAME: 'appData',
  db: null,

  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = (e) => {
        console.warn('IndexedDB open failed:', e);
        resolve(null);
      };
    });
  },

  async save(key, value) {
    if (!this.db) await this.open();
    if (!this.db) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        store.put({ key, value, updatedAt: new Date().toISOString() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        console.warn('IDB save failed:', e);
        resolve(false);
      }
    });
  },

  async load(key) {
    if (!this.db) await this.open();
    if (!this.db) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.STORE_NAME, 'readonly');
        const store = tx.objectStore(this.STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.value || null);
        request.onerror = () => resolve(null);
      } catch (e) {
        console.warn('IDB load failed:', e);
        resolve(null);
      }
    });
  },

  async remove(key) {
    if (!this.db) await this.open();
    if (!this.db) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }
};

// ---- Main DB Object ----
const DB = {
  SHOPS_KEY: 'spt_shops',
  UPDATES_KEY: 'spt_updates',
  ACTIVE_SHOP_KEY: 'spt_active_shop',
  BACKUP_KEY: 'spt_last_backup',
  AUTO_BACKUP_KEY: 'spt_auto_backup',
  CREDITS_KEY: 'spt_credits',
  ROUTER_EXPENSES_KEY: 'spt_router_expenses',
  DISTRIBUTOR_TOPUPS_KEY: 'spt_distributor_topups',
  SHIFTS_KEY: 'spt_shifts',
  EXPENSES_KEY: 'spt_expenses',
  BANK_TRANSACTIONS_KEY: 'spt_bank_transactions',
  DEVICE_CREDITS_KEY: 'spt_device_credits',
  REP_CREDITS_KEY: 'spt_rep_credits_v1',
  cloudStatus: navigator.onLine ? 'online' : 'offline',
  setCloudStatus(isOnline) {
    this.cloudStatus = isOnline ? 'online' : 'offline';
    if (window.App && window.App.updateCloudStatusUI) {
      window.App.updateCloudStatusUI(this.cloudStatus);
    }
  },

  _initialized: false,
  _cache: {},

  // Fast in-memory cache lookup with localStorage fallback
  _getStorage(key, defaultVal = []) {
    if (!this._cache) this._cache = {};
    if (this._cache[key] !== undefined && this._cache[key] !== null) {
      return this._cache[key];
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._cache[key] = parsed;
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse localStorage for ' + key, e);
    }
    this._cache[key] = defaultVal;
    return defaultVal;
  },

  // ---- Initialize: load from IDB and seed memory cache ----
  async initialize() {
    if (this._initialized) return;
    await IDB.open();
    if (!this._cache) this._cache = {};

    const restoreKey = async (key) => {
      let lsData = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw && raw !== '[]' && raw !== '{}') {
          lsData = JSON.parse(raw);
        }
      } catch (e) {}

      // Load full data from IDB (has gigabytes of quota for photos/documents)
      try {
        const idbData = await IDB.load(key);
        if (idbData && ((Array.isArray(idbData) && idbData.length > 0) || (typeof idbData === 'object' && Object.keys(idbData).length > 0))) {
          this._cache[key] = idbData;
          if (!lsData || (Array.isArray(lsData) && lsData.length === 0)) {
            // Safely write to localStorage with quota protection
            this._safeLocalStorageSet(key, idbData);
          }
          return;
        }
      } catch (e) {
        console.warn('IDB load failed for ' + key, e);
      }

      if (lsData) {
        this._cache[key] = lsData;
        IDB.save(key, lsData).catch(() => {});
      }
    };

    await restoreKey(this.SHOPS_KEY);
    await restoreKey(this.UPDATES_KEY);
    await restoreKey(this.CREDITS_KEY);
    await restoreKey(this.ROUTER_EXPENSES_KEY);
    await restoreKey(this.DISTRIBUTOR_TOPUPS_KEY);
    await restoreKey(this.SHIFTS_KEY);
    await restoreKey(this.EXPENSES_KEY);
    await restoreKey(this.REP_CREDITS_KEY);
    await restoreKey(this.BANK_TRANSACTIONS_KEY);
    await restoreKey(this.DEVICE_CREDITS_KEY);

    try {
      let lsActive = localStorage.getItem(this.ACTIVE_SHOP_KEY);
      if (!lsActive) {
        const idbActive = await IDB.load(this.ACTIVE_SHOP_KEY);
        if (idbActive) {
          localStorage.setItem(this.ACTIVE_SHOP_KEY, idbActive);
        }
      }
    } catch (e) {}

    this._initialized = true;

    // Migrate any legacy updates to 3-pillar system
    this._migrateLegacyUpdates();
    this._deduplicateLegacyShifts();

    // Setup page close warning
    this._setupBeforeUnload();

    // Initialize Firebase Sync
    this._setupFirebaseSync();
  },

  // ---- Firebase Sync System ----
  
  async _setupFirebaseSync() {
    if (!window.FS) return;

    try {
      // 1. Immediately setup real-time cloud listeners
      this._setupFirebaseListeners();

      // 2. One-time check for shops: if Firestore has no shops, seed from local
      const shopsSnapshot = await window.FS.collection('payment_tracker_shops').limit(1).get().catch(() => null);
      if (shopsSnapshot && shopsSnapshot.empty) {
        const localShops = this.getShops();
        if (localShops.length > 0) {
          const batch = window.FS.batch();
          localShops.forEach(shop => {
            const ref = window.FS.collection('payment_tracker_shops').doc(shop.id);
            batch.set(ref, shop);
          });
          await batch.commit().catch(() => {});
        }
      }
    } catch (e) {
      console.error('Firebase sync setup failed:', e);
    }
  },

  _setupFirebaseListeners() {
    if (!window.FS) return;

    // 1. Shops listener
    window.FS.collection('payment_tracker_shops').onSnapshot(snapshot => {
      this.setCloudStatus(true);
      if (snapshot.metadata.hasPendingWrites) return;
      
      try {
        const shops = [];
        snapshot.forEach(doc => {
          const d = doc.data();
          if (d) shops.push(d);
        });
        shops.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        if (shops.length > 0) {
          this._dualSave(this.SHOPS_KEY, shops);
          let activeId = this.getActiveShopId();
          if (!activeId || !shops.some(s => s.id === activeId)) {
            // On a new PC, intelligently prefer 'MAIN SHOP' or the first active shop
            const mainShop = shops.find(s => s.name && s.name.toUpperCase().includes('MAIN') && s.active !== false);
            this.setActiveShop(mainShop ? mainShop.id : shops[0].id);
          }
          if (window.App && window.App.refreshShopSelector) window.App.refreshShopSelector();
          if (window.App && window.App.refreshPage) window.App.refreshPage(window.App.currentPage);
        }
      } catch (err) {
        console.error('Error handling shops snapshot:', err);
      }
    }, err => {
      console.warn('Firebase shops error:', err);
      this.setCloudStatus(false);
    });

    // 2. Master Universal Updates Listener (Receives Updates, Shifts, Expenses, Credits, Rep Credits, Device Credits)
    window.FS.collection('payment_tracker_updates').onSnapshot(snapshot => {
      this.setCloudStatus(true);
      if (snapshot.metadata.hasPendingWrites) return;
      this.processUpdatesSnapshot(snapshot);
    }, err => {
      console.warn('Firebase updates error:', err);
      this.setCloudStatus(false);
    });
  },

  // Centralized processor for updates collection snapshot (used by real-time listener & manual sync)
  processUpdatesSnapshot(snapshot) {
    if (!snapshot) return;
    try {
      const updates = [];
      const devCredits = [];
      const credits = [];
      const shifts = [];
      const expenses = [];
      const repCredits = [];
      const routerExpenses = [];
      const distributorTopups = [];
      const bankTransactions = [];

      snapshot.forEach(doc => {
        const d = doc.data();
        if (!d) return;

        const docId = doc.id;
        // Normalize ID if missing
        if (!d.id) {
          d.id = docId.replace(/^(devcred_|shift_|exp_|cred_|repcred_|routerexp_|topup_|btx_)/, '');
        }

        if (d.docType === 'device_credit' || docId.startsWith('devcred_') || docId.startsWith('dc_')) {
          devCredits.push(d);
        } else if (d.docType === 'bank_transaction' || docId.startsWith('btx_')) {
          bankTransactions.push(d);
        } else if (d.docType === 'shift' || docId.startsWith('shift_')) {
          shifts.push(d);
        } else if (d.docType === 'expense' || docId.startsWith('exp_')) {
          expenses.push(d);
        } else if (d.docType === 'rep_credit' || docId.startsWith('repcred_')) {
          repCredits.push(d);
        } else if (d.docType === 'router_expense' || docId.startsWith('routerexp_')) {
          routerExpenses.push(d);
        } else if (d.docType === 'distributor_topup' || docId.startsWith('topup_')) {
          distributorTopups.push(d);
        } else if (d.docType === 'credit' || docId.startsWith('cred_') || docId.startsWith('cr_')) {
          credits.push(d);
        } else {
          updates.push(d);
        }
      });

      // Merge and save updates
      if (updates.length > 0) {
        const curUpdates = this.getUpdates(true);
        const map = new Map();
        curUpdates.forEach(u => map.set(u.id, u));
        updates.forEach(u => map.set(u.id, { ...(map.get(u.id) || {}), ...u }));
        const merged = Array.from(map.values());
        merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        this._dualSave(this.UPDATES_KEY, merged);
      }

      // Merge and save shifts
      if (shifts.length > 0) {
        const curShifts = this.getShifts();
        const map = new Map();
        curShifts.forEach(s => map.set(s.id, s));
        shifts.forEach(s => map.set(s.id, { ...(map.get(s.id) || {}), ...s }));
        const merged = Array.from(map.values());
        merged.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
        this._dualSave(this.SHIFTS_KEY, merged);
      }

      // Merge and save expenses
      if (expenses.length > 0) {
        const curExp = this.getExpenses();
        const map = new Map();
        curExp.forEach(e => map.set(e.id, e));
        expenses.forEach(e => map.set(e.id, { ...(map.get(e.id) || {}), ...e }));
        const merged = Array.from(map.values());
        merged.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
        this._dualSave(this.EXPENSES_KEY, merged);
      }

      // Merge and save rep credits
      if (repCredits.length > 0) {
        const curRep = this.getRepCredits(null, true);
        const map = new Map();
        curRep.forEach(r => map.set(r.id, r));
        repCredits.forEach(r => map.set(r.id, { ...(map.get(r.id) || {}), ...r }));
        const merged = Array.from(map.values());
        merged.sort((a, b) => new Date(b.timestamp || b.takenDate) - new Date(a.timestamp || a.takenDate));
        this._dualSave(this.REP_CREDITS_KEY, merged);
      }

      // Merge and save device credits (100% quota safe)
      if (devCredits.length > 0) {
        const currentDev = this.getDeviceCredits();
        const devMap = new Map();
        currentDev.forEach(c => devMap.set(c.id, c));
        devCredits.forEach(c => devMap.set(c.id, { ...(devMap.get(c.id) || {}), ...c }));
        const mergedDev = Array.from(devMap.values());
        mergedDev.sort((a, b) => new Date(b.createdAt || b.agreementDate) - new Date(a.createdAt || a.agreementDate));
        this._dualSave(this.DEVICE_CREDITS_KEY, mergedDev);
      }

      // Merge and save customer credits
      if (credits.length > 0) {
        const curCred = this.getCredits(null, true);
        const map = new Map();
        curCred.forEach(c => map.set(c.id, c));
        credits.forEach(c => map.set(c.id, { ...(map.get(c.id) || {}), ...c }));
        const merged = Array.from(map.values());
        merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        this._dualSave(this.CREDITS_KEY, merged);
      }

      // Merge router expenses
      if (routerExpenses.length > 0) {
        const curRouters = this.getRouterExpenses(null);
        const map = new Map();
        curRouters.forEach(r => map.set(r.id, r));
        routerExpenses.forEach(r => map.set(r.id, { ...(map.get(r.id) || {}), ...r }));
        this._dualSave(this.ROUTER_EXPENSES_KEY, Array.from(map.values()));
      }

      // Merge distributor topups
      if (distributorTopups.length > 0) {
        const curTopups = this.getDistributorTopups(null);
        const map = new Map();
        curTopups.forEach(t => map.set(t.id, t));
        distributorTopups.forEach(t => map.set(t.id, { ...(map.get(t.id) || {}), ...t }));
        this._dualSave(this.DISTRIBUTOR_TOPUPS_KEY, Array.from(map.values()));
      }

      // Merge and save bank transactions & cash handovers
      if (bankTransactions.length > 0) {
        const curBtx = this.getBankTransactions(null);
        const map = new Map();
        curBtx.forEach(b => map.set(b.id, b));
        bankTransactions.forEach(b => map.set(b.id, { ...(map.get(b.id) || {}), ...b }));
        const merged = Array.from(map.values());
        merged.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
        this._dualSave(this.BANK_TRANSACTIONS_KEY, merged);
      }

      if (window.App) {
        window.App.updateTopBarBadges();
        window.App.refreshPage(window.App.currentPage);
      }
    } catch (err) {
      console.error('Error processing Firestore updates snapshot:', err);
    }
  },

  async _syncToFirebase(collection, docId, data) {
    if (!window.FS) return false;
    try {
      this.setCloudSyncing(true);
      await window.FS.collection(collection).doc(docId).set(data);
      this.setCloudSyncing(false, true);
      return true;
    } catch (e) {
      console.error("Firebase set error", collection, docId, e);
      this.setCloudSyncing(false, false, e.message);
      if (window.App && window.App.showToast) {
        const isSizeErr = e.message && e.message.includes('exceeds maximum allowed size');
        if (isSizeErr) {
          window.App.showToast('❌ ඡායාරූප ප්‍රමාණය වැඩියි! කරුණාකර නැවත උත්සාහ කරන්න', 'error');
        } else {
          window.App.showToast('⚠️ Cloud Upload Error: ' + (e.message || 'Network issue'), 'error');
        }
      }
      return false;
    }
  },

  setCloudSyncing(isSyncing, isSuccess = true, errorMsg = '') {
    if (window.App && window.App.updateCloudSyncingUI) {
      window.App.updateCloudSyncingUI(isSyncing, isSuccess, errorMsg);
    }
  },

  _deleteFromFirebase(collection, docId) {
    if (window.FS) {
      window.FS.collection(collection).doc(docId).delete().catch(e => console.error("Firebase delete error", e));
    }
  },

  // ---- Quota-Safe Dual Save: Memory Cache + IndexedDB (Full) + localStorage (Safe) ----
  _dualSave(key, data) {
    // 1. Immediately update fast in-memory cache
    if (!this._cache) this._cache = {};
    this._cache[key] = data;

    // 2. Save full data (including photos) to IndexedDB (virtually unlimited quota)
    try {
      IDB.save(key, data).catch(err => console.warn('IDB save error for ' + key, err));
    } catch (e) {
      console.warn('IDB save exception for ' + key, e);
    }

    // 3. Save to localStorage safely with quota protection
    this._safeLocalStorageSet(key, data);
  },

  _safeLocalStorageSet(key, data) {
    try {
      const json = JSON.stringify(data);
      localStorage.setItem(key, json);
    } catch (e) {
      // Quota exceeded: strip large base64 strings so metadata always fits in 5MB
      console.warn('localStorage quota exceeded for ' + key + '. Storing lightweight version...');
      try {
        if (Array.isArray(data)) {
          const lightweight = data.map(item => {
            if (!item || typeof item !== 'object') return item;
            const copy = { ...item };
            if (copy.customerPhoto && copy.customerPhoto.length > 500) copy.customerPhoto = '[stored_in_idb]';
            if (copy.phoneBoxPhoto && copy.phoneBoxPhoto.length > 500) copy.phoneBoxPhoto = '[stored_in_idb]';
            if (copy.nicFrontPhoto && copy.nicFrontPhoto.length > 500) copy.nicFrontPhoto = '[stored_in_idb]';
            if (copy.nicBackPhoto && copy.nicBackPhoto.length > 500) copy.nicBackPhoto = '[stored_in_idb]';
            if (copy.receiptPhoto && copy.receiptPhoto.length > 500) copy.receiptPhoto = '[stored_in_idb]';
            return copy;
          });
          localStorage.setItem(key, JSON.stringify(lightweight));
        }
      } catch (fallbackErr) {
        console.warn('Could not save even lightweight ' + key + ' to localStorage:', fallbackErr);
      }
    }
  },

  // ---- Page close warning ----
  _setupBeforeUnload() {
    window.addEventListener('beforeunload', (e) => {
      // Sync all data to IDB before closing
      const shops = this.getShops();
      const updates = this.getUpdates();
      if (shops.length > 0 || updates.length > 0) {
        IDB.save(this.SHOPS_KEY, shops);
        IDB.save(this.UPDATES_KEY, updates);
        IDB.save(this.ACTIVE_SHOP_KEY, this.getActiveShopId());
      }
    });
  },

  // ---- Shop CRUD ----
  getShops(includeDeleted = false) {
    const shops = JSON.parse(localStorage.getItem(this.SHOPS_KEY) || '[]');
    if (includeDeleted) return shops;
    return shops.filter(s => !s.deleted);
  },

  saveShops(shops) {
    this._dualSave(this.SHOPS_KEY, shops);
  },

  addShop(name) {
    const shops = this.getShops();
    const shop = {
      id: 'shop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name.trim(),
      createdAt: new Date().toISOString()
    };
    shops.push(shop);
    this.saveShops(shops);
    this._syncToFirebase('payment_tracker_shops', shop.id, shop);
    
    // If first shop, set as active
    if (shops.length === 1) {
      this.setActiveShop(shop.id);
    }
    return shop;
  },

  updateShop(id, name) {
    const shops = this.getShops();
    const idx = shops.findIndex(s => s.id === id);
    if (idx !== -1) {
      shops[idx].name = name.trim();
      this.saveShops(shops);
      this._syncToFirebase('payment_tracker_shops', id, shops[idx]);
    }
    return shops[idx];
  },

  deleteShop(id) {
    let shops = this.getShops(true);
    let idx = shops.findIndex(s => s.id === id);
    if (idx !== -1) {
      shops[idx].deleted = true;
      shops[idx].deletedAt = Date.now();
      this.saveShops(shops);
      this._syncToFirebase('payment_tracker_shops', id, shops[idx]);
    }

    // Reset active if deleted
    // Reset active if deleted
    if (this.getActiveShopId() === id) {
      const activeShops = this.getShops(false);
      this.setActiveShop(activeShops.length > 0 ? activeShops[0].id : null);
    }
  },

  recoverShop(id) {
    let shops = this.getShops(true);
    let idx = shops.findIndex(s => s.id === id);
    if (idx !== -1) {
      shops[idx].deleted = false;
      delete shops[idx].deletedAt;
      this.saveShops(shops);
      this._syncToFirebase('payment_tracker_shops', id, shops[idx]);
    }
  },

  getActiveShopId() {
    let id = localStorage.getItem(this.ACTIVE_SHOP_KEY);
    const shops = this.getShops(false);
    if (shops.length > 0) {
      if (!id || !shops.some(s => s.id === id)) {
        id = shops[0].id;
        this.setActiveShop(id);
      }
    }
    return id || '';
  },

  setActiveShop(id) {
    if (id) {
      localStorage.setItem(this.ACTIVE_SHOP_KEY, id);
      IDB.save(this.ACTIVE_SHOP_KEY, id).catch(() => {});
    } else {
      localStorage.removeItem(this.ACTIVE_SHOP_KEY);
      IDB.remove(this.ACTIVE_SHOP_KEY).catch(() => {});
    }
  },

  getActiveShop() {
    const id = this.getActiveShopId();
    if (!id) return null;
    return this.getShops().find(s => s.id === id) || null;
  },

  getShop(id) {
    if (!id) return null;
    return this.getShops(true).find(s => s.id === id) || null;
  },

  // ---- Updates CRUD ----
  getUpdates(includeDeleted = false) {
    const allUpdates = JSON.parse(localStorage.getItem(this.UPDATES_KEY) || '[]');
    if (includeDeleted) return allUpdates;
    
    // Filter out updates from deleted shops
    const activeShopIds = new Set(this.getShops(false).map(s => s.id));
    return allUpdates.filter(u => activeShopIds.has(u.shopId));
  },

  saveUpdates(updates) {
    this._dualSave(this.UPDATES_KEY, updates);
  },

  getUpdatesForShop(shopId) {
    return this.getUpdates()
      .filter(u => u.shopId === shopId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  getUpdatesForShopByDate(shopId, date) {
    return this.getUpdatesForShop(shopId)
      .filter(u => u.date === date)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  getLastUpdate(shopId) {
    const updates = this.getUpdatesForShop(shopId);
    return updates.length > 0 ? updates[0] : null;
  },

  getLastUpdateBefore(shopId, timestamp) {
    const updates = this.getUpdatesForShop(shopId)
      .filter(u => new Date(u.timestamp) < new Date(timestamp))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return updates.length > 0 ? updates[0] : null;
  },

  // Extract values from any update (legacy or 2-track format)
  extractValues(u) {
    if (!u) {
      return {
        dialog: 0, mobitel: 0, airtel: 0, hutch: 0, ezcash: 0,
        simTotal: 0, reloadCash: 0, reloadHubCash: 0, reloadDrawerTotal: 0, reloadTotal: 0,
        banks: [], totalBankAcct: 0, totalBankCash: 0, bankTotal: 0,
        totalCash: 0, cashInDrawer: 0, totalCapital: 0,
        reloadDenominations: null, hubDenominations: null
      };
    }

    // 1. Reload SIMs Extraction (Pure Telecom SIM Balances)
    let dialog = 0, mobitel = 0, airtel = 0, hutch = 0, ezcash = 0;
    let reloadCash = 0, reloadHubCash = 0, simTotal = 0;

    if (u.reload && typeof u.reload === 'object') {
      dialog = parseFloat(u.reload.dialog) || 0;
      mobitel = parseFloat(u.reload.mobitel) || 0;
      airtel = parseFloat(u.reload.airtel) || 0;
      hutch = parseFloat(u.reload.hutch) || 0;
      ezcash = parseFloat(u.reload.ezcash) || 0;
      reloadCash = parseFloat(u.reload.cashInDrawer) || 0;
      reloadHubCash = parseFloat(u.reload.hubCash) || 0;
      simTotal = dialog + mobitel + airtel + hutch + ezcash;
      if (simTotal === 0 && u.reload.simTotal !== undefined) {
        simTotal = parseFloat(u.reload.simTotal) || 0;
      }
      // If legacy u.reload.total bundled cash and simTotal was 0:
      if (simTotal === 0 && u.reload.total !== undefined) {
        const rTot = parseFloat(u.reload.total) || 0;
        simTotal = Math.max(0, rTot - reloadCash - reloadHubCash);
      }
    } else if (u.simTotal !== undefined) {
      simTotal = parseFloat(u.simTotal) || 0;
      reloadCash = parseFloat(u.cashInDrawer) || 0;
    }

    const reloadDrawerTotal = reloadCash + reloadHubCash;
    const reloadTotal = simTotal + reloadDrawerTotal;

    // 2. Bank Extraction (Pure Bank Accounts)
    let banks = [];
    let totalBankAcct = 0;
    let totalBankCash = 0;
    let bankTotal = 0;

    if (u.mobileRental && typeof u.mobileRental === 'object') {
      if (Array.isArray(u.mobileRental.banks)) {
        banks = u.mobileRental.banks.map(b => ({
          bank: b.bank || '',
          accountAmount: parseFloat(b.accountAmount) || 0,
          cashInDrawer: parseFloat(b.cashInDrawer) || 0,
          total: (parseFloat(b.accountAmount) || 0) + (parseFloat(b.cashInDrawer) || 0)
        }));
        banks.forEach(b => {
          totalBankAcct += b.accountAmount;
          totalBankCash += b.cashInDrawer;
        });
      }
      if (totalBankAcct === 0 && u.mobileRental.totalAccountAmount !== undefined) {
        totalBankAcct = parseFloat(u.mobileRental.totalAccountAmount) || 0;
      }
      if (totalBankCash === 0 && u.mobileRental.totalCashInDrawer !== undefined) {
        totalBankCash = parseFloat(u.mobileRental.totalCashInDrawer) || 0;
      }
      if (totalBankAcct === 0 && totalBankCash === 0 && u.mobileRental.grandTotal !== undefined) {
        totalBankAcct = parseFloat(u.mobileRental.grandTotal) || 0;
      }
      bankTotal = totalBankAcct;
    } else if (u.bankTotal !== undefined) {
      bankTotal = parseFloat(u.bankTotal) || 0;
      totalBankAcct = bankTotal;
    }

    // 3. Physical Cash in Drawer
    const totalCash = reloadCash + reloadHubCash + totalBankCash;

    // 4. Shop Total Capital = SIMs Float + Bank Accounts + Cash in Drawer
    let totalCapital = simTotal + bankTotal + totalCash;
    if (u.totalCapital !== undefined) {
      const storedCap = parseFloat(u.totalCapital) || 0;
      if (storedCap > 0 && Math.abs(storedCap - totalCapital) < 5) {
        totalCapital = storedCap;
      }
    }

    return {
      dialog, mobitel, airtel, hutch, ezcash,
      simTotal, // Pure SIM Float
      reloadCash,
      reloadHubCash,
      reloadDrawerTotal,
      reloadTotal, // SIMs + Drawer Cash
      banks,
      totalBankAcct,
      totalBankCash,
      bankTotal, // Pure Bank Accounts Total
      totalCash, // Pure Cash in Drawer Total
      cashInDrawer: totalCash,
      totalCapital, // SIMs + Bank + Cash in Drawer
      reloadDenominations: (u.reload && u.reload.denominations) ? u.reload.denominations : null,
      hubDenominations: (u.reload && u.reload.hubDenominations) ? u.reload.hubDenominations : null
    };
  },

  _migrateLegacyUpdates() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.UPDATES_KEY) || '[]');
      if (!Array.isArray(raw) || raw.length === 0) return;

      let modified = false;
      const shops = this.getShops(true);

      shops.forEach(shop => {
        const shopUpdates = raw.filter(u => u.shopId === shop.id)
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        for (let i = 0; i < shopUpdates.length; i++) {
          const u = shopUpdates[i];
          const vals = this.extractValues(u);

          if (!u.reload || typeof u.reload !== 'object' || u.reload.total === undefined) {
            u.reload = {
              dialog: vals.dialog,
              mobitel: vals.mobitel,
              airtel: vals.airtel,
              hutch: vals.hutch,
              ezcash: vals.ezcash,
              simTotal: vals.simTotal,
              cashInDrawer: vals.reloadCash,
              total: vals.reloadTotal
            };
            modified = true;
          }

          if (!u.mobileRental || typeof u.mobileRental !== 'object' || u.mobileRental.grandTotal === undefined) {
            u.mobileRental = {
              banks: vals.banks,
              totalAccountAmount: vals.totalBankAcct,
              totalCashInDrawer: vals.totalBankCash,
              grandTotal: vals.bankTotal
            };
            modified = true;
          }

          u.totalCapital = vals.totalCapital;
          u.simTotal = vals.simTotal;
          u.bankTotal = vals.bankTotal;
          u.cashInDrawer = vals.totalCash;
          u.reloadTotal = vals.reloadTotal;

          const prev = i > 0 ? shopUpdates[i - 1] : null;
          u.comparison = this.calculateComparison(u, prev);
          modified = true;
        }
      });

      if (modified) {
        this.saveUpdates(raw);
        console.log('✅ Migrated legacy updates to 2-track Reload & Bank format');
      }
    } catch (e) {
      console.error('Migration error:', e);
    }
  },

  addUpdate(updateData) {
    const updates = this.getUpdates(true);
    const now = new Date();

    const reloadDialog = parseFloat(updateData.reload?.dialog) || 0;
    const reloadMobitel = parseFloat(updateData.reload?.mobitel) || 0;
    const reloadAirtel = parseFloat(updateData.reload?.airtel) || 0;
    const reloadHutch = parseFloat(updateData.reload?.hutch) || 0;
    const reloadEzcash = parseFloat(updateData.reload?.ezcash) || 0;
    const reloadCash = parseFloat(updateData.reload?.cashInDrawer) || 0;
    const reloadHubCash = parseFloat(updateData.reload?.hubCash) || 0;
    const reloadSimTotal = reloadDialog + reloadMobitel + reloadAirtel + reloadHutch + reloadEzcash;
    const reloadDrawerTotal = reloadCash + reloadHubCash;
    let reloadTotal = reloadSimTotal + reloadDrawerTotal;
    if (reloadTotal === 0 && updateData.simTotal !== undefined) {
      reloadTotal = parseFloat(updateData.simTotal) || 0;
    }

    // Process banks
    const banks = Array.isArray(updateData.mobileRental?.banks) ? updateData.mobileRental.banks.map(b => {
      const acct = parseFloat(b.accountAmount) || 0;
      const cash = parseFloat(b.cashInDrawer) || 0;
      return {
        bank: b.bank || '',
        accountAmount: acct,
        cashInDrawer: cash,
        total: acct + cash
      };
    }) : [];

    let totalBankAcct = 0;
    let totalBankCash = 0;
    let bankGrandTotal = 0;

    if (banks.length > 0) {
      banks.forEach(b => {
        totalBankAcct += b.accountAmount;
        totalBankCash += b.cashInDrawer;
        bankGrandTotal += b.total;
      });
    } else if (updateData.bankTotal !== undefined) {
      bankGrandTotal = parseFloat(updateData.bankTotal) || 0;
    }

    const totalCapital = reloadTotal + bankGrandTotal;
    const totalCash = reloadCash + totalBankCash;

    // Process adjustments
    const updateId = 'upd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const credits = Array.isArray(updateData.adjustments?.credits) ? updateData.adjustments.credits.map(c => ({
      id: 'cred_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shopId: updateData.shopId,
      updateId,
      customerName: (c.customerName || '').trim(),
      phone: (c.phone || '').trim(),
      network: c.network || 'Dialog',
      amount: parseFloat(c.amount) || 0,
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
      status: 'pending',
      note: (c.note || '').trim()
    })).filter(c => c.amount > 0 && c.customerName) : [];

    const routerExpenses = Array.isArray(updateData.adjustments?.routers) ? updateData.adjustments.routers.map(r => ({
      id: 'rexp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shopId: updateData.shopId,
      updateId,
      routerName: (r.routerName || 'Shop Router').trim(),
      network: r.network || 'Dialog',
      amount: parseFloat(r.amount) || 0,
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
      note: (r.note || '').trim()
    })).filter(r => r.amount > 0) : [];

    const distributorTopups = Array.isArray(updateData.adjustments?.topups) ? updateData.adjustments.topups.map(t => ({
      id: 'topup_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shopId: updateData.shopId,
      updateId,
      distributorName: (t.distributorName || 'Distributor').trim(),
      networkOrBank: t.networkOrBank || 'Dialog',
      amount: parseFloat(t.amount) || 0,
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
      note: (t.note || '').trim()
    })).filter(t => t.amount > 0) : [];

    const creditsTotal = credits.reduce((sum, c) => sum + c.amount, 0);
    const routersTotal = routerExpenses.reduce((sum, r) => sum + r.amount, 0);
    const topupsTotal = distributorTopups.reduce((sum, t) => sum + t.amount, 0);

    const update = {
      id: updateId,
      shopId: updateData.shopId,
      empName: updateData.empName || '',
      jobRole: updateData.jobRole || '',
      date: now.toISOString().split('T')[0],
      timestamp: now.toISOString(),
      reload: {
        dialog: reloadDialog,
        mobitel: reloadMobitel,
        airtel: reloadAirtel,
        hutch: reloadHutch,
        ezcash: reloadEzcash,
        simTotal: reloadSimTotal,
        cashInDrawer: reloadCash,
        hubCash: reloadHubCash,
        drawerTotal: reloadDrawerTotal,
        total: reloadTotal
      },
      mobileRental: {
        banks,
        totalAccountAmount: totalBankAcct,
        totalCashInDrawer: totalBankCash,
        grandTotal: bankGrandTotal
      },
      adjustments: {
        credits,
        routerExpenses,
        distributorTopups,
        creditsTotal,
        routersTotal,
        topupsTotal
      },
      totalCapital,
      notes: updateData.notes || '',
      // Canonical helpers for backwards compatibility:
      simTotal: reloadSimTotal,
      bankTotal: bankGrandTotal,
      cashInDrawer: totalCash,
      reloadTotal,
      comparison: null
    };

    const prevUpdate = this.getLastUpdate(update.shopId);
    update.comparison = this.calculateComparison(update, prevUpdate);

    // Save linked adjustments to persistence tables
    if (credits.length > 0) {
      const existingCredits = this.getCredits(null, true);
      this.saveCredits([...credits, ...existingCredits]);
    }
    if (routerExpenses.length > 0) {
      const existingRouters = this.getRouterExpenses(null);
      this.saveRouterExpenses([...routerExpenses, ...existingRouters]);
    }
    if (distributorTopups.length > 0) {
      const existingTopups = this.getDistributorTopups(null);
      this.saveDistributorTopups([...distributorTopups, ...existingTopups]);
    }

    updates.push(update);
    this.saveUpdates(updates);
    this._syncToFirebase('payment_tracker_updates', update.id, update);
    this.autoBackup();

    return update;
  },

  editUpdate(updateId, updateData) {
    const updates = this.getUpdates(true);
    const index = updates.findIndex(u => u.id === updateId);
    if (index === -1) return null;

    const existingUpdate = updates[index];

    existingUpdate.empName = updateData.empName || existingUpdate.empName;
    existingUpdate.jobRole = updateData.jobRole || existingUpdate.jobRole;

    const reloadDialog = parseFloat(updateData.reload?.dialog) || 0;
    const reloadMobitel = parseFloat(updateData.reload?.mobitel) || 0;
    const reloadAirtel = parseFloat(updateData.reload?.airtel) || 0;
    const reloadHutch = parseFloat(updateData.reload?.hutch) || 0;
    const reloadEzcash = parseFloat(updateData.reload?.ezcash) || 0;
    const reloadCash = parseFloat(updateData.reload?.cashInDrawer) || 0;
    const reloadHubCash = parseFloat(updateData.reload?.hubCash) || 0;
    const reloadSimTotal = reloadDialog + reloadMobitel + reloadAirtel + reloadHutch + reloadEzcash;
    const reloadDrawerTotal = reloadCash + reloadHubCash;
    let reloadTotal = reloadSimTotal + reloadDrawerTotal;
    if (reloadTotal === 0 && updateData.simTotal !== undefined) {
      reloadTotal = parseFloat(updateData.simTotal) || 0;
    }

    const banks = Array.isArray(updateData.mobileRental?.banks) ? updateData.mobileRental.banks.map(b => {
      const acct = parseFloat(b.accountAmount) || 0;
      const cash = parseFloat(b.cashInDrawer) || 0;
      return {
        bank: b.bank || '',
        accountAmount: acct,
        cashInDrawer: cash,
        total: acct + cash
      };
    }) : [];

    let totalBankAcct = 0;
    let totalBankCash = 0;
    let bankGrandTotal = 0;

    if (banks.length > 0) {
      banks.forEach(b => {
        totalBankAcct += b.accountAmount;
        totalBankCash += b.cashInDrawer;
        bankGrandTotal += b.total;
      });
    } else if (updateData.bankTotal !== undefined) {
      bankGrandTotal = parseFloat(updateData.bankTotal) || 0;
    }

    const totalCapital = reloadTotal + bankGrandTotal;
    const totalCash = reloadCash + totalBankCash;

    existingUpdate.reload = {
      dialog: reloadDialog,
      mobitel: reloadMobitel,
      airtel: reloadAirtel,
      hutch: reloadHutch,
      ezcash: reloadEzcash,
      simTotal: reloadSimTotal,
      cashInDrawer: reloadCash,
      hubCash: parseFloat(updateData.reload?.hubCash) || 0,
      drawerTotal: reloadCash + (parseFloat(updateData.reload?.hubCash) || 0),
      total: reloadTotal,
      denominations: updateData.reload?.denominations || existingUpdate.reload?.denominations || null
    };
    existingUpdate.mobileRental = {
      banks,
      totalAccountAmount: totalBankAcct,
      totalCashInDrawer: totalBankCash,
      grandTotal: bankGrandTotal
    };
    existingUpdate.notes = updateData.notes !== undefined ? updateData.notes : (existingUpdate.notes || '');
    existingUpdate.totalCapital = totalCapital;
    existingUpdate.simTotal = reloadSimTotal;
    existingUpdate.bankTotal = bankGrandTotal;
    existingUpdate.cashInDrawer = totalCash;
    existingUpdate.reloadTotal = reloadTotal;

    const prevUpdate = this.getLastUpdateBefore(existingUpdate.shopId, existingUpdate.timestamp);
    existingUpdate.comparison = this.calculateComparison(existingUpdate, prevUpdate);

    this.saveUpdates(updates);
    this._syncToFirebase('payment_tracker_updates', existingUpdate.id, existingUpdate);
    this.autoBackup();

    return existingUpdate;
  },

  deleteUpdate(updateId) {
    let updates = this.getUpdates(true);
    updates = updates.filter(u => u.id !== updateId);
    this.saveUpdates(updates);
    this._deleteFromFirebase('payment_tracker_updates', updateId);
  },

  // ---- Customer Credits ----
  getCredits(shopId = null, includeSettled = true) {
    let credits = JSON.parse(localStorage.getItem(this.CREDITS_KEY) || '[]');
    if (shopId) credits = credits.filter(c => c.shopId === shopId);
    if (!includeSettled) credits = credits.filter(c => c.status === 'pending');
    return credits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  saveCredits(credits) {
    this._dualSave(this.CREDITS_KEY, credits);
  },

  addCredit(creditData) {
    const credits = this.getCredits(null, true);
    const now = new Date();
    const item = {
      id: 'cred_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shopId: creditData.shopId,
      updateId: creditData.updateId || null,
      customerName: (creditData.customerName || '').trim(),
      phone: (creditData.phone || '').trim(),
      network: creditData.network || 'Dialog',
      amount: parseFloat(creditData.amount) || 0,
      timestamp: creditData.timestamp || now.toISOString(),
      date: creditData.date || now.toISOString().split('T')[0],
      status: 'pending',
      note: (creditData.note || '').trim()
    };
    item.docType = 'credit';
    credits.unshift(item);
    this.saveCredits(credits);
    this._syncToFirebase('payment_tracker_updates', 'cred_' + item.id, item);
    this._syncToFirebase('payment_tracker_credits', item.id, item).catch(() => {});

    // Deduct credit reload amount from the corresponding SIM in active balance (lastUpdate)
    if (item.shopId && item.amount > 0) {
      const lastUpdate = this.getLastUpdate(item.shopId);
      if (lastUpdate) {
        const amt = parseFloat(item.amount) || 0;
        const simKey = (item.network || 'dialog').toLowerCase().trim();
        if (!lastUpdate.reload) lastUpdate.reload = {};

        if (lastUpdate.reload[simKey] !== undefined) {
          lastUpdate.reload[simKey] = Math.max(0, (parseFloat(lastUpdate.reload[simKey]) || 0) - amt);
        } else {
          lastUpdate.reload[simKey] = 0;
        }

        lastUpdate.reload.simTotal = Math.max(0, (parseFloat(lastUpdate.reload.simTotal) || 0) - amt);
        lastUpdate.reload.total = Math.max(0, (parseFloat(lastUpdate.reload.total) || 0) - amt);
        lastUpdate.simTotal = Math.max(0, (parseFloat(lastUpdate.simTotal) || 0) - amt);
        lastUpdate.reloadTotal = Math.max(0, (parseFloat(lastUpdate.reloadTotal) || 0) - amt);
        lastUpdate.totalCapital = Math.max(0, (parseFloat(lastUpdate.totalCapital) || 0) - amt);

        const prevUpdate = this.getLastUpdateBefore(item.shopId, lastUpdate.timestamp);
        lastUpdate.comparison = this.calculateComparison(lastUpdate, prevUpdate);

        const allUpdates = this.getUpdates(true);
        const idx = allUpdates.findIndex(u => u.id === lastUpdate.id);
        if (idx !== -1) {
          allUpdates[idx] = lastUpdate;
          this.saveUpdates(allUpdates);
          this._syncToFirebase('payment_tracker_updates', lastUpdate.id, lastUpdate);
        }
      }
    }

    return item;
  },

  settleCredit(creditId, settledNote = '', destination = { type: 'cash' }) {
    const credits = this.getCredits(null, true);
    const item = credits.find(c => c.id === creditId);
    if (!item) return false;

    item.status = 'paid';
    item.settledAt = new Date().toISOString();
    item.settledNote = settledNote;
    item.settledDestination = destination || { type: 'cash' };
    item.docType = 'credit';
    this.saveCredits(credits);
    this._syncToFirebase('payment_tracker_updates', 'cred_' + item.id, item);

    // Rebalance into shop's active accounts and total capital!
    if (destination && destination.type !== 'none' && item.shopId) {
      const lastUpdate = this.getLastUpdate(item.shopId);
      if (lastUpdate) {
        const amt = parseFloat(item.amount) || 0;
        if (destination.type === 'cash') {
          if (!lastUpdate.reload) lastUpdate.reload = {};
          lastUpdate.reload.cashInDrawer = (parseFloat(lastUpdate.reload.cashInDrawer) || 0) + amt;
          lastUpdate.reload.total = (parseFloat(lastUpdate.reload.total) || 0) + amt;
          lastUpdate.cashInDrawer = (parseFloat(lastUpdate.cashInDrawer) || 0) + amt;
          lastUpdate.totalCapital = (parseFloat(lastUpdate.totalCapital) || 0) + amt;
        } else if (destination.type === 'bank') {
          if (!lastUpdate.mobileRental || typeof lastUpdate.mobileRental !== 'object') {
            lastUpdate.mobileRental = { banks: [], totalAccountAmount: 0, totalCashInDrawer: 0, grandTotal: 0 };
          }
          if (!Array.isArray(lastUpdate.mobileRental.banks)) {
            lastUpdate.mobileRental.banks = [];
          }
          const bankName = destination.bankName || 'Commercial Bank';
          let b = lastUpdate.mobileRental.banks.find(x => x.bank && x.bank.toLowerCase() === bankName.toLowerCase());
          if (!b) {
            b = { bank: bankName, accountAmount: 0, cashInDrawer: 0, total: 0 };
            lastUpdate.mobileRental.banks.push(b);
          }
          b.accountAmount = (parseFloat(b.accountAmount) || 0) + amt;
          b.total = (parseFloat(b.total) || 0) + amt;
          lastUpdate.mobileRental.totalAccountAmount = (parseFloat(lastUpdate.mobileRental.totalAccountAmount) || 0) + amt;
          lastUpdate.mobileRental.grandTotal = (parseFloat(lastUpdate.mobileRental.grandTotal) || 0) + amt;
          lastUpdate.bankTotal = (parseFloat(lastUpdate.bankTotal) || 0) + amt;
          lastUpdate.totalCapital = (parseFloat(lastUpdate.totalCapital) || 0) + amt;
        } else if (destination.type === 'sim') {
          const simKey = (destination.simName || 'dialog').toLowerCase();
          if (!lastUpdate.reload) lastUpdate.reload = {};
          lastUpdate.reload[simKey] = (parseFloat(lastUpdate.reload[simKey]) || 0) + amt;
          lastUpdate.reload.simTotal = (parseFloat(lastUpdate.reload.simTotal) || 0) + amt;
          lastUpdate.reload.total = (parseFloat(lastUpdate.reload.total) || 0) + amt;
          lastUpdate.simTotal = (parseFloat(lastUpdate.simTotal) || 0) + amt;
          lastUpdate.reloadTotal = (parseFloat(lastUpdate.reloadTotal) || 0) + amt;
          lastUpdate.totalCapital = (parseFloat(lastUpdate.totalCapital) || 0) + amt;
        }

        const prevUpdate = this.getLastUpdateBefore(item.shopId, lastUpdate.timestamp);
        lastUpdate.comparison = this.calculateComparison(lastUpdate, prevUpdate);

        const allUpdates = this.getUpdates(true);
        const idx = allUpdates.findIndex(u => u.id === lastUpdate.id);
        if (idx !== -1) {
          allUpdates[idx] = lastUpdate;
          this.saveUpdates(allUpdates);
          this._syncToFirebase('payment_tracker_updates', lastUpdate.id, lastUpdate);
        }
      }
    }

    return true;
  },

  deleteCredit(creditId) {
    let credits = this.getCredits(null, true);
    const item = credits.find(c => c.id === creditId);
    if (!item) return false;

    // Restore SIM balance and reverse settlement adjustments
    if (item.shopId && item.amount > 0) {
      const lastUpdate = this.getLastUpdate(item.shopId);
      if (lastUpdate) {
        const amt = parseFloat(item.amount) || 0;
        const simKey = (item.network || 'dialog').toLowerCase().trim();

        // 1. Restore the SIM balance that was deducted upon credit creation
        if (!lastUpdate.reload) lastUpdate.reload = {};
        lastUpdate.reload[simKey] = (parseFloat(lastUpdate.reload[simKey]) || 0) + amt;
        lastUpdate.reload.simTotal = (parseFloat(lastUpdate.reload.simTotal) || 0) + amt;
        lastUpdate.reload.total = (parseFloat(lastUpdate.reload.total) || 0) + amt;
        lastUpdate.simTotal = (parseFloat(lastUpdate.simTotal) || 0) + amt;
        lastUpdate.reloadTotal = (parseFloat(lastUpdate.reloadTotal) || 0) + amt;
        lastUpdate.totalCapital = (parseFloat(lastUpdate.totalCapital) || 0) + amt;

        // 2. If it was already settled and added to balance, safely reverse the settlement addition
        if (item.status === 'paid' && item.settledDestination && item.settledDestination.type !== 'none') {
          const dest = item.settledDestination;
          if (dest.type === 'cash') {
            if (lastUpdate.reload) {
              lastUpdate.reload.cashInDrawer = Math.max(0, (parseFloat(lastUpdate.reload.cashInDrawer) || 0) - amt);
              lastUpdate.reload.total = Math.max(0, (parseFloat(lastUpdate.reload.total) || 0) - amt);
            }
            lastUpdate.cashInDrawer = Math.max(0, (parseFloat(lastUpdate.cashInDrawer) || 0) - amt);
            lastUpdate.totalCapital = Math.max(0, (parseFloat(lastUpdate.totalCapital) || 0) - amt);
          } else if (dest.type === 'bank' && lastUpdate.mobileRental?.banks) {
            const b = lastUpdate.mobileRental.banks.find(x => x.bank && x.bank.toLowerCase() === (dest.bankName || '').toLowerCase());
            if (b) {
              b.accountAmount = Math.max(0, (parseFloat(b.accountAmount) || 0) - amt);
              b.total = Math.max(0, (parseFloat(b.total) || 0) - amt);
              lastUpdate.mobileRental.totalAccountAmount = Math.max(0, (parseFloat(lastUpdate.mobileRental.totalAccountAmount) || 0) - amt);
              lastUpdate.mobileRental.grandTotal = Math.max(0, (parseFloat(lastUpdate.mobileRental.grandTotal) || 0) - amt);
              lastUpdate.bankTotal = Math.max(0, (parseFloat(lastUpdate.bankTotal) || 0) - amt);
              lastUpdate.totalCapital = Math.max(0, (parseFloat(lastUpdate.totalCapital) || 0) - amt);
            }
          } else if (dest.type === 'sim' && lastUpdate.reload) {
            const destSimKey = (dest.simName || 'dialog').toLowerCase();
            lastUpdate.reload[destSimKey] = Math.max(0, (parseFloat(lastUpdate.reload[destSimKey]) || 0) - amt);
            lastUpdate.reload.simTotal = Math.max(0, (parseFloat(lastUpdate.reload.simTotal) || 0) - amt);
            lastUpdate.reload.total = Math.max(0, (parseFloat(lastUpdate.reload.total) || 0) - amt);
            lastUpdate.simTotal = Math.max(0, (parseFloat(lastUpdate.simTotal) || 0) - amt);
            lastUpdate.reloadTotal = Math.max(0, (parseFloat(lastUpdate.reloadTotal) || 0) - amt);
            lastUpdate.totalCapital = Math.max(0, (parseFloat(lastUpdate.totalCapital) || 0) - amt);
          }
        }

        const prevUpdate = this.getLastUpdateBefore(item.shopId, lastUpdate.timestamp);
        lastUpdate.comparison = this.calculateComparison(lastUpdate, prevUpdate);

        const allUpdates = this.getUpdates(true);
        const idx = allUpdates.findIndex(u => u.id === lastUpdate.id);
        if (idx !== -1) {
          allUpdates[idx] = lastUpdate;
          this.saveUpdates(allUpdates);
          this._syncToFirebase('payment_tracker_updates', lastUpdate.id, lastUpdate);
        }
      }
    }

    credits = credits.filter(c => c.id !== creditId);
    this.saveCredits(credits);
    this._deleteFromFirebase('payment_tracker_updates', 'cred_' + creditId);
    this._deleteFromFirebase('payment_tracker_credits', creditId);
    return true;
  },

  getCreditsStats(shopId = null) {
    const list = this.getCredits(shopId, true);
    let totalPending = 0;
    let countPending = 0;
    let totalSettled = 0;
    let countSettled = 0;
    list.forEach(c => {
      const amt = parseFloat(c.amount) || 0;
      if (c.status === 'paid') {
        totalSettled += amt;
        countSettled++;
      } else {
        totalPending += amt;
        countPending++;
      }
    });
    return {
      totalCreditGiven: totalPending + totalSettled,
      totalPending,
      countPending,
      totalSettled,
      countSettled
    };
  },

  // ---- Router Reload Expenses ----
  getRouterExpenses(shopId = null) {
    let list = this._getStorage(this.ROUTER_EXPENSES_KEY, []);
    if (shopId) list = list.filter(r => r.shopId === shopId);
    return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  saveRouterExpenses(list) {
    this._dualSave(this.ROUTER_EXPENSES_KEY, list);
  },

  addRouterExpense(data) {
    const list = this.getRouterExpenses(null);
    const now = new Date();
    const item = {
      id: 'rexp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shopId: data.shopId,
      updateId: data.updateId || null,
      routerName: (data.routerName || 'Shop Router').trim(),
      network: data.network || 'Dialog',
      amount: parseFloat(data.amount) || 0,
      deductSource: data.deductSource || 'none',
      timestamp: data.timestamp || now.toISOString(),
      date: data.date || now.toISOString().split('T')[0],
      note: (data.note || '').trim()
    };
    item.docType = 'router_expense';
    list.unshift(item);
    this.saveRouterExpenses(list);
    this._syncToFirebase('payment_tracker_updates', 'routerexp_' + item.id, item);

    // If deductSource is specified, deduct from active balance
    if (data.deductSource && data.deductSource !== 'none' && data.shopId) {
      const lastUpdate = this.getLastUpdate(data.shopId);
      if (lastUpdate) {
        const amt = parseFloat(data.amount) || 0;
        if (data.deductSource === 'cash') {
          if (lastUpdate.reload) {
            lastUpdate.reload.cashInDrawer = Math.max(0, (parseFloat(lastUpdate.reload.cashInDrawer) || 0) - amt);
            lastUpdate.reload.total = Math.max(0, (parseFloat(lastUpdate.reload.total) || 0) - amt);
          }
          lastUpdate.cashInDrawer = Math.max(0, (parseFloat(lastUpdate.cashInDrawer) || 0) - amt);
          lastUpdate.totalCapital = Math.max(0, (parseFloat(lastUpdate.totalCapital) || 0) - amt);
        } else if (data.deductSource === 'sim') {
          const simKey = (data.network || 'dialog').toLowerCase();
          if (lastUpdate.reload && lastUpdate.reload[simKey] !== undefined) {
            lastUpdate.reload[simKey] = Math.max(0, (parseFloat(lastUpdate.reload[simKey]) || 0) - amt);
            lastUpdate.reload.simTotal = Math.max(0, (parseFloat(lastUpdate.reload.simTotal) || 0) - amt);
            lastUpdate.reload.total = Math.max(0, (parseFloat(lastUpdate.reload.total) || 0) - amt);
            lastUpdate.simTotal = Math.max(0, (parseFloat(lastUpdate.simTotal) || 0) - amt);
            lastUpdate.reloadTotal = Math.max(0, (parseFloat(lastUpdate.reloadTotal) || 0) - amt);
            lastUpdate.totalCapital = Math.max(0, (parseFloat(lastUpdate.totalCapital) || 0) - amt);
          }
        }

        const prevUpdate = this.getLastUpdateBefore(data.shopId, lastUpdate.timestamp);
        lastUpdate.comparison = this.calculateComparison(lastUpdate, prevUpdate);

        const allUpdates = this.getUpdates(true);
        const idx = allUpdates.findIndex(u => u.id === lastUpdate.id);
        if (idx !== -1) {
          allUpdates[idx] = lastUpdate;
          this.saveUpdates(allUpdates);
          this._syncToFirebase('payment_tracker_updates', lastUpdate.id, lastUpdate);
        }
      }
    }

    return item;
  },

  deleteRouterExpense(id) {
    let list = this.getRouterExpenses(null);
    list = list.filter(r => r.id !== id);
    this.saveRouterExpenses(list);
    this._deleteFromFirebase('payment_tracker_updates', 'routerexp_' + id);
    return true;
  },

  // ---- Distributor Top-ups Received ----
  getDistributorTopups(shopId = null) {
    let list = this._getStorage(this.DISTRIBUTOR_TOPUPS_KEY, []);
    if (shopId) list = list.filter(t => t.shopId === shopId);
    return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  saveDistributorTopups(list) {
    this._dualSave(this.DISTRIBUTOR_TOPUPS_KEY, list);
  },

  addDistributorTopup(data) {
    const list = this.getDistributorTopups(null);
    const now = new Date();
    const item = {
      id: 'topup_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shopId: data.shopId,
      updateId: data.updateId || null,
      distributorName: (data.distributorName || 'Distributor').trim(),
      networkOrBank: data.networkOrBank || 'Dialog',
      amount: parseFloat(data.amount) || 0,
      addToBalance: !!data.addToBalance,
      timestamp: data.timestamp || now.toISOString(),
      date: data.date || now.toISOString().split('T')[0],
      note: (data.note || '').trim()
    };
    item.docType = 'distributor_topup';
    list.unshift(item);
    this.saveDistributorTopups(list);
    this._syncToFirebase('payment_tracker_updates', 'topup_' + item.id, item);

    // If addToBalance is true, add to active balance
    if (data.addToBalance && data.shopId) {
      const lastUpdate = this.getLastUpdate(data.shopId);
      if (lastUpdate) {
        const amt = parseFloat(data.amount) || 0;
        const target = (data.networkOrBank || 'dialog').toLowerCase();

        if (target === 'cash') {
          if (!lastUpdate.reload) lastUpdate.reload = {};
          lastUpdate.reload.cashInDrawer = (parseFloat(lastUpdate.reload.cashInDrawer) || 0) + amt;
          lastUpdate.reload.total = (parseFloat(lastUpdate.reload.total) || 0) + amt;
          lastUpdate.cashInDrawer = (parseFloat(lastUpdate.cashInDrawer) || 0) + amt;
          lastUpdate.totalCapital = (parseFloat(lastUpdate.totalCapital) || 0) + amt;
        } else if (target === 'bank') {
          if (!lastUpdate.mobileRental) lastUpdate.mobileRental = { banks: [], totalAccountAmount: 0, totalCashInDrawer: 0, grandTotal: 0 };
          if (!Array.isArray(lastUpdate.mobileRental.banks)) lastUpdate.mobileRental.banks = [];
          if (lastUpdate.mobileRental.banks.length === 0) {
            lastUpdate.mobileRental.banks.push({ bank: 'Commercial Bank', accountAmount: amt, cashInDrawer: 0, total: amt });
          } else {
            lastUpdate.mobileRental.banks[0].accountAmount = (parseFloat(lastUpdate.mobileRental.banks[0].accountAmount) || 0) + amt;
            lastUpdate.mobileRental.banks[0].total = (parseFloat(lastUpdate.mobileRental.banks[0].total) || 0) + amt;
          }
          lastUpdate.mobileRental.totalAccountAmount = (parseFloat(lastUpdate.mobileRental.totalAccountAmount) || 0) + amt;
          lastUpdate.mobileRental.grandTotal = (parseFloat(lastUpdate.mobileRental.grandTotal) || 0) + amt;
          lastUpdate.bankTotal = (parseFloat(lastUpdate.bankTotal) || 0) + amt;
          lastUpdate.totalCapital = (parseFloat(lastUpdate.totalCapital) || 0) + amt;
        } else {
          // SIM (dialog, mobitel, airtel, hutch, ezcash)
          if (!lastUpdate.reload) lastUpdate.reload = {};
          const simKey = (target === 'ez cash' || target === 'ezcash') ? 'ezcash' : target;
          if (lastUpdate.reload[simKey] !== undefined) {
            lastUpdate.reload[simKey] = (parseFloat(lastUpdate.reload[simKey]) || 0) + amt;
          } else {
            lastUpdate.reload.dialog = (parseFloat(lastUpdate.reload.dialog) || 0) + amt;
          }
          lastUpdate.reload.simTotal = (parseFloat(lastUpdate.reload.simTotal) || 0) + amt;
          lastUpdate.reload.total = (parseFloat(lastUpdate.reload.total) || 0) + amt;
          lastUpdate.simTotal = (parseFloat(lastUpdate.simTotal) || 0) + amt;
          lastUpdate.reloadTotal = (parseFloat(lastUpdate.reloadTotal) || 0) + amt;
          lastUpdate.totalCapital = (parseFloat(lastUpdate.totalCapital) || 0) + amt;
        }

        const prevUpdate = this.getLastUpdateBefore(data.shopId, lastUpdate.timestamp);
        lastUpdate.comparison = this.calculateComparison(lastUpdate, prevUpdate);

        const allUpdates = this.getUpdates(true);
        const idx = allUpdates.findIndex(u => u.id === lastUpdate.id);
        if (idx !== -1) {
          allUpdates[idx] = lastUpdate;
          this.saveUpdates(allUpdates);
          this._syncToFirebase('payment_tracker_updates', lastUpdate.id, lastUpdate);
        }
      }
    }

    return item;
  },

  deleteDistributorTopup(id) {
    let list = this.getDistributorTopups(null);
    list = list.filter(t => t.id !== id);
    this.saveDistributorTopups(list);
    this._deleteFromFirebase('payment_tracker_updates', 'topup_' + id);
    return true;
  },

  // ---- Daily Evening Shift Summaries & POS Tally ----
  getShifts(shopId = null) {
    let list = this._getStorage(this.SHIFTS_KEY, []);
    if (shopId) {
      const activeShops = this.getShops(false);
      const isFirstShop = activeShops.length > 0 && activeShops[0].id === shopId;
      list = list.filter(s => s.shopId === shopId || (isFirstShop && (!s.shopId || s.shopId === 'main')));
    }
    return list.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
  },

  getShiftsForShop(shopId) {
    return this.getShifts(shopId);
  },

  getShiftsForShopByDate(shopId, date) {
    return this.getShifts(shopId).filter(s => s.date === date);
  },

  getShiftsByDate(date) {
    return this.getShifts(null).filter(s => s.date === date);
  },

  saveShifts(list) {
    this._dualSave(this.SHIFTS_KEY, list);
  },

  _deduplicateLegacyShifts() {
    try {
      const list = this.getShifts(null);
      if (!Array.isArray(list) || list.length === 0) return;

      const groups = new Map();
      list.forEach(s => {
        const key = (s.shopId || '') + '_' + (s.date || '');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
      });

      let hasDuplicates = false;
      const deduplicated = [];
      const idsToDeleteFromCloud = [];

      groups.forEach((group, key) => {
        if (group.length === 1) {
          deduplicated.push(group[0]);
        } else {
          hasDuplicates = true;
          // Sort so closing/evening shifts with sales come first
          group.sort((a, b) => {
            const aSales = parseFloat(a.posGrossSales || a.posSales || 0);
            const bSales = parseFloat(b.posGrossSales || b.posSales || 0);
            if (bSales !== aSales) return bSales - aSales;
            return new Date(b.timestamp) - new Date(a.timestamp);
          });

          const primary = { ...group[0] };
          // Find if any entry had a non-zero opening float from morning
          const morning = group.find(s => s.shiftType === 'morning' || (parseFloat(s.openingFloat) || 0) > 0);
          if (morning && (!primary.openingFloat || primary.openingFloat === 0)) {
            primary.openingFloat = morning.openingFloat;
          }

          // Combine any special notes
          const allNotes = group.map(s => s.specialNotes || s.cashNote).filter(Boolean);
          if (allNotes.length > 0) {
            primary.specialNotes = [...new Set(allNotes)].join(' | ');
            primary.cashNote = primary.specialNotes;
          }

          // Recalculate tally
          const posCash = primary.posCashSales || 0;
          const posGross = primary.posGrossSales || primary.posSales || posCash;
          const expenses = primary.drawerExpenses || primary.totalExpenses || 0;
          primary.expectedCash = (primary.openingFloat || 0) + posCash - expenses;
          primary.difference = (primary.countedCash || primary.actualCountedCash || 0) - primary.expectedCash;
          if (primary.difference > 0.01) primary.status = 'excess';
          else if (primary.difference < -0.01) primary.status = 'shortage';
          else primary.status = 'balanced';

          deduplicated.push(primary);

          // Collect redundant IDs to purge
          for (let i = 1; i < group.length; i++) {
            idsToDeleteFromCloud.push(group[i].id);
          }
        }
      });

      if (hasDuplicates) {
        deduplicated.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
        this.saveShifts(deduplicated);
        console.log(`✅ Cleaned up ${idsToDeleteFromCloud.length} duplicate shift rows into unified daily records`);
        idsToDeleteFromCloud.forEach(dupId => {
          this._deleteFromFirebase('payment_tracker_updates', 'shift_' + dupId);
          this._deleteFromFirebase('payment_tracker_shifts', dupId);
        });
      }
    } catch (e) {
      console.warn('Shift deduplication error:', e);
    }
  },

  updateShift(id, shiftData) {
    const list = this.getShifts(null);
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) return null;

    const existing = list[idx];
    const posCash = (shiftData.posCashSales !== undefined) ? (parseFloat(shiftData.posCashSales) || 0) : (existing.posCashSales || 0);
    const posCard = (shiftData.posCardSales !== undefined) ? (parseFloat(shiftData.posCardSales) || 0) : (existing.posCardSales || 0);
    const posCheque = (shiftData.posChequeSales !== undefined) ? (parseFloat(shiftData.posChequeSales) || 0) : (existing.posChequeSales || 0);
    const posGross = (shiftData.posGrossSales !== undefined) ? (parseFloat(shiftData.posGrossSales) || 0) : (existing.posGrossSales || (posCash + posCard + posCheque));
    const openingFloat = (shiftData.openingFloat !== undefined) ? (parseFloat(shiftData.openingFloat) || 0) : (existing.openingFloat || 0);
    const drawerExpenses = (shiftData.drawerExpenses !== undefined) ? (parseFloat(shiftData.drawerExpenses) || 0) : (existing.drawerExpenses || 0);
    const countedCash = (shiftData.countedCash !== undefined) ? (parseFloat(shiftData.countedCash) || 0) : (existing.countedCash || 0);

    const expectedCash = openingFloat + posCash - drawerExpenses;
    const difference = countedCash - expectedCash;
    let status = 'balanced';
    if (difference > 0.01) status = 'excess';
    else if (difference < -0.01) status = 'shortage';

    const updated = {
      ...existing,
      ...shiftData,
      id,
      shopId: shiftData.shopId || existing.shopId,
      shiftName: shiftData.shiftName || existing.shiftName || 'Daily Evening Closing',
      shiftType: shiftData.shiftType || existing.shiftType || 'evening',
      date: existing.date, // Preserve date
      timestamp: shiftData.timestamp || existing.timestamp,
      updatedAt: new Date().toISOString(),
      cashierName: (shiftData.cashierName || shiftData.cashier || existing.cashierName || existing.cashier || '').trim(),
      cashier: (shiftData.cashierName || shiftData.cashier || existing.cashierName || existing.cashier || '').trim(),
      openingFloat,
      posSales: posGross,
      posGrossSales: posGross,
      posCashSales: posCash,
      posCardSales: posCard,
      posChequeSales: posCheque,
      drawerExpenses,
      totalExpenses: drawerExpenses,
      expectedCash,
      countedCash,
      actualCountedCash: countedCash,
      difference,
      status,
      denominations: (shiftData.denominations !== undefined) ? shiftData.denominations : existing.denominations,
      specialNotes: (shiftData.specialNotes !== undefined) ? shiftData.specialNotes : (existing.specialNotes || existing.cashNote || ''),
      cashNote: (shiftData.specialNotes !== undefined) ? shiftData.specialNotes : (existing.specialNotes || existing.cashNote || ''),
      notes: (shiftData.notes !== undefined) ? shiftData.notes : (existing.notes || existing.note || ''),
      note: (shiftData.notes !== undefined) ? shiftData.notes : (existing.notes || existing.note || ''),
      docType: 'shift'
    };

    list[idx] = updated;
    this.saveShifts(list);
    this._syncToFirebase('payment_tracker_updates', 'shift_' + id, updated);
    this._syncToFirebase('payment_tracker_shifts', id, updated).catch(() => {});
    return updated;
  },

  addShift(data) {
    const list = this.getShifts(null);
    const now = new Date();
    const targetDate = data.date || now.toISOString().split('T')[0];
    const targetShopId = data.shopId || this.getActiveShopId();

    // Check if a shift already exists for this shop on this date!
    const existing = list.find(s => s.shopId === targetShopId && s.date === targetDate);
    if (existing) {
      console.log('Shift already exists for shop and date. Merging into existing shift record:', existing.id);
      return this.updateShift(existing.id, data);
    }

    const posCash = parseFloat(data.posCash || data.posCashSales) || 0;
    const posCard = parseFloat(data.posCard || data.posCardSales) || 0;
    const posCheque = parseFloat(data.posCheque || data.posChequeSales) || 0;
    const posTotal = (parseFloat(data.posSales || data.posGrossSales) || 0) || (posCash + posCard + posCheque);
    const openingFloat = parseFloat(data.openingFloat) || 0;
    const drawerExpenses = parseFloat(data.drawerExpenses || data.totalExpenses) || 0;
    const countedCash = parseFloat(data.actualCountedCash || data.countedCash) || 0;
    const expectedCash = openingFloat + posCash - drawerExpenses;
    const difference = countedCash - expectedCash;
    let status = 'balanced';
    if (difference > 0.01) status = 'excess';
    else if (difference < -0.01) status = 'shortage';

    const item = {
      id: 'shift_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shopId: targetShopId,
      shiftName: data.shiftName || 'Daily Closing',
      shiftType: data.shiftType || 'evening',
      date: targetDate,
      timestamp: data.timestamp || now.toISOString(),
      cashierName: (data.cashierName || data.cashier || '').trim(),
      cashier: (data.cashierName || data.cashier || '').trim(),
      openingFloat,
      posSales: posTotal,
      posGrossSales: posTotal,
      posCashSales: posCash,
      posCardSales: posCard,
      posChequeSales: posCheque,
      reloadCashCollected: 0,
      reloadCashInDrawer: 0,
      drawerExpenses,
      totalExpenses: drawerExpenses,
      ownerDrawings: parseFloat(data.ownerDrawings) || 0,
      expectedCash,
      actualCountedCash: countedCash,
      countedCash: countedCash,
      difference,
      status,
      denominations: data.denominations || null,
      note: (data.note || data.notes || '').trim(),
      notes: (data.note || data.notes || '').trim(),
      specialNotes: (data.specialNotes || data.cashNote || '').trim(),
      cashNote: (data.specialNotes || data.cashNote || '').trim(),
      docType: 'shift'
    };
    list.unshift(item);
    this.saveShifts(list);
    this._syncToFirebase('payment_tracker_updates', 'shift_' + item.id, item);
    this._syncToFirebase('payment_tracker_shifts', item.id, item).catch(() => {});
    return item;
  },

  deleteShift(id) {
    let list = this.getShifts(null);
    list = list.filter(s => s.id !== id);
    this.saveShifts(list);
    this._deleteFromFirebase('payment_tracker_updates', 'shift_' + id);
    this._deleteFromFirebase('payment_tracker_shifts', id);
    return true;
  },

  // ---- Daily Expenses & Owner Wallet ----
  getExpenses(shopId = null, date = null) {
    let list = this._getStorage(this.EXPENSES_KEY, []);
    if (shopId) {
      const activeShops = this.getShops(false);
      const isFirstShop = activeShops.length > 0 && activeShops[0].id === shopId;
      list = list.filter(e => e.shopId === shopId || (isFirstShop && (!e.shopId || e.shopId === 'main')));
    }
    if (date) list = list.filter(e => e.date === date);
    return list.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
  },

  getExpensesForShop(shopId) {
    return this.getExpenses(shopId);
  },

  getExpensesForShopByDate(shopId, date) {
    return this.getExpenses(shopId, date);
  },

  getExpensesByDate(date) {
    return this.getExpenses(null, date);
  },

  saveExpenses(list) {
    this._dualSave(this.EXPENSES_KEY, list);
  },

  addExpense(data) {
    const list = this.getExpenses(null);
    const now = new Date();
    const item = {
      id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shopId: data.shopId,
      category: data.category || 'other', // 'owner_drawing', 'shop_stock', 'staff_meal', 'bills_rent', 'maintenance', 'other'
      amount: parseFloat(data.amount) || 0,
      description: (data.description || '').trim(),
      paidFrom: data.paidFrom || 'cash', // 'cash', 'bank', 'personal'
      deductFromBalance: !!data.deductFromBalance,
      date: data.date || now.toISOString().split('T')[0],
      timestamp: data.timestamp || now.toISOString()
    };
    item.docType = 'expense';
    list.unshift(item);
    this.saveExpenses(list);
    this._syncToFirebase('payment_tracker_updates', 'exp_' + item.id, item);
    this._syncToFirebase('payment_tracker_expenses', item.id, item).catch(() => {});

    // If deductFromBalance is true and shopId given, deduct from shop active cash drawer
    if (data.deductFromBalance && data.shopId && item.paidFrom === 'cash') {
      const lastUpdate = this.getLastUpdate(data.shopId);
      if (lastUpdate) {
        const amt = item.amount;
        if (lastUpdate.reload) {
          lastUpdate.reload.cashInDrawer = Math.max(0, (parseFloat(lastUpdate.reload.cashInDrawer) || 0) - amt);
          lastUpdate.reload.total = Math.max(0, (parseFloat(lastUpdate.reload.total) || 0) - amt);
        }
        lastUpdate.cashInDrawer = Math.max(0, (parseFloat(lastUpdate.cashInDrawer) || 0) - amt);
        lastUpdate.totalCapital = Math.max(0, (parseFloat(lastUpdate.totalCapital) || 0) - amt);
        const prevUpdate = this.getLastUpdateBefore(data.shopId, lastUpdate.timestamp);
        lastUpdate.comparison = this.calculateComparison(lastUpdate, prevUpdate);
        const allUpdates = this.getUpdates(true);
        const idx = allUpdates.findIndex(u => u.id === lastUpdate.id);
        if (idx !== -1) {
          allUpdates[idx] = lastUpdate;
          this.saveUpdates(allUpdates);
        }
      }
    }

    return item;
  },

  deleteExpense(id) {
    let list = this.getExpenses(null);
    list = list.filter(e => e.id !== id);
    this.saveExpenses(list);
    this._deleteFromFirebase('payment_tracker_updates', 'exp_' + id);
    this._deleteFromFirebase('payment_tracker_expenses', id);
    return true;
  },

  // ---- Calculation Engine ----

  calculateReloadTotal(u) {
    if (!u) return 0;
    if (typeof u === 'object') {
      if (u.total !== undefined) return parseFloat(u.total) || 0;
      if (u.dialog !== undefined) {
        return (parseFloat(u.dialog) || 0) + (parseFloat(u.airtel) || 0) +
               (parseFloat(u.mobitel) || 0) + (parseFloat(u.hutch) || 0) +
               (parseFloat(u.ezcash) || 0) + (parseFloat(u.cashInDrawer) || 0);
      }
      if (u.simTotal !== undefined) return parseFloat(u.simTotal) || 0;
    }
    return parseFloat(u) || 0;
  },

  calculateBankTotal(b) {
    if (!b) return 0;
    if (typeof b === 'number') return b;
    return (parseFloat(b.accountAmount) || 0) + (parseFloat(b.cashInDrawer) || 0);
  },

  calculateMobileRentalGrandTotal(m) {
    if (!m) return 0;
    if (typeof m === 'object') {
      if (m.grandTotal !== undefined) return parseFloat(m.grandTotal) || 0;
      if (m.banks) return m.banks.reduce((sum, b) => sum + this.calculateBankTotal(b), 0);
    }
    return parseFloat(m) || 0;
  },

  calculateComparison(currentUpdate, previousUpdate) {
    const curr = this.extractValues(currentUpdate);
    const creditsGiven = currentUpdate?.adjustments?.creditsTotal || (Array.isArray(currentUpdate?.adjustments?.credits) ? currentUpdate.adjustments.credits.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0) : 0);
    const routerExpenses = currentUpdate?.adjustments?.routersTotal || (Array.isArray(currentUpdate?.adjustments?.routerExpenses) ? currentUpdate.adjustments.routerExpenses.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0) : 0);
    const topupsReceived = currentUpdate?.adjustments?.topupsTotal || (Array.isArray(currentUpdate?.adjustments?.distributorTopups) ? currentUpdate.adjustments.distributorTopups.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0) : 0);

    if (!previousUpdate) {
      return {
        isFirst: true,
        sim: { current: curr.simTotal, previous: 0, diff: 0, type: 'neutral' },
        bank: { current: curr.bankTotal, previous: 0, diff: 0, type: 'neutral' },
        cash: { current: curr.totalCash, previous: 0, diff: 0, type: 'neutral' },
        reload: { current: curr.reloadTotal, previous: 0, diff: 0, type: 'neutral' },
        mobileRental: { current: curr.bankTotal, previous: 0, diff: 0, type: 'neutral' },
        physical: { current: curr.totalCapital, previous: 0, diff: 0, type: 'neutral' },
        overall: { current: curr.totalCapital, previous: 0, diff: 0, type: 'neutral' },
        adjustments: { credits: creditsGiven, routers: routerExpenses, topups: topupsReceived }
      };
    }

    const prev = this.extractValues(previousUpdate);

    const simDiff = curr.simTotal - prev.simTotal;
    const bankDiff = curr.bankTotal - prev.bankTotal;
    const cashDiff = curr.totalCash - prev.totalCash;
    const physicalDiff = curr.totalCapital - prev.totalCapital;

    // Adjusted Operating Net Difference between the two days:
    // (Ending Assets + Uncollected Receivables + Operating Expenses) - (Starting Assets + Injected Capital)
    const adjustedDiff = (curr.totalCapital + creditsGiven + routerExpenses) - (prev.totalCapital + topupsReceived);
    const overallType = Math.abs(adjustedDiff) < 0.5 ? 'neutral' : (adjustedDiff > 0 ? 'profit' : 'loss');

    return {
      isFirst: false,
      previousUpdateTime: previousUpdate.timestamp,
      sim: {
        current: curr.simTotal,
        previous: prev.simTotal,
        diff: simDiff,
        type: 'neutral' // Movement between assets is neutral, not loss!
      },
      bank: {
        current: curr.bankTotal,
        previous: prev.bankTotal,
        diff: bankDiff,
        type: 'neutral'
      },
      cash: {
        current: curr.totalCash,
        previous: prev.totalCash,
        diff: cashDiff,
        type: 'neutral'
      },
      reload: {
        current: curr.reloadTotal,
        previous: prev.reloadTotal,
        diff: curr.reloadTotal - prev.reloadTotal,
        type: 'neutral'
      },
      mobileRental: {
        current: curr.bankTotal,
        previous: prev.bankTotal,
        diff: bankDiff,
        type: 'neutral'
      },
      physical: {
        current: curr.totalCapital,
        previous: prev.totalCapital,
        diff: physicalDiff,
        type: Math.abs(physicalDiff) < 0.5 ? 'neutral' : (physicalDiff > 0 ? 'profit' : 'loss')
      },
      overall: {
        current: curr.totalCapital + creditsGiven + routerExpenses,
        previous: prev.totalCapital + topupsReceived,
        diff: adjustedDiff,
        type: overallType
      },
      adjustments: {
        credits: creditsGiven,
        routers: routerExpenses,
        topups: topupsReceived
      }
    };
  },

  getShopLatestComparison(shopId) {
    const lastUpdate = this.getLastUpdate(shopId);
    if (!lastUpdate || !lastUpdate.comparison || lastUpdate.comparison.isFirst) return null;
    return lastUpdate.comparison;
  },

  getGlobalStats() {
    const shops = this.getShops(false); // only active shops
    let totalOverallDiff = 0;
    let totalReloadDiff = 0;
    let totalBankDiff = 0;
    let totalCashDiff = 0;
    let totalReload = 0;
    let totalBank = 0;
    let totalCash = 0;
    let totalSim = 0;
    let hasData = false;
    let updatesCount = 0;

    const shopSummaries = [];

    shops.forEach(shop => {
      const lastUpdate = this.getLastUpdate(shop.id);
      const today = this.getTodayDate();
      const todayCount = this.getUpdatesForShopByDate(shop.id, today).length;
      updatesCount += todayCount;

      const shopData = {
        shop,
        lastUpdate,
        todayCount,
        hasData: !!lastUpdate,
        reloadTotal: 0,
        bankTotal: 0,
        simTotal: 0,
        cashInDrawer: 0,
        totalCapital: 0,
        diffs: {
          overall: 0,
          reload: 0,
          bank: 0,
          cash: 0
        }
      };

      if (lastUpdate) {
        hasData = true;
        const vals = this.extractValues(lastUpdate);
        shopData.reloadTotal = vals.reloadTotal;
        shopData.bankTotal = vals.bankTotal;
        shopData.simTotal = vals.simTotal;
        shopData.cashInDrawer = vals.totalCash;
        shopData.totalCapital = vals.totalCapital;

        totalReload += vals.reloadTotal;
        totalBank += vals.bankTotal;
        totalSim += vals.simTotal;
        totalCash += vals.totalCash;

        if (lastUpdate.comparison && !lastUpdate.comparison.isFirst) {
          const c = lastUpdate.comparison;
          const od = c.overall?.diff || 0;
          const rd = c.reload?.diff || 0;
          const bd = c.bank?.diff || c.mobileRental?.diff || 0;
          const cd = c.cash?.diff || 0;

          shopData.diffs.overall = od;
          shopData.diffs.reload = rd;
          shopData.diffs.bank = bd;
          shopData.diffs.cash = cd;

          totalOverallDiff += od;
          totalReloadDiff += rd;
          totalBankDiff += bd;
          totalCashDiff += cd;
        }
      }
      shopSummaries.push(shopData);
    });

    const totalCapital = totalReload + totalBank;

    return {
      hasData,
      totalCapital,
      reloadTotal: totalReload,
      bankTotal: totalBank,
      simTotal: totalSim,
      cashTotal: totalCash,
      todayUpdatesCount: updatesCount,
      diffs: {
        overall: totalOverallDiff,
        reload: totalReloadDiff,
        bank: totalBankDiff,
        cash: totalCashDiff,
        sim: totalReloadDiff,
        mobile: totalBankDiff
      },
      shopSummaries
    };
  },

  // ---- Auto Backup System ----

  autoBackup() {
    const lastBackup = localStorage.getItem(this.BACKUP_KEY);
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Auto-download backup once per day (first update of the day)
    if (!lastBackup || !lastBackup.startsWith(today)) {
      this._downloadBackup();
      localStorage.setItem(this.BACKUP_KEY, now.toISOString());
    }
  },

  forceBackup() {
    this._downloadBackup();
    localStorage.setItem(this.BACKUP_KEY, new Date().toISOString());
  },

  _downloadBackup() {
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || !document.createElement) return;
    try {
      const data = this.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shop-tracker-auto-backup-${this.getTodayDate()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('✅ Auto-backup downloaded');
    } catch (e) {
      console.error('Auto-backup failed:', e);
    }
  },

  getLastBackupTime() {
    return localStorage.getItem(this.BACKUP_KEY);
  },

  // ---- Reports ----

  getDateRange(shopId, startDate, endDate) {
    return this.getUpdatesForShop(shopId)
      .filter(u => u.date >= startDate && u.date <= endDate);
  },

  getDailySummary(shopId, date) {
    const updates = this.getUpdatesForShopByDate(shopId, date);
    if (updates.length === 0) return null;

    const lastUpdate = updates[updates.length - 1]; // oldest of the day (first update)
    const latestUpdate = updates[0]; // newest (last update)
    const vals = this.extractValues(latestUpdate);

    return {
      date,
      updateCount: updates.length,
      firstUpdate: lastUpdate,
      lastUpdate: latestUpdate,
      simTotal: vals.simTotal,
      bankTotal: vals.bankTotal,
      cashInDrawer: vals.cashInDrawer,
      totalCapital: vals.totalCapital,
      overallComparison: latestUpdate.comparison,
      // legacy mappings:
      reloadTotal: vals.simTotal,
      mobileRentalTotal: vals.bankTotal
    };
  },

  getStatsForPeriod(shopId, period) {
    let updates = shopId ? this.getUpdatesForShop(shopId) : this.getUpdates(false);
    
    const now = new Date();
    let startDate = '';
    
    if (period === 'today') {
      startDate = now.toISOString().split('T')[0];
    } else if (period === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yDate = y.toISOString().split('T')[0];
      updates = updates.filter(u => u.date === yDate);
    } else if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay()); // Sunday
      startDate = d.toISOString().split('T')[0];
    } else if (period === 'month') {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (period === 'year') {
      startDate = `${now.getFullYear()}-01-01`;
    }
    
    if (period !== 'all' && period !== 'yesterday') {
      updates = updates.filter(u => u.date >= startDate);
    }

    if (updates.length === 0) {
      return { net: 0, type: 'neutral', totalProfit: 0, totalLoss: 0, simNet: 0, bankNet: 0, cashNet: 0 };
    }

    // Sort chronologically (oldest to newest)
    const sorted = [...updates].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const firstUpdate = sorted[0];
    const lastUpdate = sorted[sorted.length - 1];

    const baseline = this.getLastUpdateBefore(shopId || firstUpdate.shopId, firstUpdate.timestamp);
    const openingVals = baseline ? this.extractValues(baseline) : this.extractValues(firstUpdate);
    const closingVals = this.extractValues(lastUpdate);

    let creditsTotal = 0;
    let routersTotal = 0;
    let topupsTotal = 0;
    sorted.forEach(u => {
      creditsTotal += u.adjustments?.creditsTotal || 0;
      routersTotal += u.adjustments?.routersTotal || 0;
      topupsTotal += u.adjustments?.topupsTotal || 0;
    });

    const simNet = closingVals.simTotal - openingVals.simTotal;
    const bankNet = closingVals.bankTotal - openingVals.bankTotal;
    const cashNet = closingVals.totalCash - openingVals.totalCash;

    // True Net Operating Profit/Loss across the period
    const net = (closingVals.totalCapital + creditsTotal + routersTotal) - (openingVals.totalCapital + topupsTotal);
    const type = Math.abs(net) < 1 ? 'neutral' : (net > 0 ? 'profit' : 'loss');

    return {
      net,
      type,
      totalProfit: net > 0 ? net : 0,
      totalLoss: net < 0 ? Math.abs(net) : 0,
      simNet,
      bankNet,
      cashNet
    };
  },

  // Get unique dates for a shop
  getUniqueDates(shopId) {
    const updates = this.getUpdatesForShop(shopId);
    const dates = [...new Set(updates.map(u => u.date))];
    return dates.sort((a, b) => b.localeCompare(a));
  },

  // ---- Utility ----

  formatDenominationsText(denoms, isDetailed = true) {
    if (!denoms) return [];
    const multipliers = [
      { key: 'n5000', label: 'Rs. 5,000', val: 5000 },
      { key: 'n2000', label: 'Rs. 2,000', val: 2000 },
      { key: 'n1000', label: 'Rs. 1,000', val: 1000 },
      { key: 'n500',  label: 'Rs. 500',   val: 500 },
      { key: 'n100',  label: 'Rs. 100',   val: 100 },
      { key: 'n50',   label: 'Rs. 50',    val: 50 },
      { key: 'n20',   label: 'Rs. 20',    val: 20 },
      { key: 'n10',   label: 'Rs. 10',    val: 10 }
    ];
    const lines = [];
    multipliers.forEach(m => {
      const cnt = parseInt(denoms[m.key] || 0, 10);
      if (cnt > 0) {
        const sub = cnt * m.val;
        if (isDetailed) {
          lines.push(`• 💵 ${m.label} × ${cnt} = ${this.formatCurrency(sub)}`);
        } else {
          lines.push(`${m.val}x${cnt}`);
        }
      }
    });
    const coins = parseFloat(denoms.coins) || 0;
    if (coins > 0) {
      if (isDetailed) {
        lines.push(`• 🪙 Coins / Small Change = ${this.formatCurrency(coins)}`);
      } else {
        lines.push(`Coins:${this.formatCurrency(coins)}`);
      }
    }
    return lines;
  },

  formatCurrency(amount) {
    return 'Rs.' + parseFloat(amount || 0).toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  formatDateTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleDateString('si-LK') + ' ' + d.toLocaleTimeString('si-LK', {
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('si-LK', { year: 'numeric', month: 'long', day: 'numeric' });
  },

  formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString('si-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  },

  getTodayDate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // ================================================================
  // DEVICE CREDITS (SHORT-TERM PHONE LOANS)
  // ================================================================
  getDeviceCredits(shopId = null) {
    try {
      const all = this._getStorage(this.DEVICE_CREDITS_KEY, []);
      if (shopId && shopId !== 'all') {
        return all.filter(c => !c.shopId || c.shopId === shopId);
      }
      return all;
    } catch {
      return [];
    }
  },

  saveDeviceCredits(credits) {
    this._dualSave(this.DEVICE_CREDITS_KEY, credits);
  },

  async getFullDeviceCredit(id) {
    const list = this.getDeviceCredits();
    let record = list.find(c => c.id === id);
    if (record && record.customerPhoto && record.customerPhoto !== '[stored_in_idb]') {
      return record;
    }
    const idbCredits = await IDB.load(this.DEVICE_CREDITS_KEY);
    if (Array.isArray(idbCredits)) {
      const full = idbCredits.find(c => c.id === id);
      if (full) {
        if (!this._cache) this._cache = {};
        this._cache[this.DEVICE_CREDITS_KEY] = idbCredits;
        return full;
      }
    }
    return record;
  },

  addDeviceCredit(creditData) {
    const credits = this.getDeviceCredits();
    const id = 'dc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const totalPrice = parseFloat(creditData.totalPrice) || 0;
    const downPayment = parseFloat(creditData.downPayment) || 0;
    const balanceDue = Math.max(0, totalPrice - downPayment);
    const status = balanceDue <= 0.01 ? 'settled' : 'active';

    const targetShopId = creditData.shopId || this.getActiveShopId();
    const allShops = this.getShops(true);
    const targetShop = allShops.find(s => s.id === targetShopId);
    const targetShopName = creditData.shopName || (targetShop ? targetShop.name : 'Main Shop');

    const newCredit = {
      id,
      shopId: targetShopId,
      shopName: targetShopName,
      customerName: creditData.customerName?.trim() || '',
      primaryPhone: creditData.primaryPhone?.trim() || '',
      secondaryPhone: creditData.secondaryPhone?.trim() || '',
      nicNumber: creditData.nicNumber?.trim() || '',
      address: creditData.address?.trim() || '',
      customerPhoto: creditData.customerPhoto || '',
      nicFrontPhoto: creditData.nicFrontPhoto || '',
      nicBackPhoto: creditData.nicBackPhoto || '',
      phoneModel: creditData.phoneModel?.trim() || '',
      imeiNumber: creditData.imeiNumber?.trim() || '',
      imeiNumber2: creditData.imeiNumber2?.trim() || '',
      devicePhoto: creditData.devicePhoto || '',
      totalPrice,
      downPayment,
      balanceDue,
      agreementDate: creditData.agreementDate || this.getTodayDate(),
      creditPeriodDays: parseInt(creditData.creditPeriodDays, 10) || 14,
      dueDate: creditData.dueDate || '',
      status,
      payments: creditData.payments || [],
      notes: creditData.notes?.trim() || '',
      signature: creditData.signature || '',
      signedAt: creditData.signedAt || (creditData.signature ? new Date().toISOString() : ''),
      agreementLanguage: creditData.agreementLanguage || 'si',
      createdAt: creditData.createdAt || new Date().toISOString()
    };
    credits.unshift(newCredit);
    this.saveDeviceCredits(credits);
    this._syncToFirebase('payment_tracker_updates', 'devcred_' + newCredit.id, { ...newCredit, docType: 'device_credit' });
    return newCredit;
  },

  async syncDeviceCreditToCloud(id, creditRecord = null) {
    if (!creditRecord) {
      const credits = this.getDeviceCredits();
      creditRecord = credits.find(c => c.id === id);
    }
    if (!creditRecord || !window.FS) return false;
    const docId = id.startsWith('devcred_') ? id : ('devcred_' + id);
    return await this._syncToFirebase('payment_tracker_updates', docId, {
      ...creditRecord,
      docType: 'device_credit'
    });
  },

  async syncAllLocalDeviceCreditsToCloud() {
    if (!window.FS) return { count: 0, success: false };
    const local = this.getDeviceCredits();
    if (!local || local.length === 0) return { count: 0, success: true };

    let uploaded = 0;
    for (const credit of local) {
      try {
        const docId = credit.id.startsWith('devcred_') ? credit.id : ('devcred_' + credit.id);
        await window.FS.collection('payment_tracker_updates').doc(docId).set({
          ...credit,
          docType: 'device_credit'
        }, { merge: true });
        uploaded++;
      } catch (e) {
        console.warn('Failed to push credit to cloud:', credit.id, e);
      }
    }
    return { count: uploaded, success: true };
  },

  saveCreditSignature(id, signatureDataUrl, lang = 'si') {
    const credits = this.getDeviceCredits();
    const idx = credits.findIndex(c => c.id === id);
    if (idx === -1) return null;
    credits[idx].signature = signatureDataUrl;
    credits[idx].signedAt = new Date().toISOString();
    credits[idx].agreementLanguage = lang;
    this.saveDeviceCredits(credits);
    this._syncToFirebase('payment_tracker_updates', 'devcred_' + id, { ...credits[idx], docType: 'device_credit' });
    return credits[idx];
  },

  updateDeviceCredit(id, creditData) {
    const credits = this.getDeviceCredits();
    const idx = credits.findIndex(c => c.id === id);
    if (idx === -1) return null;
    
    // Recalculate balance if financials updated
    const existing = credits[idx];
    const totalPrice = (creditData.totalPrice !== undefined) ? (parseFloat(creditData.totalPrice) || 0) : existing.totalPrice;
    const downPayment = (creditData.downPayment !== undefined) ? (parseFloat(creditData.downPayment) || 0) : existing.downPayment;
    const payments = creditData.payments || existing.payments || [];
    const totalPayments = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const balanceDue = Math.max(0, totalPrice - downPayment - totalPayments);
    const status = balanceDue <= 0.01 ? 'settled' : (creditData.status || existing.status);

    credits[idx] = {
      ...existing,
      ...creditData,
      totalPrice,
      downPayment,
      balanceDue,
      status,
      updatedAt: new Date().toISOString()
    };
    this.saveDeviceCredits(credits);
    this._syncToFirebase('payment_tracker_updates', 'devcred_' + id, { ...credits[idx], docType: 'device_credit' });
    return credits[idx];
  },

  addDevicePayment(id, paymentData) {
    const credits = this.getDeviceCredits();
    const credit = credits.find(c => c.id === id);
    if (!credit) return null;

    const pAmount = parseFloat(paymentData.amount) || 0;
    if (pAmount <= 0) return credit;

    const payment = {
      id: 'pay_' + Date.now(),
      date: paymentData.date || this.getTodayDate(),
      amount: pAmount,
      note: paymentData.note?.trim() || '',
      cashier: paymentData.cashier || ''
    };

    if (!Array.isArray(credit.payments)) credit.payments = [];
    credit.payments.push(payment);

    const totalPaid = (credit.downPayment || 0) + credit.payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    credit.balanceDue = Math.max(0, credit.totalPrice - totalPaid);

    if (credit.balanceDue <= 0.01) {
      credit.status = 'settled';
      credit.settledAt = new Date().toISOString();
    }

    this.saveDeviceCredits(credits);
    this._syncToFirebase('payment_tracker_updates', 'devcred_' + id, { ...credit, docType: 'device_credit' });
    return credit;
  },

  deleteDeviceCredit(id) {
    const credits = this.getDeviceCredits();
    const filtered = credits.filter(c => c.id !== id);
    this.saveDeviceCredits(filtered);
    this._deleteFromFirebase('payment_tracker_updates', 'devcred_' + id);
    return true;
  },

  getDeviceCreditStats(shopId = null) {
    const credits = this.getDeviceCredits(shopId);
    const today = this.getTodayDate();

    let totalAgreements = credits.length;
    let totalLoanValue = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let activeCount = 0;
    let dueTodayCount = 0;
    let overdueCount = 0;
    let settledCount = 0;

    credits.forEach(c => {
      totalLoanValue += (c.totalPrice || 0);
      const paid = (c.downPayment || 0) + (c.payments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      totalCollected += paid;
      totalOutstanding += (c.balanceDue || 0);

      if (c.balanceDue <= 0.01 || c.status === 'settled') {
        settledCount++;
      } else {
        activeCount++;
        if (c.dueDate) {
          if (c.dueDate === today) {
            dueTodayCount++;
          } else if (c.dueDate < today) {
            overdueCount++;
          }
        }
      }
    });

    return {
      totalAgreements,
      totalLoanValue,
      totalCollected,
      totalOutstanding,
      activeCount,
      dueTodayCount,
      overdueCount,
      settledCount
    };
  },

  getDueDeviceCredits(shopId = null) {
    const credits = this.getDeviceCredits(shopId);
    const today = this.getTodayDate();
    return credits.filter(c => {
      if (c.balanceDue <= 0.01 || c.status === 'settled') return false;
      return c.dueDate && c.dueDate <= today;
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  },

  // ================================================================
  // REP RELOAD CREDITS (STOCK ON CREDIT FROM DISTRIBUTOR REPS)
  // ================================================================
  getRepCredits(shopId = null, includeSettled = true) {
    try {
      let list = this._getStorage(this.REP_CREDITS_KEY, []);
      if (shopId && shopId !== 'all') list = list.filter(r => r.shopId === shopId);
      if (!includeSettled) list = list.filter(r => r.status === 'pending');
      return list.sort((a, b) => new Date(b.timestamp || b.takenDate) - new Date(a.timestamp || a.takenDate));
    } catch (e) {
      return [];
    }
  },

  saveRepCredits(list) {
    this._dualSave(this.REP_CREDITS_KEY, list);
  },

  addRepCredit(data) {
    const list = this.getRepCredits(null, true);
    const now = new Date();
    const creditDays = parseInt(data.creditDays, 10) || 3;
    const takenDate = data.takenDate || this.getTodayDate();
    
    // Auto calculate due date if missing
    let dueDate = data.dueDate;
    if (!dueDate) {
      const d = new Date(takenDate);
      d.setDate(d.getDate() + creditDays);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dueDate = `${year}-${month}-${day}`;
    }

    const item = {
      id: 'repcred_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shopId: data.shopId,
      network: data.network || 'Dialog',
      repName: (data.repName || 'Distributor Rep').trim(),
      repPhone: (data.repPhone || '').trim(),
      amount: parseFloat(data.amount) || 0,
      takenDate: takenDate,
      dueDate: dueDate,
      creditDays: creditDays,
      status: 'pending', // 'pending' or 'settled'
      paidAmount: 0,
      paidDate: '',
      paidFrom: '', // 'cash' or 'bank'
      settledBy: '',
      settledNotes: '',
      notes: (data.notes || '').trim(),
      timestamp: data.timestamp || now.toISOString(),
      docType: 'rep_credit'
    };

    list.unshift(item);
    this.saveRepCredits(list);
    this._syncToFirebase('payment_tracker_updates', item.id, item);
    return item;
  },

  settleRepCredit(id, settlement = {}) {
    const list = this.getRepCredits(null, true);
    const item = list.find(r => r.id === id);
    if (!item) return false;

    item.status = 'settled';
    item.paidAmount = parseFloat(settlement.paidAmount) || item.amount;
    item.paidDate = settlement.paidDate || this.getTodayDate();
    item.paidFrom = settlement.paidFrom || 'cash';
    item.settledBy = settlement.settledBy || '';
    item.settledNotes = (settlement.notes || '').trim();
    item.settledAt = new Date().toISOString();
    item.docType = 'rep_credit';

    this.saveRepCredits(list);
    this._syncToFirebase('payment_tracker_updates', item.id, item);
    return item;
  },

  deleteRepCredit(id) {
    let list = this.getRepCredits(null, true);
    list = list.filter(r => r.id !== id);
    this.saveRepCredits(list);
    this._deleteFromFirebase('payment_tracker_updates', id);
    return true;
  },

  getRepCreditsStats(shopId = null) {
    const list = this.getRepCredits(shopId, true);
    const today = this.getTodayDate();
    let totalPending = 0;
    let pendingCount = 0;
    let dueTodayCount = 0;
    let overdueCount = 0;
    let totalSettled = 0;
    let settledCount = 0;
    const byNetwork = { Dialog: 0, Mobitel: 0, Airtel: 0, Hutch: 0, EzCash: 0, Other: 0 };

    list.forEach(r => {
      if (r.status === 'pending') {
        const amt = parseFloat(r.amount) || 0;
        totalPending += amt;
        pendingCount++;
        const net = r.network || 'Other';
        if (byNetwork[net] !== undefined) byNetwork[net] += amt;
        else byNetwork.Other = (byNetwork.Other || 0) + amt;

        if (r.dueDate) {
          if (r.dueDate === today) dueTodayCount++;
          else if (r.dueDate < today) overdueCount++;
        }
      } else if (r.status === 'settled') {
        totalSettled += (parseFloat(r.paidAmount || r.amount) || 0);
        settledCount++;
      }
    });

    return { totalPending, pendingCount, dueTodayCount, overdueCount, totalSettled, settledCount, byNetwork };
  },

    // Export all data
  exportData() {
    return JSON.stringify({
      shops: this.getShops(),
      updates: this.getUpdates(),
      credits: this.getCredits(null, true),
      routerExpenses: this.getRouterExpenses(null),
      distributorTopups: this.getDistributorTopups(null),
      shifts: this.getShifts(null),
      expenses: this.getExpenses(null),
      repCredits: this.getRepCredits(null, true),
      deviceCredits: this.getDeviceCredits(null),
      activeShopId: this.getActiveShopId(),
      exportedAt: new Date().toISOString(),
      version: '4.0'
    }, null, 2);
  },

  // Import data
  importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.shops) this.saveShops(data.shops);
      if (data.updates) this.saveUpdates(data.updates);
      if (data.credits) this.saveCredits(data.credits);
      if (data.routerExpenses) this.saveRouterExpenses(data.routerExpenses);
      if (data.distributorTopups) this.saveDistributorTopups(data.distributorTopups);
      if (data.shifts) this.saveShifts(data.shifts);
      if (data.expenses) this.saveExpenses(data.expenses);
      if (data.repCredits) this.saveRepCredits(data.repCredits);
      if (data.deviceCredits) this.saveDeviceCredits(data.deviceCredits);
      if (data.activeShopId) this.setActiveShop(data.activeShopId);
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  },

  // ---- Bank Deposits & Cash Outs ----
  getBankTransactions(shopId = null, date = null) {
    let list = this._getStorage(this.BANK_TRANSACTIONS_KEY, []);
    if (shopId) {
      const activeShops = this.getShops(false);
      const isFirstShop = activeShops.length > 0 && activeShops[0].id === shopId;
      list = list.filter(t => t.shopId === shopId || (isFirstShop && (!t.shopId || t.shopId === 'main')));
    }
    if (date) list = list.filter(t => t.date === date);
    return list.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
  },

  saveBankTransactions(list) {
    this._dualSave(this.BANK_TRANSACTIONS_KEY, list);
  },

  addBankTransaction(data) {
    const list = this.getBankTransactions(null);
    const now = new Date();
    const id = data.id || ('btx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
    const item = {
      id: id,
      shopId: data.shopId,
      type: data.type || 'deposit', // 'deposit', 'handover', or 'cashout'
      bank: (data.bank || '').trim(),
      amount: parseFloat(data.amount) || 0,
      sentAmount: parseFloat(data.sentAmount) || (parseFloat(data.amount) || 0),
      returnAmount: parseFloat(data.returnAmount) || 0,
      handoverTo: (data.handoverTo || '').trim(), // e.g. Owner name, Collector name
      depositedBy: (data.depositedBy || '').trim(), // e.g. Cashier / Staff name
      receiptPhoto: data.receiptPhoto || '', // compressed slip/receipt base64 (<35KB)
      receiptPhotoSize: data.receiptPhotoSize || '',
      date: data.date || this.getTodayDate(),
      time: data.time || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      note: (data.note || '').trim(),
      timestamp: data.timestamp || now.toISOString(),
      docType: 'bank_transaction'
    };
    list.unshift(item);
    this.saveBankTransactions(list);
    this._syncToFirebase('payment_tracker_updates', item.id, item);
    return item;
  },

  deleteBankTransaction(id) {
    let list = this.getBankTransactions(null);
    list = list.filter(t => t.id !== id);
    this.saveBankTransactions(list);
    this._deleteFromFirebase('payment_tracker_updates', id);
    return true;
  },

};

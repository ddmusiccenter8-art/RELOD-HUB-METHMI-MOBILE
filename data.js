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

  _initialized: false,

  // ---- Initialize: load from IDB if localStorage empty ----
  async initialize() {
    if (this._initialized) return;
    await IDB.open();

    // If localStorage is empty but IDB has data, restore from IDB
    const lsShops = localStorage.getItem(this.SHOPS_KEY);
    if (!lsShops || lsShops === '[]') {
      const idbShops = await IDB.load(this.SHOPS_KEY);
      if (idbShops && idbShops.length > 0) {
        localStorage.setItem(this.SHOPS_KEY, JSON.stringify(idbShops));
        console.log('✅ Data restored from IndexedDB backup!');
      }
    }

    const lsUpdates = localStorage.getItem(this.UPDATES_KEY);
    if (!lsUpdates || lsUpdates === '[]') {
      const idbUpdates = await IDB.load(this.UPDATES_KEY);
      if (idbUpdates && idbUpdates.length > 0) {
        localStorage.setItem(this.UPDATES_KEY, JSON.stringify(idbUpdates));
        console.log('✅ Updates restored from IndexedDB backup!');
      }
    }

    const lsActive = localStorage.getItem(this.ACTIVE_SHOP_KEY);
    if (!lsActive) {
      const idbActive = await IDB.load(this.ACTIVE_SHOP_KEY);
      if (idbActive) {
        localStorage.setItem(this.ACTIVE_SHOP_KEY, idbActive);
      }
    }

    this._initialized = true;

    // Migrate any legacy updates to 3-pillar system
    this._migrateLegacyUpdates();

    // Setup page close warning
    this._setupBeforeUnload();

    // Initialize Firebase Sync
    await this._setupFirebaseSync();
  },

  // ---- Firebase Sync System ----
  
  async _setupFirebaseSync() {
    if (!window.FS) return;

    try {
      // 1. One-time upload if cloud is empty but local has data
      const shopsSnapshot = await window.FS.collection('payment_tracker_shops').limit(1).get();
      if (shopsSnapshot.empty) {
        const localShops = this.getShops();
        const localUpdates = this.getUpdates();
        
        if (localShops.length > 0 || localUpdates.length > 0) {
          console.log('☁️ Uploading local data to empty Firebase...');
          const batch = window.FS.batch();
          
          localShops.forEach(shop => {
            const ref = window.FS.collection('payment_tracker_shops').doc(shop.id);
            batch.set(ref, shop);
          });
          
          localUpdates.forEach(update => {
            const ref = window.FS.collection('payment_tracker_updates').doc(update.id);
            batch.set(ref, update);
          });
          
          await batch.commit();
          console.log('✅ Initial cloud upload complete!');
        }
      }

      // 2. Setup listeners for real-time cloud sync
      this._setupFirebaseListeners();
      
    } catch (e) {
      console.error('Firebase sync setup failed:', e);
    }
  },

  _setupFirebaseListeners() {
    if (!window.FS) return;

    let isFirstShopsLoad = true;
    window.FS.collection('payment_tracker_shops').onSnapshot(snapshot => {
      if (snapshot.metadata.hasPendingWrites) return; // Ignore local writes (already handled)
      
      const shops = [];
      snapshot.forEach(doc => shops.push(doc.data()));
      
      // Sort by createdAt just in case
      shops.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      this._dualSave(this.SHOPS_KEY, shops);
      
      if (!isFirstShopsLoad) {
        if (window.App && window.App.refreshShopSelector) window.App.refreshShopSelector();
        if (window.App && window.App.refreshPage) window.App.refreshPage(window.App.currentPage);
      }
      isFirstShopsLoad = false;
    });

    let isFirstUpdatesLoad = true;
    window.FS.collection('payment_tracker_updates').onSnapshot(snapshot => {
      if (snapshot.metadata.hasPendingWrites) return; // Ignore local writes
      
      const updates = [];
      snapshot.forEach(doc => updates.push(doc.data()));
      
      this._dualSave(this.UPDATES_KEY, updates);
      
      if (!isFirstUpdatesLoad) {
        if (window.App && window.App.refreshPage) window.App.refreshPage(window.App.currentPage);
      }
      isFirstUpdatesLoad = false;
    });
  },

  _syncToFirebase(collection, docId, data) {
    if (window.FS) {
      window.FS.collection(collection).doc(docId).set(data).catch(e => console.error("Firebase set error", e));
    }
  },

  _deleteFromFirebase(collection, docId) {
    if (window.FS) {
      window.FS.collection(collection).doc(docId).delete().catch(e => console.error("Firebase delete error", e));
    }
  },

  // ---- Dual Save: localStorage + IndexedDB ----
  _dualSave(key, data) {
    const json = JSON.stringify(data);
    localStorage.setItem(key, json);
    // Async save to IDB (fire and forget)
    IDB.save(key, data).catch(() => {});
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
    return localStorage.getItem(this.ACTIVE_SHOP_KEY);
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

  // Extract canonical 3 values from any update (legacy or new format)
  extractValues(u) {
    if (!u) return { simTotal: 0, bankTotal: 0, cashInDrawer: 0, totalCapital: 0 };
    let sim = (u.simTotal !== undefined) ? (parseFloat(u.simTotal) || 0) : 0;
    let bank = (u.bankTotal !== undefined) ? (parseFloat(u.bankTotal) || 0) : 0;
    let cash = (u.cashInDrawer !== undefined) ? (parseFloat(u.cashInDrawer) || 0) : 0;

    // Handle legacy format fallback if not yet set
    if (u.simTotal === undefined && u.reload) {
      sim = (parseFloat(u.reload.dialog) || 0) +
            (parseFloat(u.reload.airtel) || 0) +
            (parseFloat(u.reload.mobitel) || 0) +
            (parseFloat(u.reload.hutch) || 0) +
            (parseFloat(u.reload.ezcash) || 0);
      cash += (parseFloat(u.reload.cashInDrawer) || 0);
    }
    if (u.bankTotal === undefined && u.mobileRental?.banks) {
      u.mobileRental.banks.forEach(b => {
        bank += (parseFloat(b.accountAmount) || 0);
        cash += (parseFloat(b.cashInDrawer) || 0);
      });
    }

    const totalCapital = (u.totalCapital !== undefined) ? (parseFloat(u.totalCapital) || 0) : (sim + bank + cash);
    return { simTotal: sim, bankTotal: bank, cashInDrawer: cash, totalCapital };
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
          if (u.simTotal === undefined || u.bankTotal === undefined || u.cashInDrawer === undefined || !u.comparison?.sim) {
            u.simTotal = vals.simTotal;
            u.bankTotal = vals.bankTotal;
            u.cashInDrawer = vals.cashInDrawer;
            u.totalCapital = vals.simTotal + vals.bankTotal + vals.cashInDrawer;

            const prev = i > 0 ? shopUpdates[i - 1] : null;
            u.comparison = this.calculateComparison(u, prev);
            modified = true;
          }
        }
      });

      if (modified) {
        this.saveUpdates(raw);
        console.log('✅ Migrated legacy updates to 3-pillar format');
      }
    } catch (e) {
      console.error('Migration error:', e);
    }
  },

  addUpdate(updateData) {
    const updates = this.getUpdates(true);
    const now = new Date();

    const simTotal = parseFloat(updateData.simTotal) || 0;
    const bankTotal = parseFloat(updateData.bankTotal) || 0;
    const cashInDrawer = parseFloat(updateData.cashInDrawer) || 0;
    const totalCapital = simTotal + bankTotal + cashInDrawer;

    const update = {
      id: 'upd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shopId: updateData.shopId,
      empName: updateData.empName || '',
      jobRole: updateData.jobRole || '',
      date: now.toISOString().split('T')[0],
      timestamp: now.toISOString(),
      simTotal,
      bankTotal,
      cashInDrawer,
      totalCapital,
      // For legacy viewers/backups:
      reload: { total: simTotal, cashInDrawer },
      mobileRental: { grandTotal: bankTotal },
      comparison: null
    };

    // Calculate comparison with previous update of this shop
    const prevUpdate = this.getLastUpdate(update.shopId);
    update.comparison = this.calculateComparison(update, prevUpdate);

    updates.push(update);
    this.saveUpdates(updates);
    this._syncToFirebase('payment_tracker_updates', update.id, update);

    // Auto-backup after update
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
    existingUpdate.simTotal = parseFloat(updateData.simTotal) || 0;
    existingUpdate.bankTotal = parseFloat(updateData.bankTotal) || 0;
    existingUpdate.cashInDrawer = parseFloat(updateData.cashInDrawer) || 0;
    existingUpdate.totalCapital = existingUpdate.simTotal + existingUpdate.bankTotal + existingUpdate.cashInDrawer;
    existingUpdate.reload = { total: existingUpdate.simTotal, cashInDrawer: existingUpdate.cashInDrawer };
    existingUpdate.mobileRental = { grandTotal: existingUpdate.bankTotal };

    // Recalculate comparison with the update immediately preceding it
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

  // ---- Calculation Engine ----

  calculateReloadTotal(u) {
    if (!u) return 0;
    if (typeof u === 'object') {
      if (u.simTotal !== undefined) return parseFloat(u.simTotal) || 0;
      if (u.dialog !== undefined) {
        return (parseFloat(u.dialog) || 0) + (parseFloat(u.airtel) || 0) +
               (parseFloat(u.mobitel) || 0) + (parseFloat(u.hutch) || 0) +
               (parseFloat(u.ezcash) || 0) + (parseFloat(u.cashInDrawer) || 0);
      }
      if (u.total !== undefined) return parseFloat(u.total) || 0;
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

    const getType = (diff) => diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'neutral';

    if (!previousUpdate) {
      return {
        isFirst: true,
        sim: { current: curr.simTotal, previous: 0, diff: 0, type: 'neutral' },
        bank: { current: curr.bankTotal, previous: 0, diff: 0, type: 'neutral' },
        cash: { current: curr.cashInDrawer, previous: 0, diff: 0, type: 'neutral' },
        overall: { current: curr.totalCapital, previous: 0, diff: 0, type: 'neutral' },
        // Backwards compatibility mappings:
        reload: { current: curr.simTotal, previous: 0, diff: 0, type: 'neutral' },
        mobileRental: { current: curr.bankTotal, previous: 0, diff: 0, type: 'neutral' },
        mobileRentalByBank: {}
      };
    }

    const prev = this.extractValues(previousUpdate);

    const simDiff = curr.simTotal - prev.simTotal;
    const bankDiff = curr.bankTotal - prev.bankTotal;
    const cashDiff = curr.cashInDrawer - prev.cashInDrawer;
    const overallDiff = curr.totalCapital - prev.totalCapital;

    return {
      isFirst: false,
      previousUpdateTime: previousUpdate.timestamp,
      sim: {
        current: curr.simTotal,
        previous: prev.simTotal,
        diff: simDiff,
        type: getType(simDiff)
      },
      bank: {
        current: curr.bankTotal,
        previous: prev.bankTotal,
        diff: bankDiff,
        type: getType(bankDiff)
      },
      cash: {
        current: curr.cashInDrawer,
        previous: prev.cashInDrawer,
        diff: cashDiff,
        type: getType(cashDiff)
      },
      overall: {
        current: curr.totalCapital,
        previous: prev.totalCapital,
        diff: overallDiff,
        type: getType(overallDiff)
      },
      // Backwards compatibility mappings:
      reload: {
        current: curr.simTotal,
        previous: prev.simTotal,
        diff: simDiff,
        type: getType(simDiff)
      },
      mobileRental: {
        current: curr.bankTotal,
        previous: prev.bankTotal,
        diff: bankDiff,
        type: getType(bankDiff)
      },
      mobileRentalByBank: {}
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
    let totalSimDiff = 0;
    let totalBankDiff = 0;
    let totalCashDiff = 0;
    let totalSim = 0;
    let totalBank = 0;
    let totalCash = 0;
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
        simTotal: 0,
        bankTotal: 0,
        cashInDrawer: 0,
        totalCapital: 0,
        diffs: {
          overall: 0,
          sim: 0,
          bank: 0,
          cash: 0
        }
      };

      if (lastUpdate) {
        hasData = true;
        const vals = this.extractValues(lastUpdate);
        shopData.simTotal = vals.simTotal;
        shopData.bankTotal = vals.bankTotal;
        shopData.cashInDrawer = vals.cashInDrawer;
        shopData.totalCapital = vals.totalCapital;

        totalSim += vals.simTotal;
        totalBank += vals.bankTotal;
        totalCash += vals.cashInDrawer;

        if (lastUpdate.comparison && !lastUpdate.comparison.isFirst) {
          const c = lastUpdate.comparison;
          const od = c.overall?.diff || 0;
          const sd = c.sim?.diff ?? c.reload?.diff ?? 0;
          const bd = c.bank?.diff ?? c.mobileRental?.diff ?? 0;
          const cd = c.cash?.diff ?? 0;

          shopData.diffs.overall = od;
          shopData.diffs.sim = sd;
          shopData.diffs.bank = bd;
          shopData.diffs.cash = cd;

          totalOverallDiff += od;
          totalSimDiff += sd;
          totalBankDiff += bd;
          totalCashDiff += cd;
        }
      }
      shopSummaries.push(shopData);
    });

    const totalCapital = totalSim + totalBank + totalCash;

    return {
      hasData,
      totalCapital,
      simTotal: totalSim,
      bankTotal: totalBank,
      cashTotal: totalCash,
      todayUpdatesCount: updatesCount,
      diffs: {
        overall: totalOverallDiff,
        sim: totalSimDiff,
        bank: totalBankDiff,
        cash: totalCashDiff,
        // legacy mappings:
        reload: totalSimDiff,
        mobile: totalBankDiff
      },
      // legacy mappings:
      reloadTotal: totalSim,
      mobileTotal: totalBank,
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
    if (typeof document === 'undefined') return;
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
    } else if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay()); // Sunday
      startDate = d.toISOString().split('T')[0];
    } else if (period === 'month') {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (period === 'year') {
      startDate = `${now.getFullYear()}-01-01`;
    }
    
    if (period !== 'all') {
      updates = updates.filter(u => u.date >= startDate);
    }
    
    let totalProfit = 0;
    let totalLoss = 0;
    let simNet = 0;
    let bankNet = 0;
    let cashNet = 0;
    
    updates.forEach(u => {
      if (u.comparison && !u.comparison.isFirst) {
         const diff = u.comparison.overall.diff;
         if (diff > 0) totalProfit += diff;
         else totalLoss += Math.abs(diff);

         simNet += (u.comparison.sim?.diff ?? u.comparison.reload?.diff ?? 0);
         bankNet += (u.comparison.bank?.diff ?? u.comparison.mobileRental?.diff ?? 0);
         cashNet += (u.comparison.cash?.diff ?? 0);
      }
    });
    
    const net = totalProfit - totalLoss;
    return {
      net,
      type: net > 0 ? 'profit' : net < 0 ? 'loss' : 'neutral',
      totalProfit,
      totalLoss,
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
    return new Date().toISOString().split('T')[0];
  },

  // Export all data
  exportData() {
    return JSON.stringify({
      shops: this.getShops(),
      updates: this.getUpdates(),
      activeShopId: this.getActiveShopId(),
      exportedAt: new Date().toISOString(),
      version: '1.0'
    }, null, 2);
  },

  // Import data
  importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.shops) this.saveShops(data.shops);
      if (data.updates) this.saveUpdates(data.updates);
      if (data.activeShopId) this.setActiveShop(data.activeShopId);
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  }
};

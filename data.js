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

    const lsCredits = localStorage.getItem(this.CREDITS_KEY);
    if (!lsCredits || lsCredits === '[]') {
      const idbCredits = await IDB.load(this.CREDITS_KEY);
      if (idbCredits && idbCredits.length > 0) {
        localStorage.setItem(this.CREDITS_KEY, JSON.stringify(idbCredits));
      }
    }

    const lsRouters = localStorage.getItem(this.ROUTER_EXPENSES_KEY);
    if (!lsRouters || lsRouters === '[]') {
      const idbRouters = await IDB.load(this.ROUTER_EXPENSES_KEY);
      if (idbRouters && idbRouters.length > 0) {
        localStorage.setItem(this.ROUTER_EXPENSES_KEY, JSON.stringify(idbRouters));
      }
    }

    const lsTopups = localStorage.getItem(this.DISTRIBUTOR_TOPUPS_KEY);
    if (!lsTopups || lsTopups === '[]') {
      const idbTopups = await IDB.load(this.DISTRIBUTOR_TOPUPS_KEY);
      if (idbTopups && idbTopups.length > 0) {
        localStorage.setItem(this.DISTRIBUTOR_TOPUPS_KEY, JSON.stringify(idbTopups));
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

  // Extract values from any update (legacy or 2-track format)
  extractValues(u) {
    if (!u) {
      return {
        dialog: 0, mobitel: 0, airtel: 0, hutch: 0, ezcash: 0,
        simTotal: 0, reloadCash: 0, reloadTotal: 0,
        banks: [], totalBankAcct: 0, totalBankCash: 0, bankTotal: 0,
        totalCash: 0, cashInDrawer: 0, totalCapital: 0
      };
    }

    // Reload extraction
    let dialog = 0, mobitel = 0, airtel = 0, hutch = 0, ezcash = 0;
    let reloadCash = 0, simTotal = 0, reloadTotal = 0;

    if (u.reload && typeof u.reload === 'object') {
      dialog = parseFloat(u.reload.dialog) || 0;
      mobitel = parseFloat(u.reload.mobitel) || 0;
      airtel = parseFloat(u.reload.airtel) || 0;
      hutch = parseFloat(u.reload.hutch) || 0;
      ezcash = parseFloat(u.reload.ezcash) || 0;
      reloadCash = parseFloat(u.reload.cashInDrawer) || 0;
      simTotal = dialog + mobitel + airtel + hutch + ezcash;
      if (simTotal === 0 && u.reload.simTotal !== undefined) {
        simTotal = parseFloat(u.reload.simTotal) || 0;
      }
      reloadTotal = (u.reload.total !== undefined) ? (parseFloat(u.reload.total) || 0) : (simTotal + reloadCash);
    } else if (u.simTotal !== undefined) {
      simTotal = parseFloat(u.simTotal) || 0;
      reloadCash = parseFloat(u.cashInDrawer) || 0;
      reloadTotal = simTotal + reloadCash;
    }

    // Bank / Mobile Rental extraction
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
          bankTotal += b.total;
        });
      }
      if (bankTotal === 0 && u.mobileRental.grandTotal !== undefined) {
        bankTotal = parseFloat(u.mobileRental.grandTotal) || 0;
      }
    } else if (u.bankTotal !== undefined) {
      bankTotal = parseFloat(u.bankTotal) || 0;
    }

    const totalCash = reloadCash + totalBankCash;
    const totalCapital = (u.totalCapital !== undefined && u.reload && u.reload.total !== undefined) ? (parseFloat(u.totalCapital) || 0) : (reloadTotal + bankTotal);

    return {
      dialog, mobitel, airtel, hutch, ezcash,
      simTotal, reloadCash, reloadTotal,
      banks, totalBankAcct, totalBankCash, bankTotal,
      totalCash, cashInDrawer: totalCash, totalCapital
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
    const reloadSimTotal = reloadDialog + reloadMobitel + reloadAirtel + reloadHutch + reloadEzcash;
    let reloadTotal = reloadSimTotal + reloadCash;
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
    const reloadSimTotal = reloadDialog + reloadMobitel + reloadAirtel + reloadHutch + reloadEzcash;
    let reloadTotal = reloadSimTotal + reloadCash;
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
      total: reloadTotal
    };
    existingUpdate.mobileRental = {
      banks,
      totalAccountAmount: totalBankAcct,
      totalCashInDrawer: totalBankCash,
      grandTotal: bankGrandTotal
    };
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

  // ---- Customer Credits (ණයට දුන් රීලෝඩ්) ----
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
    credits.unshift(item);
    this.saveCredits(credits);
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
    this.saveCredits(credits);

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

    // If it was settled and added to balance, safely reverse the balance adjustment
    if (item.status === 'paid' && item.settledDestination && item.settledDestination.type !== 'none' && item.shopId) {
      const lastUpdate = this.getLastUpdate(item.shopId);
      if (lastUpdate) {
        const amt = parseFloat(item.amount) || 0;
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
          const simKey = (dest.simName || 'dialog').toLowerCase();
          lastUpdate.reload[simKey] = Math.max(0, (parseFloat(lastUpdate.reload[simKey]) || 0) - amt);
          lastUpdate.reload.simTotal = Math.max(0, (parseFloat(lastUpdate.reload.simTotal) || 0) - amt);
          lastUpdate.reload.total = Math.max(0, (parseFloat(lastUpdate.reload.total) || 0) - amt);
          lastUpdate.simTotal = Math.max(0, (parseFloat(lastUpdate.simTotal) || 0) - amt);
          lastUpdate.reloadTotal = Math.max(0, (parseFloat(lastUpdate.reloadTotal) || 0) - amt);
          lastUpdate.totalCapital = Math.max(0, (parseFloat(lastUpdate.totalCapital) || 0) - amt);
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

  // ---- Router Reload Expenses (සාප්පුවේ රවුටර් රීලෝඩ්) ----
  getRouterExpenses(shopId = null) {
    let list = JSON.parse(localStorage.getItem(this.ROUTER_EXPENSES_KEY) || '[]');
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
    list.unshift(item);
    this.saveRouterExpenses(list);

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
    return true;
  },

  // ---- Distributor Top-ups Received (ලැබුණු රීලෝඩ් / ස්ටොක්) ----
  getDistributorTopups(shopId = null) {
    let list = JSON.parse(localStorage.getItem(this.DISTRIBUTOR_TOPUPS_KEY) || '[]');
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
    list.unshift(item);
    this.saveDistributorTopups(list);

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
    const getType = (diff) => diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'neutral';

    const creditsGiven = currentUpdate?.adjustments?.creditsTotal || 0;
    const routerExpenses = currentUpdate?.adjustments?.routersTotal || 0;
    const topupsReceived = currentUpdate?.adjustments?.topupsTotal || 0;

    if (!previousUpdate) {
      return {
        isFirst: true,
        reload: {
          current: curr.reloadTotal,
          previous: 0,
          diff: 0,
          type: 'neutral'
        },
        mobileRental: {
          current: curr.bankTotal,
          previous: 0,
          diff: 0,
          type: 'neutral'
        },
        bank: {
          current: curr.bankTotal,
          previous: 0,
          diff: 0,
          type: 'neutral'
        },
        sim: {
          current: curr.simTotal,
          previous: 0,
          diff: 0,
          type: 'neutral'
        },
        cash: {
          current: curr.totalCash,
          previous: 0,
          diff: 0,
          type: 'neutral'
        },
        adjustments: {
          credits: creditsGiven,
          routers: routerExpenses,
          topups: topupsReceived
        },
        physical: {
          current: curr.totalCapital,
          previous: 0,
          diff: 0,
          type: 'neutral'
        },
        overall: {
          current: curr.totalCapital + creditsGiven + routerExpenses,
          previous: 0,
          diff: 0,
          type: 'neutral'
        }
      };
    }

    const prev = this.extractValues(previousUpdate);

    const reloadDiff = curr.reloadTotal - prev.reloadTotal;
    const bankDiff = curr.bankTotal - prev.bankTotal;
    const physicalDiff = curr.totalCapital - prev.totalCapital;
    const cashDiff = curr.totalCash - prev.totalCash;
    const simDiff = curr.simTotal - prev.simTotal;

    // Adjusted Net Operating Profit/Loss:
    // Credits given = asset receivable
    // Router reloads = shop operating expense
    // Topups received = capital injected from distributor
    const adjustedDiff = (curr.totalCapital + creditsGiven + routerExpenses) - (prev.totalCapital + topupsReceived);

    return {
      isFirst: false,
      previousUpdateTime: previousUpdate.timestamp,
      reload: {
        current: curr.reloadTotal,
        previous: prev.reloadTotal,
        diff: reloadDiff,
        type: getType(reloadDiff)
      },
      mobileRental: {
        current: curr.bankTotal,
        previous: prev.bankTotal,
        diff: bankDiff,
        type: getType(bankDiff)
      },
      bank: {
        current: curr.bankTotal,
        previous: prev.bankTotal,
        diff: bankDiff,
        type: getType(bankDiff)
      },
      sim: {
        current: curr.simTotal,
        previous: prev.simTotal,
        diff: simDiff,
        type: getType(simDiff)
      },
      cash: {
        current: curr.totalCash,
        previous: prev.totalCash,
        diff: cashDiff,
        type: getType(cashDiff)
      },
      adjustments: {
        credits: creditsGiven,
        routers: routerExpenses,
        topups: topupsReceived
      },
      physical: {
        current: curr.totalCapital,
        previous: prev.totalCapital,
        diff: physicalDiff,
        type: getType(physicalDiff)
      },
      overall: {
        current: curr.totalCapital + creditsGiven + routerExpenses,
        previous: prev.totalCapital + topupsReceived,
        diff: adjustedDiff,
        type: getType(adjustedDiff)
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
      credits: this.getCredits(null, true),
      routerExpenses: this.getRouterExpenses(null),
      distributorTopups: this.getDistributorTopups(null),
      activeShopId: this.getActiveShopId(),
      exportedAt: new Date().toISOString(),
      version: '2.0'
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
      if (data.activeShopId) this.setActiveShop(data.activeShopId);
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  }
};

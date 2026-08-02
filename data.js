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
  getShops() {
    return JSON.parse(localStorage.getItem(this.SHOPS_KEY) || '[]');
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
    let shops = this.getShops();
    shops = shops.filter(s => s.id !== id);
    this.saveShops(shops);
    this._deleteFromFirebase('payment_tracker_shops', id);

    // Remove updates for this shop
    let updates = this.getUpdates();
    const updatesToDelete = updates.filter(u => u.shopId === id);
    updates = updates.filter(u => u.shopId !== id);
    this.saveUpdates(updates);
    
    updatesToDelete.forEach(u => {
      this._deleteFromFirebase('payment_tracker_updates', u.id);
    });

    // Reset active if deleted
    if (this.getActiveShopId() === id) {
      this.setActiveShop(shops.length > 0 ? shops[0].id : null);
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
  getUpdates() {
    return JSON.parse(localStorage.getItem(this.UPDATES_KEY) || '[]');
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

  addUpdate(updateData) {
    const updates = this.getUpdates();
    const now = new Date();
    const update = {
      id: 'upd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      shopId: updateData.shopId,
      empName: updateData.empName || '',
      jobRole: updateData.jobRole || '',
      date: now.toISOString().split('T')[0],
      timestamp: now.toISOString(),
      reload: updateData.reload,
      mobileRental: updateData.mobileRental,
      comparison: null // will be calculated
    };

    // Calculate comparison with previous update
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
    const updates = this.getUpdates();
    const index = updates.findIndex(u => u.id === updateId);
    if (index === -1) return null;

    const existingUpdate = updates[index];
    
    // Update data while preserving original ID, timestamp, date
    existingUpdate.empName = updateData.empName || existingUpdate.empName;
    existingUpdate.jobRole = updateData.jobRole || existingUpdate.jobRole;
    existingUpdate.reload = updateData.reload;
    existingUpdate.mobileRental = updateData.mobileRental;

    // Recalculate comparison with the update immediately preceding it
    const prevUpdate = this.getLastUpdateBefore(existingUpdate.shopId, existingUpdate.timestamp);
    existingUpdate.comparison = this.calculateComparison(existingUpdate, prevUpdate);

    // Save
    this.saveUpdates(updates);
    this._syncToFirebase('payment_tracker_updates', existingUpdate.id, existingUpdate);
    this.autoBackup();

    return existingUpdate;
  },

  deleteUpdate(updateId) {
    let updates = this.getUpdates();
    updates = updates.filter(u => u.id !== updateId);
    this.saveUpdates(updates);
    this._deleteFromFirebase('payment_tracker_updates', updateId);
  },

  // ---- Calculation Engine ----

  calculateReloadTotal(reload) {
    return (parseFloat(reload.dialog) || 0) +
           (parseFloat(reload.airtel) || 0) +
           (parseFloat(reload.mobitel) || 0) +
           (parseFloat(reload.hutch) || 0) +
           (parseFloat(reload.ezcash) || 0) +
           (parseFloat(reload.cashInDrawer) || 0);
  },

  calculateBankTotal(bankEntry) {
    return (parseFloat(bankEntry.accountAmount) || 0) +
           (parseFloat(bankEntry.cashInDrawer) || 0);
  },

  calculateMobileRentalGrandTotal(mobileRental) {
    if (!mobileRental || !mobileRental.banks) return 0;
    return mobileRental.banks.reduce((sum, b) => sum + this.calculateBankTotal(b), 0);
  },

  calculateComparison(currentUpdate, previousUpdate) {
    const currentReloadTotal = this.calculateReloadTotal(currentUpdate.reload);
    const currentMobileTotal = this.calculateMobileRentalGrandTotal(currentUpdate.mobileRental);

    if (!previousUpdate) {
      // First update ever - no comparison
      return {
        isFirst: true,
        reload: { current: currentReloadTotal, previous: 0, diff: 0, type: 'neutral' },
        mobileRental: { current: currentMobileTotal, previous: 0, diff: 0, type: 'neutral' },
        mobileRentalByBank: {},
        overall: { current: currentReloadTotal + currentMobileTotal, previous: 0, diff: 0, type: 'neutral' }
      };
    }

    const prevReloadTotal = this.calculateReloadTotal(previousUpdate.reload);
    const prevMobileTotal = this.calculateMobileRentalGrandTotal(previousUpdate.mobileRental);

    const reloadDiff = currentReloadTotal - prevReloadTotal;
    const mobileDiff = currentMobileTotal - prevMobileTotal;
    const overallDiff = reloadDiff + mobileDiff;

    // Bank-wise comparison
    const bankComparison = {};
    const allBanks = ['BOC', 'HNB', 'Sampath', "People's", 'Commercial'];

    allBanks.forEach(bankName => {
      const currentBank = currentUpdate.mobileRental?.banks?.find(b => b.bank === bankName);
      const prevBank = previousUpdate.mobileRental?.banks?.find(b => b.bank === bankName);

      const currentBankTotal = currentBank ? this.calculateBankTotal(currentBank) : 0;
      const prevBankTotal = prevBank ? this.calculateBankTotal(prevBank) : 0;
      const diff = currentBankTotal - prevBankTotal;

      if (currentBankTotal > 0 || prevBankTotal > 0) {
        bankComparison[bankName] = {
          current: currentBankTotal,
          previous: prevBankTotal,
          diff: diff,
          type: diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'neutral'
        };
      }
    });

    return {
      isFirst: false,
      previousUpdateTime: previousUpdate.timestamp,
      reload: {
        current: currentReloadTotal,
        previous: prevReloadTotal,
        diff: reloadDiff,
        type: reloadDiff > 0 ? 'profit' : reloadDiff < 0 ? 'loss' : 'neutral'
      },
      mobileRental: {
        current: currentMobileTotal,
        previous: prevMobileTotal,
        diff: mobileDiff,
        type: mobileDiff > 0 ? 'profit' : mobileDiff < 0 ? 'loss' : 'neutral'
      },
      mobileRentalByBank: bankComparison,
      overall: {
        current: currentReloadTotal + currentMobileTotal,
        previous: prevReloadTotal + prevMobileTotal,
        diff: overallDiff,
        type: overallDiff > 0 ? 'profit' : overallDiff < 0 ? 'loss' : 'neutral'
      }
    };
  },

  getShopLatestComparison(shopId) {
    const lastUpdate = this.getLastUpdate(shopId);
    if (!lastUpdate || !lastUpdate.comparison || lastUpdate.comparison.isFirst) return null;
    return lastUpdate.comparison;
  },

  getGlobalStats() {
    const shops = this.getShops();
    let totalOverallDiff = 0;
    let totalReloadDiff = 0;
    let totalMobileDiff = 0;
    let reloadTotal = 0;
    let mobileTotal = 0;
    let hasData = false;
    let updatesCount = 0;

    shops.forEach(shop => {
      const lastUpdate = this.getLastUpdate(shop.id);
      if (lastUpdate) {
        hasData = true;
        reloadTotal += this.calculateReloadTotal(lastUpdate.reload);
        mobileTotal += this.calculateMobileRentalGrandTotal(lastUpdate.mobileRental);
        
        if (lastUpdate.comparison && !lastUpdate.comparison.isFirst) {
           totalOverallDiff += lastUpdate.comparison.overall.diff || 0;
           totalReloadDiff += lastUpdate.comparison.reload.diff || 0;
           totalMobileDiff += lastUpdate.comparison.mobileRental.diff || 0;
        }
      }
      const today = this.getTodayDate();
      updatesCount += this.getUpdatesForShopByDate(shop.id, today).length;
    });

    return {
      hasData,
      reloadTotal,
      mobileTotal,
      todayUpdatesCount: updatesCount,
      diffs: {
        overall: totalOverallDiff,
        reload: totalReloadDiff,
        mobile: totalMobileDiff
      }
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

    return {
      date,
      updateCount: updates.length,
      firstUpdate: lastUpdate,
      lastUpdate: latestUpdate,
      reloadTotal: this.calculateReloadTotal(latestUpdate.reload),
      mobileRentalTotal: this.calculateMobileRentalGrandTotal(latestUpdate.mobileRental),
      overallComparison: latestUpdate.comparison
    };
  },

  getStatsForPeriod(shopId, period) {
    let updates = shopId ? this.getUpdatesForShop(shopId) : this.getUpdates();
    
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
    
    updates.forEach(u => {
      if (u.comparison && !u.comparison.isFirst) {
         if (u.comparison.overall.diff > 0) totalProfit += u.comparison.overall.diff;
         else totalLoss += Math.abs(u.comparison.overall.diff);
      }
    });
    
    const net = totalProfit - totalLoss;
    return {
      net,
      type: net > 0 ? 'profit' : net < 0 ? 'loss' : 'neutral'
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

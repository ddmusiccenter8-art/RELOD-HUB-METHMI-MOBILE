// ============================================
// Shop Payment Tracker - Main Application
// Controller, Routing, UI Logic
// ============================================

const App = {
  currentPage: 'dashboard',
  bankCounter: 0,
  editingUpdateId: null,

  // ---- Initialize ----
  async init() {
    // Initialize dual storage (localStorage + IndexedDB)
    await DB.initialize();

    // Initialize Localization
    I18N.translatePage();
    document.getElementById('langSelector').value = I18N.currentLang;
    document.getElementById('langSelector').addEventListener('change', (e) => {
      I18N.setLanguage(e.target.value);
    });

    this.setupNavigation();
    this.setupShopSelector();
    this.setupUpdateForm();
    this.setupShopsPage();
    this.setupHistoryPage();
    this.setupReportsPage();
    this.setupExportImport();
    this.setupMobileMenu();

    // Quick Add Shop
    document.getElementById('quickAddShopBtn').addEventListener('click', () => {
      this.showAddShopModal();
    });

    // Dash Period Selector
    document.getElementById('dashPeriodSelector').addEventListener('change', () => {
      this.updatePeriodSummary(DB.getActiveShopId());
    });

    // Show dashboard
    this.navigateTo('dashboard');
    this.updateTodayDate();
    this.updateBackupStatus();

    // Auto-prompt shop creation if none
    const shops = DB.getShops();
    if (shops.length === 0) {
      setTimeout(() => this.showAddShopModal(), 300);
    }

    // Check if backup is overdue (> 2 days)
    this.checkBackupReminder();
  },

  // ---- Backup Status ----
  updateBackupStatus() {
    const statusEl = document.getElementById('backupStatus');
    if (!statusEl) return;
    const lastBackup = DB.getLastBackupTime();
    
    let html = '';
    if (window.FS) {
      html += `<div style="margin-bottom:4px;"><span style="color:var(--accent-blue);">☁️</span> Cloud Sync: <strong>Active</strong></div>`;
    }
    
    if (lastBackup) {
      const d = new Date(lastBackup);
      html += `<div><span style="color:var(--accent-green);">✅</span> Local Backup: ${d.toLocaleDateString('si-LK')}</div>`;
    } else {
      html += `<div><span style="color:var(--accent-red);">⚠️</span> Local Backup: නැහැ</div>`;
    }
    
    statusEl.innerHTML = html;
  },

  checkBackupReminder() {
    const lastBackup = DB.getLastBackupTime();
    const shops = DB.getShops();
    if (shops.length === 0) return;

    if (!lastBackup) {
      setTimeout(() => {
        this.showToast('⚠️ Data backup නැහැ! Export බොත්තම ඔබන්න', 'error');
      }, 2000);
      return;
    }

    const daysSince = (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 2) {
      setTimeout(() => {
        this.showToast(`⚠️ අවසන් backup ${Math.floor(daysSince)} දින වලට කලින්! Backup කරන්න`, 'error');
      }, 2000);
    }
  },

  // ---- Toast Notifications ----
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // ---- Modal ----
  showModal(title, bodyHTML, actions) {
    document.getElementById('modalTitle').innerHTML = title;
    document.getElementById('modalBody').innerHTML = bodyHTML;
    const actionsEl = document.getElementById('modalActions');
    actionsEl.innerHTML = '';
    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.className = `btn ${action.class || 'btn-ghost'}`;
      btn.textContent = action.text;
      btn.onclick = () => {
        action.onClick();
      };
      actionsEl.appendChild(btn);
    });
    document.getElementById('modalOverlay').classList.add('active');
  },

  closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
  },

  // ---- Navigation ----
  setupNavigation() {
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.getAttribute('data-page');
        if (page === 'update') {
          this.editingUpdateId = null;
          const btn = document.querySelector('#updateForm button[type="submit"]');
          if (btn) btn.innerHTML = '💾 Save Update (සටහන් කරන්න)';
        }
        this.navigateTo(page);
        // Close mobile menu
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('open');
      });
    });

    // Close modal on overlay click
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modalOverlay')) {
        this.closeModal();
      }
    });
  },

  navigateTo(page) {
    this.currentPage = page;
    // Update nav
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-links a[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');
    // Show page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');
    // Refresh page data
    this.refreshPage(page);
  },

  refreshPage(page) {
    switch (page) {
      case 'dashboard': this.renderDashboard(); break;
      case 'update': this.renderUpdateForm(); break;
      case 'history': this.renderHistory(); break;
      case 'shops': this.renderShops(); break;
      case 'reports': break;
    }
  },

  // ---- Mobile Menu ----
  setupMobileMenu() {
    document.getElementById('hamburgerBtn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('open');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('open');
    });
  },

  updateTodayDate() {
    const today = new Date();
    document.getElementById('todayDate').textContent = '📅 ' + today.toLocaleDateString('si-LK', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  },

  // ---- Shop Selector ----
  setupShopSelector() {
    const sel = document.getElementById('shopSelector');
    sel.addEventListener('change', () => {
      DB.setActiveShop(sel.value);
      this.refreshPage(this.currentPage);
    });
    this.refreshShopSelector();
  },

  refreshShopSelector() {
    const sel = document.getElementById('shopSelector');
    const shops = DB.getShops();
    const activeId = DB.getActiveShopId();
    sel.innerHTML = '<option value="">-- සාප්පුව තෝරන්න --</option>';
    shops.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = '🏪 ' + s.name;
      if (s.id === activeId) opt.selected = true;
      sel.appendChild(opt);
    });
  },

  // ================================================================
  // DASHBOARD
  // ================================================================
  renderDashboard() {
    const shopId = DB.getActiveShopId();
    if (!shopId) {
      this.renderNoDashboard();
      return;
    }
    this.updatePeriodSummary(shopId);

    const lastUpdate = DB.getLastUpdate(shopId);
    const today = DB.getTodayDate();
    const todayUpdates = DB.getUpdatesForShopByDate(shopId, today);

    if (!lastUpdate) {
      this.renderNoDashboard();
      return;
    }

    // Overall card
    const comp = lastUpdate.comparison;
    const overallCard = document.getElementById('overallCard');
    const overallValue = document.getElementById('overallValue');
    const overallType = document.getElementById('overallType');

    if (comp && !comp.isFirst) {
      const diff = comp.overall.diff;
      const type = comp.overall.type;
      overallValue.textContent = DB.formatCurrency(Math.abs(diff));
      overallValue.className = `overall-value ${type}`;
      overallType.textContent = type === 'profit' ? '✅ PROFIT (ලාභ)' : type === 'loss' ? '❌ LOSS (අලාභ)' : '➖ NO CHANGE';
      overallType.style.color = type === 'profit' ? 'var(--accent-green)' : type === 'loss' ? 'var(--accent-red)' : 'var(--text-muted)';
      overallCard.className = `card overall-card ${type === 'profit' ? 'profit-card' : type === 'loss' ? 'loss-card' : 'neutral-card'}`;
    } else {
      overallValue.textContent = DB.formatCurrency(0);
      overallValue.className = 'overall-value neutral';
      overallType.textContent = 'පළමු UPDATE';
      overallType.style.color = 'var(--text-muted)';
      overallCard.className = 'card overall-card neutral-card';
    }

    const rTotal = DB.calculateReloadTotal(lastUpdate.reload);
    const mTotal = DB.calculateMobileRentalGrandTotal(lastUpdate.mobileRental);
    document.getElementById('overallTotalCapital').textContent = DB.formatCurrency(rTotal + mTotal);

    // Reload card
    const reloadTotal = rTotal;
    document.getElementById('dashReloadTotal').textContent = DB.formatCurrency(reloadTotal);
    if (comp && !comp.isFirst) {
      const rd = comp.reload;
      document.getElementById('dashReloadDiff').textContent = `${rd.type === 'profit' ? '▲' : rd.type === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(rd.diff))}`;
      document.getElementById('dashReloadDiff').className = `card-diff ${rd.type}`;
    } else {
      document.getElementById('dashReloadDiff').textContent = '➖ First Update';
      document.getElementById('dashReloadDiff').className = 'card-diff neutral';
    }

    // Mobile card
    const mobileTotal = DB.calculateMobileRentalGrandTotal(lastUpdate.mobileRental);
    document.getElementById('dashMobileTotal').textContent = DB.formatCurrency(mobileTotal);
    if (comp && !comp.isFirst) {
      const md = comp.mobileRental;
      document.getElementById('dashMobileDiff').textContent = `${md.type === 'profit' ? '▲' : md.type === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(md.diff))}`;
      document.getElementById('dashMobileDiff').className = `card-diff ${md.type}`;
    } else {
      document.getElementById('dashMobileDiff').textContent = '➖ First Update';
      document.getElementById('dashMobileDiff').className = 'card-diff neutral';
    }

    // Update count
    document.getElementById('dashUpdateCount').textContent = todayUpdates.length;
    document.getElementById('dashLastUpdateTime').textContent = 'Last: ' + DB.formatTime(lastUpdate.timestamp);

    // Reload Breakdown
    this.renderReloadBreakdown(lastUpdate);

    // Bank breakdown
    this.renderBankBreakdown(lastUpdate);

    // Recent updates
    this.renderRecentUpdates(shopId);
  },

  updatePeriodSummary(shopId) {
    const period = document.getElementById('dashPeriodSelector').value;
    const stats = DB.getStatsForPeriod(shopId, period);
    
    const valueEl = document.getElementById('dashPeriodValue');
    const typeEl = document.getElementById('dashPeriodType');
    const cardEl = document.getElementById('periodSummaryCard');

    if (!stats || (stats.net === 0 && stats.type === 'neutral')) {
      valueEl.textContent = 'Rs.0.00';
      valueEl.className = 'overall-value neutral';
      typeEl.textContent = I18N.get('dash_no_data');
      typeEl.style.color = 'var(--text-muted)';
      cardEl.className = 'card neutral-card';
    } else {
      valueEl.textContent = DB.formatCurrency(Math.abs(stats.net));
      valueEl.className = `overall-value ${stats.type}`;
      typeEl.textContent = stats.type === 'profit' ? '✅ PROFIT (ලාභ)' : stats.type === 'loss' ? '❌ LOSS (අලාභ)' : '➖ NO CHANGE';
      typeEl.style.color = stats.type === 'profit' ? 'var(--accent-green)' : stats.type === 'loss' ? 'var(--accent-red)' : 'var(--text-muted)';
      cardEl.className = `card ${stats.type === 'profit' ? 'profit-card' : stats.type === 'loss' ? 'loss-card' : 'neutral-card'}`;
    }
  },

  renderNoDashboard() {
    this.updatePeriodSummary(null);

    const stats = DB.getGlobalStats();
    if (stats.hasData) {
      const overallDiff = stats.diffs.overall;
      const overallType = overallDiff > 0 ? 'profit' : overallDiff < 0 ? 'loss' : 'neutral';
      document.getElementById('overallValue').textContent = DB.formatCurrency(Math.abs(overallDiff));
      document.getElementById('overallValue').className = `overall-value ${overallType}`;
      document.getElementById('overallType').textContent = 'ALL SHOPS (මුළු එකතුව)';
      document.getElementById('overallType').style.color = 'var(--accent-blue)';
      document.getElementById('overallCard').className = `card overall-card ${overallType === 'profit' ? 'profit-card' : overallType === 'loss' ? 'loss-card' : 'neutral-card'}`;
      document.getElementById('overallTotalCapital').textContent = DB.formatCurrency(stats.reloadTotal + stats.mobileTotal);

      document.getElementById('dashReloadTotal').textContent = DB.formatCurrency(stats.reloadTotal);
      const rd = stats.diffs.reload;
      const rdType = rd > 0 ? 'profit' : rd < 0 ? 'loss' : 'neutral';
      document.getElementById('dashReloadDiff').textContent = `${rdType === 'profit' ? '▲' : rdType === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(rd))}`;
      document.getElementById('dashReloadDiff').className = `card-diff ${rdType}`;

      document.getElementById('dashMobileTotal').textContent = DB.formatCurrency(stats.mobileTotal);
      const md = stats.diffs.mobile;
      const mdType = md > 0 ? 'profit' : md < 0 ? 'loss' : 'neutral';
      document.getElementById('dashMobileDiff').textContent = `${mdType === 'profit' ? '▲' : mdType === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(md))}`;
      document.getElementById('dashMobileDiff').className = `card-diff ${mdType}`;

      document.getElementById('dashUpdateCount').textContent = stats.todayUpdatesCount;
      document.getElementById('dashLastUpdateTime').textContent = 'All Shops Summary';
      document.getElementById('dashBankBreakdown').innerHTML = '<div class="empty-state" style="padding:20px;grid-column:1/-1;"><div class="empty-sub">Select a shop to view banks</div></div>';
      document.getElementById('dashRecentUpdates').innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-icon">🏪</div><div class="empty-text">Select a Shop</div><div class="empty-sub">Please select a shop from the menu to see recent updates</div></div>';
    } else {
      document.getElementById('overallValue').textContent = 'Rs.0.00';
      document.getElementById('overallValue').className = 'overall-value neutral';
      document.getElementById('overallType').textContent = 'NO DATA';
      document.getElementById('overallType').style.color = 'var(--text-muted)';
      document.getElementById('overallCard').className = 'card overall-card neutral-card';
      document.getElementById('overallTotalCapital').textContent = 'Rs.0.00';
      document.getElementById('dashReloadTotal').textContent = 'Rs.0.00';
      document.getElementById('dashReloadDiff').textContent = '➖ Rs.0.00';
      document.getElementById('dashReloadDiff').className = 'card-diff neutral';
      document.getElementById('dashMobileTotal').textContent = 'Rs.0.00';
      document.getElementById('dashMobileDiff').textContent = '➖ Rs.0.00';
      document.getElementById('dashMobileDiff').className = 'card-diff neutral';
      document.getElementById('dashUpdateCount').textContent = '0';
      document.getElementById('dashLastUpdateTime').textContent = 'Last: --';
      document.getElementById('dashBankBreakdown').innerHTML = '<div class="empty-state" style="padding:20px;grid-column:1/-1;"><div class="empty-sub">No bank data yet</div></div>';
      document.getElementById('dashRecentUpdates').innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-icon">📭</div><div class="empty-text">Updates නැහැ</div><div class="empty-sub">පළමු update එක ගන්න ➕ බොත්තම ඔබන්න</div></div>';
    }
  },

  renderReloadBreakdown(lastUpdate) {
    const container = document.getElementById('dashReloadBreakdown');
    if (!lastUpdate || !lastUpdate.reload) {
      container.innerHTML = '<div class="empty-state" style="padding:20px;grid-column:1/-1;"><div class="empty-sub">No reload data</div></div>';
      return;
    }

    const r = lastUpdate.reload;
    const items = [
      { key: 'dialog', label: 'Dialog', val: r.dialog || 0, class: 'dialog' },
      { key: 'airtel', label: 'Airtel', val: r.airtel || 0, class: 'airtel' },
      { key: 'mobitel', label: 'Mobitel', val: r.mobitel || 0, class: 'mobitel' },
      { key: 'hutch', label: 'Hutch', val: r.hutch || 0, class: 'hutch' },
      { key: 'ezcash', label: 'eZ Cash', val: r.ezcash || 0, class: 'ezcash' },
      { key: 'cashInDrawer', label: 'Cash (ලාච්චුවේ)', val: r.cashInDrawer || 0, class: 'cash' }
    ];

    const comp = lastUpdate.comparison;
    let html = '';
    
    items.forEach(item => {
      let diffHtml = '';
      if (comp && !comp.isFirst) {
        // We don't have individual reload diffs calculated in comparison,
        // Wait, DB.calculateComparison only calculates total reload diff.
        // I need to calculate individual diff if there's a previous update!
      }
      
      html += `
        <div style="text-align:center;padding:12px;background:var(--bg-glass);border-radius:var(--radius-sm);border:1px solid var(--border-glass);">
          <div class="bank-tag ${item.class}" style="margin-bottom:8px;">${item.label}</div>
          <div style="font-size:1.1rem;font-weight:800;">${DB.formatCurrency(item.val)}</div>
          <div id="diff_${item.key}"></div>
        </div>`;
    });
    
    container.innerHTML = html;

    // Calculate individual diffs manually since they aren't stored in comp
    if (comp && !comp.isFirst) {
      const prevUpdate = DB.getLastUpdateBefore(lastUpdate.shopId, lastUpdate.timestamp);
      if (prevUpdate && prevUpdate.reload) {
        items.forEach(item => {
          const prevVal = prevUpdate.reload[item.key] || 0;
          const diff = item.val - prevVal;
          const type = diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'neutral';
          const icon = diff > 0 ? '▲' : diff < 0 ? '▼' : '➖';
          const diffEl = container.querySelector(`#diff_${item.key}`);
          if (diffEl) {
            diffEl.innerHTML = `<div style="font-size:0.8rem;font-weight:700;color:var(--accent-${type === 'profit' ? 'green' : type === 'loss' ? 'red' : 'text-muted'});">${icon} ${DB.formatCurrency(Math.abs(diff))}</div>`;
          }
        });
      }
    }
  },

  renderBankBreakdown(lastUpdate) {
    const container = document.getElementById('dashBankBreakdown');
    const banks = lastUpdate.mobileRental?.banks || [];
    if (banks.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:20px;grid-column:1/-1;"><div class="empty-sub">No bank data</div></div>';
      return;
    }

    const comp = lastUpdate.comparison;
    let html = '';
    banks.forEach(b => {
      const total = DB.calculateBankTotal(b);
      let diffHtml = '';
      if (comp && !comp.isFirst && comp.mobileRentalByBank[b.bank]) {
        const bd = comp.mobileRentalByBank[b.bank];
        const icon = bd.type === 'profit' ? '▲' : bd.type === 'loss' ? '▼' : '➖';
        diffHtml = `<div style="font-size:0.8rem;font-weight:700;color:var(--accent-${bd.type === 'profit' ? 'green' : bd.type === 'loss' ? 'red' : 'text-muted'});">${icon} ${DB.formatCurrency(Math.abs(bd.diff))}</div>`;
      }
      const bankClass = b.bank.toLowerCase().replace("'", '').replace(' ', '');
      html += `
        <div style="text-align:center;padding:12px;background:var(--bg-glass);border-radius:var(--radius-sm);border:1px solid var(--border-glass);">
          <div class="bank-tag ${bankClass}" style="margin-bottom:8px;">${b.bank}</div>
          <div style="font-size:1.1rem;font-weight:800;">${DB.formatCurrency(total)}</div>
          ${diffHtml}
        </div>`;
    });
    container.innerHTML = html;
  },

  renderRecentUpdates(shopId) {
    const updates = DB.getUpdatesForShop(shopId).slice(0, 10);
    const container = document.getElementById('dashRecentUpdates');

    if (updates.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-icon">📭</div><div class="empty-text">Updates නැහැ</div></div>';
      return;
    }

    let html = '<div class="update-list">';
    updates.forEach(u => {
      const reloadTotal = DB.calculateReloadTotal(u.reload);
      const mobileTotal = DB.calculateMobileRentalGrandTotal(u.mobileRental);
      const comp = u.comparison;

      let diffBadges = '';
      if (comp && !comp.isFirst) {
        diffBadges = `
          <div class="update-diff">
            <span class="update-diff-badge ${comp.reload.type}">🔄 ${comp.reload.type === 'profit' ? '+' : ''}${DB.formatCurrency(comp.reload.diff)}</span>
            <span class="update-diff-badge ${comp.mobileRental.type}">📱 ${comp.mobileRental.type === 'profit' ? '+' : ''}${DB.formatCurrency(comp.mobileRental.diff)}</span>
            <span class="update-diff-badge ${comp.overall.type}">📊 Overall: ${comp.overall.type === 'profit' ? '+' : ''}${DB.formatCurrency(comp.overall.diff)}</span>
          </div>`;
      } else {
        diffBadges = '<div class="update-diff"><span class="update-diff-badge neutral">📌 පළමු Update</span></div>';
      }

      html += `
        <div class="update-item" onclick="App.showUpdateDetail('${u.id}')">
          <div class="update-time">📅 ${DB.formatDateTime(u.timestamp)}</div>
          <div class="update-totals">
            <div class="update-total-item">
              <span class="update-total-label">🔄 Reload</span>
              <span class="update-total-value">${DB.formatCurrency(reloadTotal)}</span>
            </div>
            <div class="update-total-item">
              <span class="update-total-label">📱 Mobile</span>
              <span class="update-total-value">${DB.formatCurrency(mobileTotal)}</span>
            </div>
            <div class="update-total-item">
              <span class="update-total-label">📊 Total</span>
              <span class="update-total-value" style="color:var(--accent-blue);">${DB.formatCurrency(reloadTotal + mobileTotal)}</span>
            </div>
          </div>
          ${diffBadges}
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  },

  // ================================================================
  // UPDATE FORM
  // ================================================================
  setupUpdateForm() {
    // Real-time total calculation for reload
    document.querySelectorAll('.reload-input').forEach(input => {
      input.addEventListener('input', () => this.calculateReloadTotalLive());
    });

    // Add bank button
    document.getElementById('addBankBtn').addEventListener('click', () => this.addBankEntry());

    // Form submit
    document.getElementById('updateForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitUpdate();
    });

    // Clear button
    document.getElementById('clearFormBtn').addEventListener('click', () => {
      document.getElementById('updateForm').reset();
      document.getElementById('bankEntries').innerHTML = '';
      this.bankCounter = 0;
      this.calculateReloadTotalLive();
      this.calculateMobileTotalLive();
    });
  },

  renderUpdateForm() {
    const shopId = DB.getActiveShopId();
    if (!shopId) return;

    const prevUpdate = DB.getLastUpdate(shopId);

    // Show previous update info
    if (prevUpdate) {
      document.getElementById('prevUpdateInfo').style.display = 'block';
      document.getElementById('prevUpdateTime').textContent = DB.formatDateTime(prevUpdate.timestamp);

      const reloadTotal = DB.calculateReloadTotal(prevUpdate.reload);
      const mobileTotal = DB.calculateMobileRentalGrandTotal(prevUpdate.mobileRental);
      document.getElementById('prevUpdateSummary').innerHTML = `
        <div class="result-item"><div class="result-label">🔄 Reload Total</div><div class="result-value" style="color:var(--accent-blue);">${DB.formatCurrency(reloadTotal)}</div></div>
        <div class="result-item"><div class="result-label">📱 Mobile Total</div><div class="result-value" style="color:var(--accent-purple);">${DB.formatCurrency(mobileTotal)}</div></div>
        <div class="result-item"><div class="result-label">📊 Grand Total</div><div class="result-value">${DB.formatCurrency(reloadTotal + mobileTotal)}</div></div>
      `;

      // Show previous values hints
      document.getElementById('prevDialog').textContent = `පෙර: ${DB.formatCurrency(prevUpdate.reload.dialog)}`;
      document.getElementById('prevAirtel').textContent = `පෙර: ${DB.formatCurrency(prevUpdate.reload.airtel)}`;
      document.getElementById('prevMobitel').textContent = `පෙර: ${DB.formatCurrency(prevUpdate.reload.mobitel)}`;
      document.getElementById('prevHutch').textContent = `පෙර: ${DB.formatCurrency(prevUpdate.reload.hutch)}`;
      document.getElementById('prevEzcash').textContent = `පෙර: ${DB.formatCurrency(prevUpdate.reload.ezcash || 0)}`;
      document.getElementById('prevReloadCash').textContent = `පෙර: ${DB.formatCurrency(prevUpdate.reload.cashInDrawer)}`;

      // Pre-populate bank entries from previous
      if (prevUpdate.mobileRental?.banks?.length > 0) {
        document.getElementById('bankEntries').innerHTML = '';
        this.bankCounter = 0;
        prevUpdate.mobileRental.banks.forEach(b => {
          this.addBankEntry(b.bank, null, null, b);
        });
      }
    } else {
      document.getElementById('prevUpdateInfo').style.display = 'none';
      document.getElementById('prevDialog').textContent = '';
      document.getElementById('prevAirtel').textContent = '';
      document.getElementById('prevMobitel').textContent = '';
      document.getElementById('prevHutch').textContent = '';
      document.getElementById('prevEzcash').textContent = '';
      document.getElementById('prevReloadCash').textContent = '';

      // Add one default bank entry
      if (document.getElementById('bankEntries').children.length === 0) {
        this.addBankEntry();
      }
    }

    this.calculateReloadTotalLive();
    this.calculateMobileTotalLive();
  },

  addBankEntry(selectedBank = '', accountVal = '', cashVal = '', prevBank = null) {
    this.bankCounter++;
    const id = this.bankCounter;
    const banks = ['BOC', 'HNB', 'Sampath', "People's", 'Commercial'];

    let prevHint = '';
    if (prevBank) {
      prevHint = `
        <div class="prev-value">පෙර Account: ${DB.formatCurrency(prevBank.accountAmount)} | Cash: ${DB.formatCurrency(prevBank.cashInDrawer)}</div>
      `;
    }

    const html = `
      <div class="bank-entry" id="bankEntry_${id}">
        <button type="button" class="remove-bank" onclick="App.removeBankEntry(${id})">✕</button>
        <div class="form-group">
          <label class="form-label">🏦 Bank</label>
          <select class="form-select bank-select" id="bankSelect_${id}" onchange="App.calculateMobileTotalLive()">
            <option value="">-- Bank තෝරන්න --</option>
            ${banks.map(b => `<option value="${b}" ${b === selectedBank ? 'selected' : ''}>${b}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Account Amount</label>
            <input type="number" class="form-input bank-amount" id="bankAccount_${id}" placeholder="0.00" step="0.01" min="0" value="${accountVal}" oninput="App.calculateMobileTotalLive()">
          </div>
          <div class="form-group">
            <label class="form-label">💵 Cash in Drawer</label>
            <input type="number" class="form-input bank-cash" id="bankCash_${id}" placeholder="0.00" step="0.01" min="0" value="${cashVal}" oninput="App.calculateMobileTotalLive()">
          </div>
        </div>
        ${prevHint}
        <div class="auto-total" style="margin-top:8px;">
          <span class="total-label">${selectedBank || 'Bank'} Total</span>
          <span class="total-value bank-entry-total" id="bankTotal_${id}">Rs.0.00</span>
        </div>
      </div>
    `;

    document.getElementById('bankEntries').insertAdjacentHTML('beforeend', html);
    this.calculateMobileTotalLive();
  },

  removeBankEntry(id) {
    const el = document.getElementById(`bankEntry_${id}`);
    if (el) {
      el.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => {
        el.remove();
        this.calculateMobileTotalLive();
      }, 300);
    }
  },

  calculateReloadTotalLive() {
    const total = (parseFloat(document.getElementById('reloadDialog').value) || 0) +
                  (parseFloat(document.getElementById('reloadAirtel').value) || 0) +
                  (parseFloat(document.getElementById('reloadMobitel').value) || 0) +
                  (parseFloat(document.getElementById('reloadHutch').value) || 0) +
                  (parseFloat(document.getElementById('reloadEzcash').value) || 0) +
                  (parseFloat(document.getElementById('reloadCash').value) || 0);

    document.getElementById('reloadTotal').textContent = DB.formatCurrency(total);

    // Show diff with previous
    const shopId = DB.getActiveShopId();
    if (shopId) {
      const prevUpdate = DB.getLastUpdate(shopId);
      if (prevUpdate) {
        const prevTotal = DB.calculateReloadTotal(prevUpdate.reload);
        const diff = total - prevTotal;
        const type = diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'neutral';
        const icon = type === 'profit' ? '▲' : type === 'loss' ? '▼' : '➖';
        const typeLabel = type === 'profit' ? 'PROFIT' : type === 'loss' ? 'LOSS' : 'NO CHANGE';

        document.getElementById('reloadDiffDisplay').style.display = 'flex';
        document.getElementById('reloadDiffDisplay').className = `diff-display ${type}`;
        document.getElementById('reloadDiffDisplay').innerHTML = `
          <span class="diff-label">${icon} Reload ${typeLabel}</span>
          <span class="diff-value">${diff >= 0 ? '+' : ''}${DB.formatCurrency(diff)}</span>
        `;
      }
    }

    this.updateOverallPreview();
  },

  calculateMobileTotalLive() {
    let grandTotal = 0;
    const entries = document.querySelectorAll('.bank-entry');

    entries.forEach(entry => {
      const id = entry.id.split('_')[1];
      const account = parseFloat(document.getElementById(`bankAccount_${id}`).value) || 0;
      const cash = parseFloat(document.getElementById(`bankCash_${id}`).value) || 0;
      const bankTotal = account + cash;
      const bankName = document.getElementById(`bankSelect_${id}`).value;

      document.getElementById(`bankTotal_${id}`).textContent = DB.formatCurrency(bankTotal);

      // Update total label with bank name
      const totalLabel = entry.querySelector('.total-label');
      if (totalLabel) totalLabel.textContent = (bankName || 'Bank') + ' Total';

      grandTotal += bankTotal;
    });

    document.getElementById('mobileTotal').textContent = DB.formatCurrency(grandTotal);

    // Show diff with previous
    const shopId = DB.getActiveShopId();
    if (shopId) {
      const prevUpdate = DB.getLastUpdate(shopId);
      if (prevUpdate) {
        const prevTotal = DB.calculateMobileRentalGrandTotal(prevUpdate.mobileRental);
        const diff = grandTotal - prevTotal;
        const type = diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'neutral';
        const icon = type === 'profit' ? '▲' : type === 'loss' ? '▼' : '➖';
        const typeLabel = type === 'profit' ? 'PROFIT' : type === 'loss' ? 'LOSS' : 'NO CHANGE';

        document.getElementById('mobileDiffDisplay').style.display = 'flex';
        document.getElementById('mobileDiffDisplay').className = `diff-display ${type}`;
        document.getElementById('mobileDiffDisplay').innerHTML = `
          <span class="diff-label">${icon} Mobile ${typeLabel}</span>
          <span class="diff-value">${diff >= 0 ? '+' : ''}${DB.formatCurrency(diff)}</span>
        `;
      }
    }

    this.updateOverallPreview();
  },

  updateOverallPreview() {
    const shopId = DB.getActiveShopId();
    const prevUpdate = shopId ? DB.getLastUpdate(shopId) : null;
    const container = document.getElementById('overallSummaryPreview');

    if (!prevUpdate) {
      container.style.display = 'none';
      return;
    }

    const reloadTotal = (parseFloat(document.getElementById('reloadDialog').value) || 0) +
                        (parseFloat(document.getElementById('reloadAirtel').value) || 0) +
                        (parseFloat(document.getElementById('reloadMobitel').value) || 0) +
                        (parseFloat(document.getElementById('reloadHutch').value) || 0) +
                        (parseFloat(document.getElementById('reloadEzcash').value) || 0) +
                        (parseFloat(document.getElementById('reloadCash').value) || 0);

    let mobileTotal = 0;
    document.querySelectorAll('.bank-entry').forEach(entry => {
      const id = entry.id.split('_')[1];
      mobileTotal += (parseFloat(document.getElementById(`bankAccount_${id}`).value) || 0) +
                     (parseFloat(document.getElementById(`bankCash_${id}`).value) || 0);
    });

    const currentTotal = reloadTotal + mobileTotal;
    const prevTotal = DB.calculateReloadTotal(prevUpdate.reload) + DB.calculateMobileRentalGrandTotal(prevUpdate.mobileRental);
    const diff = currentTotal - prevTotal;
    const type = diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'neutral';

    const prevReloadTotal = DB.calculateReloadTotal(prevUpdate.reload);
    const prevMobileTotal = DB.calculateMobileRentalGrandTotal(prevUpdate.mobileRental);
    const reloadDiff = reloadTotal - prevReloadTotal;
    const mobileDiff = mobileTotal - prevMobileTotal;

    container.style.display = 'block';
    container.innerHTML = `
      <div style="padding:20px; background:${type === 'profit' ? 'rgba(16,185,129,0.08)' : type === 'loss' ? 'rgba(239,68,68,0.08)' : 'rgba(100,116,139,0.08)'}; border:2px solid ${type === 'profit' ? 'rgba(16,185,129,0.2)' : type === 'loss' ? 'rgba(239,68,68,0.2)' : 'rgba(100,116,139,0.2)'}; border-radius:var(--radius-lg);">
        <div style="text-align:center;">
          <div style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">OVERALL RESULT</div>
          <div style="font-size:2.2rem;font-weight:900;color:var(--accent-${type === 'profit' ? 'green' : type === 'loss' ? 'red' : 'text-muted'});">
            ${diff >= 0 ? '+' : ''}${DB.formatCurrency(diff)}
          </div>
          <div style="font-size:1rem;font-weight:700;color:var(--accent-${type === 'profit' ? 'green' : type === 'loss' ? 'red' : 'text-muted'});margin-top:4px;">
            ${type === 'profit' ? '✅ PROFIT (ලාභ)' : type === 'loss' ? '❌ LOSS (අලාභ)' : '➖ NO CHANGE'}
          </div>
          <div style="margin-top:14px; display:flex; justify-content:center; gap:16px; flex-wrap:wrap;">
            <span style="font-size:0.85rem; font-weight:600; color:var(--accent-${reloadDiff >= 0 ? 'green' : 'red'});">
              🔄 Reload: ${reloadDiff >= 0 ? '+' : ''}${DB.formatCurrency(reloadDiff)}
            </span>
            <span style="font-size:0.85rem; font-weight:600; color:var(--accent-${mobileDiff >= 0 ? 'green' : 'red'});">
              📱 Mobile: ${mobileDiff >= 0 ? '+' : ''}${DB.formatCurrency(mobileDiff)}
            </span>
          </div>
        </div>
      </div>
    `;
  },

  submitUpdate() {
    const shopId = DB.getActiveShopId();
    if (!shopId) {
      this.showToast('කරුණාකර පළමුව සාප්පුවක් තෝරන්න', 'error');
      return;
    }

    // Gather employee data
    const empName = document.getElementById('empName').value.trim();
    const jobRole = document.getElementById('jobRole').value.trim();

    if (!empName) {
      this.showToast(I18N.get('upd_emp_name') + ' ' + I18N.get('is_required') || 'Employee Name is required', 'error');
      return;
    }

    // Gather reload data
    const reload = {
      dialog: parseFloat(document.getElementById('reloadDialog').value) || 0,
      airtel: parseFloat(document.getElementById('reloadAirtel').value) || 0,
      mobitel: parseFloat(document.getElementById('reloadMobitel').value) || 0,
      hutch: parseFloat(document.getElementById('reloadHutch').value) || 0,
      ezcash: parseFloat(document.getElementById('reloadEzcash').value) || 0,
      cashInDrawer: parseFloat(document.getElementById('reloadCash').value) || 0
    };
    reload.total = reload.dialog + reload.airtel + reload.mobitel + reload.hutch + reload.ezcash + reload.cashInDrawer;

    // Gather bank data
    const banks = [];
    document.querySelectorAll('.bank-entry').forEach(entry => {
      const id = entry.id.split('_')[1];
      const bank = document.getElementById(`bankSelect_${id}`).value;
      const accountAmount = parseFloat(document.getElementById(`bankAccount_${id}`).value) || 0;
      const cashInDrawer = parseFloat(document.getElementById(`bankCash_${id}`).value) || 0;

      if (bank) {
        banks.push({
          bank,
          accountAmount,
          cashInDrawer,
          total: accountAmount + cashInDrawer
        });
      }
    });

    const mobileRental = {
      banks,
      grandTotal: banks.reduce((sum, b) => sum + b.total, 0)
    };

    // Validate
    if (reload.total === 0 && mobileRental.grandTotal === 0) {
      this.showToast('කරුණාකර අවම වශයෙන් එක් value එකක් හෝ enter කරන්න', 'error');
      return;
    }

    // Save or Edit
    let update;
    if (this.editingUpdateId) {
      update = DB.editUpdate(this.editingUpdateId, { empName, jobRole, reload, mobileRental });
      this.editingUpdateId = null;
      const btn = document.querySelector('#updateForm button[type="submit"]');
      if (btn) btn.innerHTML = '💾 Save Update (සටහන් කරන්න)';
    } else {
      update = DB.addUpdate({ shopId, empName, jobRole, reload, mobileRental });
    }

    // Show result
    const comp = update.comparison;
    if (comp && !comp.isFirst) {
      const type = comp.overall.type;
      const diff = comp.overall.diff;
      this.showModal(
        `${type === 'profit' ? '✅' : type === 'loss' ? '❌' : '➖'} Update Result`,
        `
        <div style="text-align:center; padding:20px 0;">
          <div style="font-size:2rem; font-weight:900; color:var(--accent-${type === 'profit' ? 'green' : type === 'loss' ? 'red' : 'text-muted'});">
            ${diff >= 0 ? '+' : ''}${DB.formatCurrency(diff)}
          </div>
          <div style="font-size:1.1rem; font-weight:700; margin-top:6px; color:var(--accent-${type === 'profit' ? 'green' : type === 'loss' ? 'red' : 'text-muted'});">
            ${type === 'profit' ? 'PROFIT (ලාභ) ✅' : type === 'loss' ? 'LOSS (අලාභ) ❌' : 'NO CHANGE ➖'}
          </div>
          <div style="margin-top:16px; display:flex; justify-content:center; gap:20px;">
            <div>
              <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;">Reload</div>
              <div style="font-weight:700;color:var(--accent-${comp.reload.type === 'profit' ? 'green' : comp.reload.type === 'loss' ? 'red' : 'text-muted'});">
                ${comp.reload.diff >= 0 ? '+' : ''}${DB.formatCurrency(comp.reload.diff)}
              </div>
            </div>
            <div>
              <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;">Mobile</div>
              <div style="font-weight:700;color:var(--accent-${comp.mobileRental.type === 'profit' ? 'green' : comp.mobileRental.type === 'loss' ? 'red' : 'text-muted'});">
                ${comp.mobileRental.diff >= 0 ? '+' : ''}${DB.formatCurrency(comp.mobileRental.diff)}
              </div>
            </div>
          </div>
        </div>
        `,
        [{ text: 'හරි 👍', class: 'btn-success', onClick: () => this.closeModal() }]
      );
    } else {
      this.showToast('✅ පළමු Update save කරා!', 'success');
    }

    // Reset form
    document.getElementById('updateForm').reset();
    document.getElementById('bankEntries').innerHTML = '';
    this.bankCounter = 0;
    this.renderUpdateForm();
  },

  // ================================================================
  // HISTORY
  // ================================================================
  setupHistoryPage() {
    document.getElementById('historyDateFilter').addEventListener('change', () => this.renderHistory());
    document.getElementById('historyTodayBtn').addEventListener('click', () => {
      document.getElementById('historyDateFilter').value = DB.getTodayDate();
      this.renderHistory();
    });
    document.getElementById('historyAllBtn').addEventListener('click', () => {
      document.getElementById('historyDateFilter').value = '';
      this.renderHistory();
    });

    document.getElementById('historyDateFilter').value = DB.getTodayDate();
  },

  renderHistory() {
    const shopId = DB.getActiveShopId();
    const container = document.getElementById('historyList');

    if (!shopId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏪</div><div class="empty-text">කරුණාකර සාප්පුවක් තෝරන්න</div></div>';
      return;
    }

    const dateFilter = document.getElementById('historyDateFilter').value;
    let updates;
    if (dateFilter) {
      updates = DB.getUpdatesForShopByDate(shopId, dateFilter);
    } else {
      updates = DB.getUpdatesForShop(shopId);
    }

    if (updates.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">Updates නැහැ</div></div>';
      return;
    }

    let html = '<div class="update-list">';
    let currentDate = '';

    updates.forEach(u => {
      if (u.date !== currentDate) {
        currentDate = u.date;
        html += `<div class="date-pill" style="margin-bottom:8px;margin-top:12px;">📅 ${DB.formatDate(u.date)}</div>`;
      }

      const reloadTotal = DB.calculateReloadTotal(u.reload);
      const mobileTotal = DB.calculateMobileRentalGrandTotal(u.mobileRental);
      const comp = u.comparison;

      let diffBadges = '';
      if (comp && !comp.isFirst) {
        diffBadges = `
          <div class="update-diff">
            <span class="update-diff-badge ${comp.reload.type}">🔄 ${comp.reload.diff >= 0 ? '+' : ''}${DB.formatCurrency(comp.reload.diff)}</span>
            <span class="update-diff-badge ${comp.mobileRental.type}">📱 ${comp.mobileRental.diff >= 0 ? '+' : ''}${DB.formatCurrency(comp.mobileRental.diff)}</span>
            <span class="update-diff-badge ${comp.overall.type}" style="font-weight:800;">📊 ${comp.overall.type === 'profit' ? 'PROFIT' : comp.overall.type === 'loss' ? 'LOSS' : '='}: ${comp.overall.diff >= 0 ? '+' : ''}${DB.formatCurrency(comp.overall.diff)}</span>
          </div>`;
      } else {
        diffBadges = '<div class="update-diff"><span class="update-diff-badge neutral">📌 පළමු Update</span></div>';
      }

      html += `
        <div class="update-item" onclick="App.showUpdateDetail('${u.id}')">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div class="update-time">🕐 ${DB.formatTime(u.timestamp)}</div>
              ${u.empName ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">🧑‍💼 ${u.empName} ${u.jobRole ? `(${u.jobRole})` : ''}</div>` : ''}
            </div>
            <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.confirmDeleteUpdate('${u.id}');" style="padding:4px 10px;font-size:0.75rem;">🗑️</button>
          </div>
          <div class="update-totals">
            <div class="update-total-item">
              <span class="update-total-label">🔄 Reload</span>
              <span class="update-total-value">${DB.formatCurrency(reloadTotal)}</span>
            </div>
            <div class="update-total-item">
              <span class="update-total-label">📱 Mobile</span>
              <span class="update-total-value">${DB.formatCurrency(mobileTotal)}</span>
            </div>
            <div class="update-total-item">
              <span class="update-total-label">📊 Grand Total</span>
              <span class="update-total-value" style="color:var(--accent-blue);">${DB.formatCurrency(reloadTotal + mobileTotal)}</span>
            </div>
          </div>
          ${diffBadges}
        </div>`;
    });

    html += '</div>';
    container.innerHTML = html;
  },

  showUpdateDetail(updateId) {
    const updates = DB.getUpdates();
    const u = updates.find(x => x.id === updateId);
    if (!u) return;

    const reloadTotal = DB.calculateReloadTotal(u.reload);
    const mobileTotal = DB.calculateMobileRentalGrandTotal(u.mobileRental);
    const comp = u.comparison;

    let bankDetails = '';
    if (u.mobileRental?.banks?.length > 0) {
      bankDetails = u.mobileRental.banks.map(b => {
        const bankClass = b.bank.toLowerCase().replace("'", '').replace(' ', '');
        let bankDiff = '';
        if (comp && !comp.isFirst && comp.mobileRentalByBank[b.bank]) {
          const bd = comp.mobileRentalByBank[b.bank];
          bankDiff = `<div style="font-size:0.85rem;font-weight:700;color:var(--accent-${bd.type === 'profit' ? 'green' : bd.type === 'loss' ? 'red' : 'text-muted'});">${bd.diff >= 0 ? '+' : ''}${DB.formatCurrency(bd.diff)}</div>`;
        }
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-glass);border-radius:var(--radius-sm);margin-bottom:6px;">
            <span class="bank-tag ${bankClass}">${b.bank}</span>
            <div style="text-align:right;">
              <div style="font-weight:700;">${DB.formatCurrency(DB.calculateBankTotal(b))}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Acc: ${DB.formatCurrency(b.accountAmount)} | Cash: ${DB.formatCurrency(b.cashInDrawer)}</div>
              ${bankDiff}
            </div>
          </div>`;
      }).join('');
    }

    let compSummary = '';
    if (comp && !comp.isFirst) {
      const type = comp.overall.type;
      compSummary = `
        <div style="text-align:center;padding:16px;background:${type === 'profit' ? 'rgba(16,185,129,0.08)' : type === 'loss' ? 'rgba(239,68,68,0.08)' : 'rgba(100,116,139,0.08)'};border-radius:var(--radius-md);margin-top:16px;">
          <div style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;">Vs Previous Update</div>
          <div style="font-size:1.6rem;font-weight:900;color:var(--accent-${type === 'profit' ? 'green' : type === 'loss' ? 'red' : 'text-muted'});">
            ${comp.overall.diff >= 0 ? '+' : ''}${DB.formatCurrency(comp.overall.diff)}
          </div>
          <div style="font-weight:700;color:var(--accent-${type === 'profit' ? 'green' : type === 'loss' ? 'red' : 'text-muted'});">
            ${type === 'profit' ? '✅ PROFIT' : type === 'loss' ? '❌ LOSS' : '➖ NO CHANGE'}
          </div>
        </div>`;
    }

    this.showModal(
      `📌 Update Details - ${DB.formatTime(u.timestamp)}`,
      `
      <div style="margin-bottom:14px;">
        <div style="font-size:0.82rem;color:var(--text-muted);">📅 ${DB.formatDate(u.date)} | 🕐 ${DB.formatTime(u.timestamp)}</div>
      </div>

      <div style="font-weight:700;margin-bottom:8px;color:var(--accent-blue);">🔄 Reload</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;">
        <div style="padding:6px 10px;background:var(--bg-glass);border-radius:var(--radius-sm);font-size:0.85rem;">
          Dialog: <span style="font-weight:700;">${DB.formatCurrency(u.reload.dialog)}</span>
        </div>
        <div style="padding:6px 10px;background:var(--bg-glass);border-radius:var(--radius-sm);font-size:0.85rem;">
          Airtel: <span style="font-weight:700;">${DB.formatCurrency(u.reload.airtel)}</span>
        </div>
        <div style="padding:6px 10px;background:var(--bg-glass);border-radius:var(--radius-sm);font-size:0.85rem;">
          Mobitel: <span style="font-weight:700;">${DB.formatCurrency(u.reload.mobitel)}</span>
        </div>
        <div style="padding:6px 10px;background:var(--bg-glass);border-radius:var(--radius-sm);font-size:0.85rem;">
          Hutch: <span style="font-weight:700;">${DB.formatCurrency(u.reload.hutch)}</span>
        </div>
        <div style="padding:6px 10px;background:var(--bg-glass);border-radius:var(--radius-sm);font-size:0.85rem;">
          eZ Cash: <span style="font-weight:700;">${DB.formatCurrency(u.reload.ezcash || 0)}</span>
        </div>
      </div>
      <div style="padding:6px 10px;background:var(--bg-glass);border-radius:var(--radius-sm);font-size:0.85rem;margin-bottom:8px;">
        Cash: <span style="font-weight:700;">${DB.formatCurrency(u.reload.cashInDrawer)}</span>
      </div>
      <div style="font-weight:800;color:var(--accent-blue);margin-bottom:16px;">Total: ${DB.formatCurrency(reloadTotal)}</div>

      <div style="font-weight:700;margin-bottom:8px;color:var(--accent-purple);">📱 Mobile Rental</div>
      ${bankDetails || '<div style="color:var(--text-muted);font-size:0.85rem;">No bank entries</div>'}
      <div style="font-weight:800;color:var(--accent-purple);margin-top:8px;">Total: ${DB.formatCurrency(mobileTotal)}</div>

      <div style="font-weight:800;font-size:1.1rem;margin-top:14px;padding-top:14px;border-top:1px solid var(--border-glass);">
        📊 Grand Total: <span style="color:var(--accent-blue);">${DB.formatCurrency(reloadTotal + mobileTotal)}</span>
      </div>

      ${compSummary}
      `,
      [
        { text: 'වසන්න', class: 'btn-ghost', onClick: () => this.closeModal() },
        { text: '✏️ Edit', class: 'btn-primary', onClick: () => { this.closeModal(); this.promptEditUpdate(u.id); } }
      ]
    );
  },

  promptEditUpdate(updateId) {
    this.showModal(
      '🔐 Enter Admin Password',
      `<div class="form-group" style="margin-top:10px;">
        <input type="password" id="adminPwdInput" class="form-input" placeholder="Password (මුරපදය)" autofocus>
      </div>`,
      [
        { text: 'Cancel', class: 'btn-ghost', onClick: () => this.closeModal() },
        { text: 'OK', class: 'btn-primary', onClick: () => {
            const pwd = document.getElementById('adminPwdInput').value;
            const cleanedPwd = pwd ? pwd.trim() : '';
            if (cleanedPwd === '1234') {
              this.closeModal();
              this.startEditingUpdate(updateId);
            } else {
              this.showToast('Incorrect Password (මුරපදය වැරදියි)', 'error');
            }
          }
        }
      ]
    );
  },

  startEditingUpdate(updateId) {
    const shopId = DB.getActiveShopId();
    const update = DB.getUpdatesForShop(shopId).find(u => u.id === updateId);
    if (!update) return;

    this.editingUpdateId = updateId;
    this.navigateTo('update');
    
    document.getElementById('empName').value = update.empName || '';
    document.getElementById('jobRole').value = update.jobRole || '';
    document.getElementById('reloadDialog').value = update.reload.dialog || '';
    document.getElementById('reloadAirtel').value = update.reload.airtel || '';
    document.getElementById('reloadMobitel').value = update.reload.mobitel || '';
    document.getElementById('reloadHutch').value = update.reload.hutch || '';
    document.getElementById('reloadEzcash').value = update.reload.ezcash || '';
    document.getElementById('reloadCash').value = update.reload.cashInDrawer || '';

    document.getElementById('bankEntries').innerHTML = '';
    this.bankCounter = 0;
    if (update.mobileRental?.banks?.length > 0) {
      update.mobileRental.banks.forEach(b => {
        this.addBankEntry(b.bank, b.accountAmount, b.cashInDrawer);
      });
    } else {
      this.addBankEntry();
    }
    
    // Change submit button text
    const btn = document.querySelector('#updateForm button[type="submit"]');
    if (btn) btn.innerHTML = '✏️ Update Data (වෙනස් කරන්න)';
    
    this.calculateReloadTotalLive();
    this.calculateMobileTotalLive();
  },

  confirmDeleteUpdate(updateId) {
    this.showModal(
      '🗑️ Update මකන්නද?',
      '<div class="delete-confirm-text">මෙම update එක ස්ථිරවම මකා දැමෙනු ඇත. ඔබට විශ්වාසද?</div>',
      [
        { text: 'අවලංගු', class: 'btn-ghost', onClick: () => this.closeModal() },
        {
          text: '🗑️ මකන්න', class: 'btn-danger', onClick: () => {
            DB.deleteUpdate(updateId);
            this.closeModal();
            this.showToast('Update මකා දැමුවා', 'success');
            this.renderHistory();
            if (this.currentPage === 'dashboard') this.renderDashboard();
          }
        }
      ]
    );
  },

  // ================================================================
  // SHOPS
  // ================================================================
  setupShopsPage() {
    document.getElementById('addShopBtn').addEventListener('click', () => this.showAddShopModal());
  },

  showAddShopModal() {
    this.showModal(
      '🏪 නව සාප්පුවක් එකතු කරන්න',
      `
      <div class="form-group">
        <label class="form-label">සාප්පුවේ නම</label>
        <input type="text" class="form-input" id="newShopName" placeholder="උදා: My Mobile Shop" autofocus>
      </div>
      `,
      [
        { text: 'අවලංගු', class: 'btn-ghost', onClick: () => this.closeModal() },
        {
          text: '➕ එකතු කරන්න', class: 'btn-primary', onClick: () => {
            const name = document.getElementById('newShopName').value.trim();
            if (!name) {
              this.showToast('කරුණාකර නමක් ඇතුළත් කරන්න', 'error');
              return;
            }
            DB.addShop(name);
            this.closeModal();
            this.refreshShopSelector();
            this.renderShops();
            this.showToast(`🏪 "${name}" එකතු කරා!`, 'success');
          }
        }
      ]
    );
    // Focus input after modal opens
    setTimeout(() => {
      const input = document.getElementById('newShopName');
      if (input) input.focus();
    }, 100);
  },

  renderShops() {
    const shops = DB.getShops();
    const activeId = DB.getActiveShopId();
    const container = document.getElementById('shopList');

    if (shops.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏪</div><div class="empty-text">සාප්පු නැහැ</div><div class="empty-sub">පළමු සාප්පුව එකතු කරන්න</div></div>';
      return;
    }

    let html = '';
    shops.forEach(s => {
      const updates = DB.getUpdatesForShop(s.id);
      const isActive = s.id === activeId;
      const comp = DB.getShopLatestComparison(s.id);
      let profitHtml = '';
      if (comp) {
         const diff = comp.overall.diff;
         const type = comp.overall.type;
         profitHtml = `<div style="margin-top: 6px; font-weight: 800; font-size: 0.95rem; color: ${type === 'profit' ? 'var(--accent-green)' : type === 'loss' ? 'var(--accent-red)' : 'var(--text-muted)'}">
           ${type === 'profit' ? '✅ Profit: ' : type === 'loss' ? '❌ Loss: ' : '➖ '}${DB.formatCurrency(Math.abs(diff))}
         </div>`;
      } else {
         profitHtml = `<div style="margin-top: 6px; font-size: 0.85rem; color: var(--text-muted);">➖ No Data Yet</div>`;
      }

      html += `
        <div class="shop-card ${isActive ? 'active' : ''}" style="cursor: pointer;" onclick="if(event.target.tagName !== 'BUTTON') App.switchShop('${s.id}')">
          <div class="shop-name">${isActive ? '✅' : '🏪'} ${s.name}</div>
          <div class="shop-meta" style="margin-bottom: 8px;">📌 Updates: ${updates.length} | 📅 Created: ${DB.formatDate(s.createdAt.split('T')[0])}</div>
          ${profitHtml}
          <div class="shop-actions" style="margin-top: 14px;">
            ${!isActive ? `<button class="btn btn-primary btn-sm" onclick="App.switchShop('${s.id}')">🔄 Select</button>` : '<span class="date-pill">✅ Active</span>'}
            <button class="btn btn-ghost btn-sm" onclick="App.editShop('${s.id}')">✏️ Edit</button>
            <button class="btn btn-danger btn-sm" onclick="App.confirmDeleteShop('${s.id}', '${s.name.replace(/'/g, "\\'")}')">🗑️</button>
          </div>
        </div>`;
    });
    container.innerHTML = html;
  },

  showMainDashboard() {
    DB.setActiveShop('');
    this.refreshShopSelector();
    this.navigateTo('dashboard');
  },

  switchShop(shopId) {
    DB.setActiveShop(shopId);
    this.refreshShopSelector();
    this.navigateTo('dashboard');
    this.showToast('🏪 Shop switch කරා!', 'success');
  },

  editShop(shopId) {
    const shop = DB.getShops().find(s => s.id === shopId);
    if (!shop) return;

    this.showModal(
      '✏️ සාප්පුව edit කරන්න',
      `
      <div class="form-group">
        <label class="form-label">සාප්පුවේ නම</label>
        <input type="text" class="form-input" id="editShopName" value="${shop.name}">
      </div>
      `,
      [
        { text: 'අවලංගු', class: 'btn-ghost', onClick: () => this.closeModal() },
        {
          text: '💾 Save', class: 'btn-primary', onClick: () => {
            const name = document.getElementById('editShopName').value.trim();
            if (!name) {
              this.showToast('කරුණාකර නමක් ඇතුළත් කරන්න', 'error');
              return;
            }
            DB.updateShop(shopId, name);
            this.closeModal();
            this.refreshShopSelector();
            this.renderShops();
            this.showToast('✏️ Shop update කරා!', 'success');
          }
        }
      ]
    );
  },

  confirmDeleteShop(shopId, shopName) {
    this.showModal(
      '🗑️ සාප්පුව මකන්නද?',
      `<div class="delete-confirm-text">"<strong>${shopName}</strong>" සහ එහි සියලු updates මකා දැමෙනු ඇත. ඔබට විශ්වාසද?</div>`,
      [
        { text: 'අවලංගු', class: 'btn-ghost', onClick: () => this.closeModal() },
        {
          text: '🗑️ මකන්න', class: 'btn-danger', onClick: () => {
            DB.deleteShop(shopId);
            this.closeModal();
            this.refreshShopSelector();
            this.renderShops();
            this.renderDashboard();
            this.showToast('🗑️ Shop මකා දැමුවා', 'success');
          }
        }
      ]
    );
  },

  // ================================================================
  // REPORTS
  // ================================================================
  setupReportsPage() {
    const today = DB.getTodayDate();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    document.getElementById('reportStartDate').value = weekAgo.toISOString().split('T')[0];
    document.getElementById('reportEndDate').value = today;

    document.getElementById('reportPresetFilter').addEventListener('change', (e) => {
        const val = e.target.value;
        const startInput = document.getElementById('reportStartDate');
        const endInput = document.getElementById('reportEndDate');
        const now = new Date();
        
        endInput.value = DB.getTodayDate();

        if (val === 'today') {
            startInput.value = DB.getTodayDate();
        } else if (val === 'yesterday') {
            const yest = new Date();
            yest.setDate(yest.getDate() - 1);
            startInput.value = yest.toISOString().split('T')[0];
            endInput.value = startInput.value;
        } else if (val === 'thisWeek') {
            const week = new Date();
            week.setDate(week.getDate() - 7);
            startInput.value = week.toISOString().split('T')[0];
        } else if (val === 'thisMonth') {
            const month = new Date();
            month.setDate(1);
            startInput.value = month.toISOString().split('T')[0];
        } else if (val === 'thisYear') {
            const year = new Date();
            year.setMonth(0, 1);
            startInput.value = year.toISOString().split('T')[0];
        } else if (val === 'last3Months') {
            const month3 = new Date();
            month3.setMonth(month3.getMonth() - 3);
            startInput.value = month3.toISOString().split('T')[0];
        } else if (val === 'allTime') {
            startInput.value = '2000-01-01';
        }
    });

    document.getElementById('reportFilterBtn').addEventListener('click', () => this.generateReport());
  },

  generateReport() {
    const shopId = DB.getActiveShopId();
    const container = document.getElementById('reportResults');

    if (!shopId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏪</div><div class="empty-text">කරුණාකර සාප්පුවක් තෝරන්න</div></div>';
      return;
    }

    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;

    if (!startDate || !endDate) {
      this.showToast('කරුණාකර dates select කරන්න', 'error');
      return;
    }

    const updates = DB.getDateRange(shopId, startDate, endDate);

    if (updates.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">මෙම කාලය තුළ Updates නැහැ</div></div>';
      return;
    }

    // Calculate totals
    let totalProfit = 0;
    let totalLoss = 0;
    let reloadProfit = 0;
    let reloadLoss = 0;
    let mobileProfit = 0;
    let mobileLoss = 0;
    const bankProfitLoss = {};

    updates.forEach(u => {
      if (u.comparison && !u.comparison.isFirst) {
        const c = u.comparison;
        if (c.overall.diff > 0) totalProfit += c.overall.diff;
        else totalLoss += Math.abs(c.overall.diff);

        if (c.reload.diff > 0) reloadProfit += c.reload.diff;
        else reloadLoss += Math.abs(c.reload.diff);

        if (c.mobileRental.diff > 0) mobileProfit += c.mobileRental.diff;
        else mobileLoss += Math.abs(c.mobileRental.diff);

        // Bank wise
        Object.entries(c.mobileRentalByBank || {}).forEach(([bank, bd]) => {
          if (!bankProfitLoss[bank]) bankProfitLoss[bank] = { profit: 0, loss: 0 };
          if (bd.diff > 0) bankProfitLoss[bank].profit += bd.diff;
          else bankProfitLoss[bank].loss += Math.abs(bd.diff);
        });
      }
    });

    const netProfitLoss = totalProfit - totalLoss;
    const netType = netProfitLoss > 0 ? 'profit' : netProfitLoss < 0 ? 'loss' : 'neutral';

    // Bank breakdown
    let bankHtml = '';
    Object.entries(bankProfitLoss).forEach(([bank, pl]) => {
      const net = pl.profit - pl.loss;
      const type = net > 0 ? 'profit' : net < 0 ? 'loss' : 'neutral';
      const bankClass = bank.toLowerCase().replace("'", '').replace(' ', '');
      bankHtml += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg-glass);border-radius:var(--radius-sm);margin-bottom:6px;">
          <span class="bank-tag ${bankClass}">${bank}</span>
          <div style="text-align:right;">
            <div style="font-weight:800;color:var(--accent-${type === 'profit' ? 'green' : type === 'loss' ? 'red' : 'text-muted'});">
              ${net >= 0 ? '+' : ''}${DB.formatCurrency(net)}
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);">
              ✅ ${DB.formatCurrency(pl.profit)} | ❌ ${DB.formatCurrency(pl.loss)}
            </div>
          </div>
        </div>`;
    });

    // Get unique dates
    const uniqueDates = [...new Set(updates.map(u => u.date))].sort();

    container.innerHTML = `
      <!-- Overall Summary -->
      <div class="card overall-card ${netType === 'profit' ? 'profit-card' : netType === 'loss' ? 'loss-card' : 'neutral-card'}" style="margin-bottom:20px;">
        <div class="overall-label">📊 ${DB.formatDate(startDate)} - ${DB.formatDate(endDate)}</div>
        <div class="overall-value ${netType}">${netProfitLoss >= 0 ? '+' : ''}${DB.formatCurrency(netProfitLoss)}</div>
        <div class="overall-type" style="color:var(--accent-${netType === 'profit' ? 'green' : netType === 'loss' ? 'red' : 'text-muted'});">
          ${netType === 'profit' ? '✅ NET PROFIT' : netType === 'loss' ? '❌ NET LOSS' : '➖ BREAK EVEN'}
        </div>
      </div>

      <!-- Category Breakdown -->
      <div class="summary-grid">
        <div class="card accent-blue">
          <div class="card-header">
            <span class="card-title">🔄 Reload</span>
          </div>
          <div style="display:flex;gap:16px;">
            <div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Profit</div>
              <div style="font-weight:800;color:var(--accent-green);">+${DB.formatCurrency(reloadProfit)}</div>
            </div>
            <div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Loss</div>
              <div style="font-weight:800;color:var(--accent-red);">-${DB.formatCurrency(reloadLoss)}</div>
            </div>
            <div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Net</div>
              <div style="font-weight:800;color:var(--accent-${reloadProfit - reloadLoss >= 0 ? 'green' : 'red'});">
                ${DB.formatCurrency(reloadProfit - reloadLoss)}
              </div>
            </div>
          </div>
        </div>

        <div class="card accent-purple">
          <div class="card-header">
            <span class="card-title">📱 Mobile Rental</span>
          </div>
          <div style="display:flex;gap:16px;">
            <div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Profit</div>
              <div style="font-weight:800;color:var(--accent-green);">+${DB.formatCurrency(mobileProfit)}</div>
            </div>
            <div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Loss</div>
              <div style="font-weight:800;color:var(--accent-red);">-${DB.formatCurrency(mobileLoss)}</div>
            </div>
            <div>
              <div style="font-size:0.78rem;color:var(--text-muted);">Net</div>
              <div style="font-weight:800;color:var(--accent-${mobileProfit - mobileLoss >= 0 ? 'green' : 'red'});">
                ${DB.formatCurrency(mobileProfit - mobileLoss)}
              </div>
            </div>
          </div>
        </div>

        <div class="card accent-green">
          <div class="card-header">
            <span class="card-title">📌 Summary</span>
          </div>
          <div>
            <div style="font-size:0.78rem;color:var(--text-muted);">Total Updates</div>
            <div style="font-weight:800;font-size:1.4rem;">${updates.length}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px;">Days</div>
            <div style="font-weight:800;font-size:1.4rem;">${uniqueDates.length}</div>
          </div>
        </div>
      </div>

      <!-- Bank Breakdown -->
      ${bankHtml ? `
      <div class="card" style="margin-top:20px;">
        <div class="card-header">
          <span class="card-title">🏦 Bank Wise Profit/Loss</span>
        </div>
        ${bankHtml}
      </div>` : ''}

      <!-- Chart Breakdown -->
      <div class="card" style="margin-top:20px; padding: 10px;">
        <div class="card-header" style="margin-bottom: 10px;">
          <span class="card-title">📈 Profit/Loss Chart (ලාභ/අලාභ ප්‍රස්ථාරය)</span>
        </div>
        <div style="width: 100%; height: 300px; position: relative;">
          <canvas id="reportChart"></canvas>
        </div>
      </div>

      <!-- Daily Details -->
      <div class="card" style="margin-top:20px;">
        <div class="card-header">
          <span class="card-title">📅 Daily Breakdown</span>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-glass);">
                <th style="text-align:left;padding:10px;color:var(--text-muted);font-weight:600;">Date</th>
                <th style="text-align:right;padding:10px;color:var(--text-muted);font-weight:600;">Updates</th>
                <th style="text-align:right;padding:10px;color:var(--text-muted);font-weight:600;">Reload</th>
                <th style="text-align:right;padding:10px;color:var(--text-muted);font-weight:600;">Mobile</th>
                <th style="text-align:right;padding:10px;color:var(--text-muted);font-weight:600;">P/L</th>
              </tr>
            </thead>
            <tbody>
              ${uniqueDates.map(date => {
                const dayUpdates = updates.filter(u => u.date === date);
                const lastDayUpdate = dayUpdates[0]; // already sorted newest first
                const dayComp = lastDayUpdate.comparison;
                const dayPL = dayComp && !dayComp.isFirst ? dayComp.overall.diff : 0;
                const dayType = dayPL > 0 ? 'profit' : dayPL < 0 ? 'loss' : 'neutral';

                return `
                  <tr style="border-bottom:1px solid var(--border-glass);">
                    <td style="padding:10px;">${DB.formatDate(date)}</td>
                    <td style="padding:10px;text-align:right;">${dayUpdates.length}</td>
                    <td style="padding:10px;text-align:right;font-weight:600;">${DB.formatCurrency(DB.calculateReloadTotal(lastDayUpdate.reload))}</td>
                    <td style="padding:10px;text-align:right;font-weight:600;">${DB.formatCurrency(DB.calculateMobileRentalGrandTotal(lastDayUpdate.mobileRental))}</td>
                    <td style="padding:10px;text-align:right;font-weight:800;color:var(--accent-${dayType === 'profit' ? 'green' : dayType === 'loss' ? 'red' : 'text-muted'});">
                      ${dayPL >= 0 ? '+' : ''}${DB.formatCurrency(dayPL)}
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const chartLabels = uniqueDates.map(d => DB.formatDate(d));
    const chartDataProfit = [];
    const chartDataLoss = [];

    uniqueDates.forEach(date => {
      let dailyProfit = 0;
      let dailyLoss = 0;
      const dayUpdates = updates.filter(u => u.date === date);
      dayUpdates.forEach(u => {
        if (u.comparison && !u.comparison.isFirst) {
          const diff = u.comparison.overall.diff;
          if (diff > 0) dailyProfit += diff;
          else dailyLoss += Math.abs(diff);
        }
      });
      chartDataProfit.push(dailyProfit);
      chartDataLoss.push(dailyLoss);
    });

    if (window.reportChartInstance) {
      window.reportChartInstance.destroy();
    }
    const ctx = document.getElementById('reportChart').getContext('2d');
    window.reportChartInstance = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'Profit (ලාභ)',
            data: chartDataProfit,
            backgroundColor: 'rgba(22, 163, 74, 0.7)',
            borderColor: 'rgba(22, 163, 74, 1)',
            borderWidth: 1
          },
          {
            label: 'Loss (අලාභ)',
            data: chartDataLoss,
            backgroundColor: 'rgba(228, 0, 43, 0.7)',
            borderColor: 'rgba(228, 0, 43, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  },

  // ================================================================
  // EXPORT / IMPORT
  // ================================================================
  setupExportImport() {
    document.getElementById('exportBtn').addEventListener('click', () => {
      DB.forceBackup();
      this.updateBackupStatus();
      this.showToast('📤 Data export කරා! Backup safe!', 'success');
    });

    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const success = DB.importData(event.target.result);
        if (success) {
          this.refreshShopSelector();
          this.navigateTo('dashboard');
          this.showToast('📥 Data import කරා! Data restore වුණා!', 'success');
        } else {
          this.showToast('❌ Import failed! File එක check කරන්න', 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }
};

// ---- Initialize on DOM ready ----
document.addEventListener('DOMContentLoaded', () => App.init());

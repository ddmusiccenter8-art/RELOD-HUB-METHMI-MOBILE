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

  // ---- Period Summary (Today, Yesterday, Week, Month, Year, All) ----
  updatePeriodSummary(shopId) {
    const sel = document.getElementById('dashPeriodSelector');
    if (!sel) return;
    const period = sel.value || 'month';
    const stats = DB.getStatsForPeriod(shopId, period);
    const valEl = document.getElementById('dashPeriodValue');
    const typeEl = document.getElementById('dashPeriodType');
    if (!valEl || !typeEl) return;

    if (!stats || (stats.net === 0 && stats.totalProfit === 0 && stats.totalLoss === 0)) {
      valEl.textContent = 'Rs.0.00';
      valEl.className = 'overall-value neutral';
      typeEl.textContent = 'NO DATA IN PERIOD';
      typeEl.style.color = 'var(--text-muted)';
    } else {
      const type = stats.type;
      valEl.textContent = `${stats.net >= 0 ? '+' : ''}${DB.formatCurrency(stats.net)}`;
      valEl.className = `overall-value ${type}`;
      typeEl.textContent = type === 'profit' ? '✅ PROFIT (ලාභ)' : type === 'loss' ? '❌ LOSS (අලාභ)' : '➖ NO CHANGE';
      typeEl.style.color = type === 'profit' ? 'var(--accent-green)' : type === 'loss' ? 'var(--accent-red)' : 'var(--text-muted)';
    }
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

    const shop = DB.getShop(shopId);
    if (!shop) {
      this.renderNoDashboard();
      return;
    }

    this.updatePeriodSummary(shopId);

    const lastUpdate = DB.getLastUpdate(shopId);
    const today = DB.getTodayDate();
    const todayUpdates = DB.getUpdatesForShopByDate(shopId, today);

    // Hide All Shops Section when viewing a single shop
    const allShopsSec = document.getElementById('dashAllShopsSection');
    if (allShopsSec) allShopsSec.style.display = 'none';

    // Show Comparison Section
    const compSec = document.getElementById('dashComparisonSection');
    if (compSec) compSec.style.display = 'block';

    if (!lastUpdate) {
      this.renderEmptyShopDashboard(shop);
      return;
    }

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
      overallType.textContent = 'පළමු UPDATE (FIRST UPDATE)';
      overallType.style.color = 'var(--text-muted)';
      overallCard.className = 'card overall-card neutral-card';
    }

    const vals = DB.extractValues(lastUpdate);
    document.getElementById('overallTotalCapital').textContent = DB.formatCurrency(vals.totalCapital);

    // 1. Reload Total Card
    document.getElementById('dashReloadTotal').textContent = DB.formatCurrency(vals.reloadTotal);
    if (comp && !comp.isFirst) {
      const rd = comp.reload;
      document.getElementById('dashReloadDiff').textContent = `${rd.type === 'profit' ? '▲' : rd.type === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(rd.diff))}`;
      document.getElementById('dashReloadDiff').className = `card-diff ${rd.type}`;
    } else {
      document.getElementById('dashReloadDiff').textContent = '➖ First Update';
      document.getElementById('dashReloadDiff').className = 'card-diff neutral';
    }

    // 2. Bank Card
    document.getElementById('dashBankTotal').textContent = DB.formatCurrency(vals.bankTotal);
    if (comp && !comp.isFirst) {
      const bd = comp.bank;
      document.getElementById('dashBankDiff').textContent = `${bd.type === 'profit' ? '▲' : bd.type === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(bd.diff))}`;
      document.getElementById('dashBankDiff').className = `card-diff ${bd.type}`;
    } else {
      document.getElementById('dashBankDiff').textContent = '➖ First Update';
      document.getElementById('dashBankDiff').className = 'card-diff neutral';
    }

    // 3. Cash Card
    document.getElementById('dashCashTotal').textContent = DB.formatCurrency(vals.totalCash);
    if (comp && !comp.isFirst) {
      const cd = comp.cash;
      document.getElementById('dashCashDiff').textContent = `${cd.type === 'profit' ? '▲' : cd.type === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(cd.diff))}`;
      document.getElementById('dashCashDiff').className = `card-diff ${cd.type}`;
    } else {
      document.getElementById('dashCashDiff').textContent = '➖ First Update';
      document.getElementById('dashCashDiff').className = 'card-diff neutral';
    }

    // 4. Grand Total Capital Card
    document.getElementById('dashCapitalTotal').textContent = DB.formatCurrency(vals.totalCapital);
    if (comp && !comp.isFirst) {
      const od = comp.overall;
      document.getElementById('dashCapitalDiff').textContent = `${od.type === 'profit' ? '▲' : od.type === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(od.diff))}`;
      document.getElementById('dashCapitalDiff').className = `card-diff ${od.type}`;
    } else {
      document.getElementById('dashCapitalDiff').textContent = '➖ First Update';
      document.getElementById('dashCapitalDiff').className = 'card-diff neutral';
    }

    // Comparison Table
    this.renderComparisonTable(lastUpdate);

    // Recent updates
    this.renderRecentUpdates(shopId);
  },

  renderEmptyShopDashboard(shop) {
    document.getElementById('overallValue').textContent = 'Rs.0.00';
    document.getElementById('overallValue').className = 'overall-value neutral';
    document.getElementById('overallType').textContent = 'NO DATA YET';
    document.getElementById('overallType').style.color = 'var(--text-muted)';
    document.getElementById('overallCard').className = 'card overall-card neutral-card';
    document.getElementById('overallTotalCapital').textContent = 'Rs.0.00';
    document.getElementById('dashReloadTotal').textContent = 'Rs.0.00';
    document.getElementById('dashReloadDiff').textContent = '➖ Rs.0.00';
    document.getElementById('dashBankTotal').textContent = 'Rs.0.00';
    document.getElementById('dashBankDiff').textContent = '➖ Rs.0.00';
    document.getElementById('dashCashTotal').textContent = 'Rs.0.00';
    document.getElementById('dashCashDiff').textContent = '➖ Rs.0.00';
    document.getElementById('dashCapitalTotal').textContent = 'Rs.0.00';
    document.getElementById('dashCapitalDiff').textContent = '➖ Rs.0.00';

    const compTable = document.getElementById('dashComparisonTable');
    if (compTable) {
      compTable.innerHTML = `<div class="empty-state" style="padding:24px;"><div class="empty-icon">🏪</div><div class="empty-text">"${shop.name}" සඳහා තවම Updates නැත</div><div class="empty-sub">පළමු update එක ලබාගැනීමට ➕ Add Update ඔබන්න.</div></div>`;
    }
    document.getElementById('dashRecentUpdates').innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-icon">📭</div><div class="empty-text">Updates නැහැ</div><div class="empty-sub">පළමු update එක ගන්න ➕ බොත්තම ඔබන්න</div></div>';
  },

  renderComparisonTable(lastUpdate) {
    const container = document.getElementById('dashComparisonTable');
    if (!container) return;

    const curr = DB.extractValues(lastUpdate);
    const comp = lastUpdate.comparison;
    const prevUpdate = DB.getLastUpdateBefore(lastUpdate.shopId, lastUpdate.timestamp);
    const prev = DB.extractValues(prevUpdate);

    const rows = [
      {
        icon: '🔄',
        name: I18N.t('comp_track_reload') || 'Reload Track (SIMs + Reload Cash)',
        curr: curr.reloadTotal,
        prev: prevUpdate ? prev.reloadTotal : 0,
        diff: comp && !comp.isFirst ? comp.reload.diff : 0,
        type: comp && !comp.isFirst ? comp.reload.type : 'neutral'
      },
      {
        icon: '🏦',
        name: I18N.t('comp_track_bank') || 'Bank Track (Accounts + Bank Cash)',
        curr: curr.bankTotal,
        prev: prevUpdate ? prev.bankTotal : 0,
        diff: comp && !comp.isFirst ? comp.bank.diff : 0,
        type: comp && !comp.isFirst ? comp.bank.type : 'neutral'
      },
      {
        icon: '💰',
        name: I18N.t('comp_track_total') || 'Grand Total Capital (Reload + Bank)',
        curr: curr.totalCapital,
        prev: prevUpdate ? prev.totalCapital : 0,
        diff: comp && !comp.isFirst ? comp.overall.diff : 0,
        type: comp && !comp.isFirst ? comp.overall.type : 'neutral',
        isTotal: true
      }
    ];

    let html = `
      <div style="overflow-x:auto;">
        <table class="data-table" style="width:100%; border-collapse:collapse; margin-top:8px;">
          <thead>
            <tr style="background:var(--bg-glass); border-bottom:1px solid var(--border-glass);">
              <th style="padding:10px 14px; text-align:left; font-size:0.85rem;">${I18N.t('hist_table_action') || 'Category'}</th>
              <th style="padding:10px 14px; text-align:right; font-size:0.85rem;">${I18N.t('comp_prev_total') || 'Previous Total'}</th>
              <th style="padding:10px 14px; text-align:right; font-size:0.85rem;">${I18N.t('comp_curr_total') || 'Today Total'}</th>
              <th style="padding:10px 14px; text-align:right; font-size:0.85rem;">${I18N.t('comp_diff') || 'Difference (P/L)'}</th>
              <th style="padding:10px 14px; text-align:center; font-size:0.85rem;">Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    rows.forEach(r => {
      const isTotalStyle = r.isTotal ? 'font-weight:800; font-size:1.05rem; background:rgba(59,130,246,0.06);' : '';
      const icon = r.type === 'profit' ? '▲' : r.type === 'loss' ? '▼' : '➖';
      const typeLabel = r.type === 'profit' ? I18N.t('profit') : r.type === 'loss' ? I18N.t('loss') : I18N.t('neutral');
      const color = r.type === 'profit' ? 'var(--accent-green)' : r.type === 'loss' ? 'var(--accent-red)' : 'var(--text-muted)';

      html += `
        <tr style="border-bottom:1px solid var(--border-glass); ${isTotalStyle}">
          <td style="padding:12px 14px; font-weight:700;">${r.icon} ${r.name}</td>
          <td style="padding:12px 14px; text-align:right; color:var(--text-muted);">${prevUpdate ? DB.formatCurrency(r.prev) : '--'}</td>
          <td style="padding:12px 14px; text-align:right; font-weight:700;">${DB.formatCurrency(r.curr)}</td>
          <td style="padding:12px 14px; text-align:right; font-weight:800; color:${color};">
            ${comp && !comp.isFirst ? `${r.diff >= 0 ? '+' : ''}${DB.formatCurrency(r.diff)}` : '--'}
          </td>
          <td style="padding:12px 14px; text-align:center;">
            <span class="badge ${r.type}" style="padding:4px 10px; font-size:0.78rem; font-weight:700; border-radius:12px; background:rgba(${r.type === 'profit' ? '16,185,129' : r.type === 'loss' ? '239,68,68' : '100,116,139'}, 0.15); color:${color};">
              ${comp && !comp.isFirst ? `${icon} ${typeLabel}` : 'First Update'}
            </span>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
  },

  renderNoDashboard() {
    this.updatePeriodSummary(null);

    // Show All Shops Section
    const allShopsSec = document.getElementById('dashAllShopsSection');
    if (allShopsSec) allShopsSec.style.display = 'block';

    // Hide single shop comparison section
    const compSec = document.getElementById('dashComparisonSection');
    if (compSec) compSec.style.display = 'none';

    const stats = DB.getGlobalStats();

    if (stats.hasData) {
      const overallDiff = stats.diffs.overall;
      const overallType = overallDiff > 0 ? 'profit' : overallDiff < 0 ? 'loss' : 'neutral';
      document.getElementById('overallValue').textContent = DB.formatCurrency(Math.abs(overallDiff));
      document.getElementById('overallValue').className = `overall-value ${overallType}`;
      document.getElementById('overallType').textContent = 'ALL SHOPS (සියලුම සාප්පු වල එකතුව)';
      document.getElementById('overallType').style.color = 'var(--accent-blue)';
      document.getElementById('overallCard').className = `card overall-card ${overallType === 'profit' ? 'profit-card' : overallType === 'loss' ? 'loss-card' : 'neutral-card'}`;
      document.getElementById('overallTotalCapital').textContent = DB.formatCurrency(stats.totalCapital);

      // Reload
      document.getElementById('dashReloadTotal').textContent = DB.formatCurrency(stats.reloadTotal);
      const rd = stats.diffs.reload;
      const rdType = rd > 0 ? 'profit' : rd < 0 ? 'loss' : 'neutral';
      document.getElementById('dashReloadDiff').textContent = `${rdType === 'profit' ? '▲' : rdType === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(rd))}`;
      document.getElementById('dashReloadDiff').className = `card-diff ${rdType}`;

      // Bank
      document.getElementById('dashBankTotal').textContent = DB.formatCurrency(stats.bankTotal);
      const bd = stats.diffs.bank;
      const bdType = bd > 0 ? 'profit' : bd < 0 ? 'loss' : 'neutral';
      document.getElementById('dashBankDiff').textContent = `${bdType === 'profit' ? '▲' : bdType === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(bd))}`;
      document.getElementById('dashBankDiff').className = `card-diff ${bdType}`;

      // Cash
      document.getElementById('dashCashTotal').textContent = DB.formatCurrency(stats.cashTotal);
      const cd = stats.diffs.cash;
      const cdType = cd > 0 ? 'profit' : cd < 0 ? 'loss' : 'neutral';
      document.getElementById('dashCashDiff').textContent = `${cdType === 'profit' ? '▲' : cdType === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(cd))}`;
      document.getElementById('dashCashDiff').className = `card-diff ${cdType}`;

      // Capital
      document.getElementById('dashCapitalTotal').textContent = DB.formatCurrency(stats.totalCapital);
      document.getElementById('dashCapitalDiff').textContent = `${overallType === 'profit' ? '▲' : overallType === 'loss' ? '▼' : '➖'} ${DB.formatCurrency(Math.abs(overallDiff))}`;
      document.getElementById('dashCapitalDiff').className = `card-diff ${overallType}`;

      // Render All Shops Cards
      this.renderAllShopsGrid(stats.shopSummaries);

      // Render recent updates across all shops
      this.renderRecentUpdates(null);
    } else {
      document.getElementById('overallValue').textContent = 'Rs.0.00';
      document.getElementById('overallValue').className = 'overall-value neutral';
      document.getElementById('overallType').textContent = 'NO DATA';
      document.getElementById('overallType').style.color = 'var(--text-muted)';
      document.getElementById('overallCard').className = 'card overall-card neutral-card';
      document.getElementById('overallTotalCapital').textContent = 'Rs.0.00';
      document.getElementById('dashReloadTotal').textContent = 'Rs.0.00';
      document.getElementById('dashReloadDiff').textContent = '➖ Rs.0.00';
      document.getElementById('dashBankTotal').textContent = 'Rs.0.00';
      document.getElementById('dashBankDiff').textContent = '➖ Rs.0.00';
      document.getElementById('dashCashTotal').textContent = 'Rs.0.00';
      document.getElementById('dashCashDiff').textContent = '➖ Rs.0.00';
      document.getElementById('dashCapitalTotal').textContent = 'Rs.0.00';
      document.getElementById('dashCapitalDiff').textContent = '➖ Rs.0.00';

      const grid = document.getElementById('dashAllShopsGrid');
      if (grid) {
        grid.innerHTML = '<div class="empty-state" style="padding:30px; grid-column:1/-1;"><div class="empty-icon">🏪</div><div class="empty-text">සාප්පු එකතු කර නැත</div><div class="empty-sub">පළමුව සාප්පුවක් එකතු කරන්න</div></div>';
      }
      document.getElementById('dashRecentUpdates').innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-icon">📭</div><div class="empty-text">Updates නැහැ</div><div class="empty-sub">පළමු update එක ගන්න ➕ බොත්තම ඔබන්න</div></div>';
    }
  },

  renderAllShopsGrid(shopSummaries) {
    const container = document.getElementById('dashAllShopsGrid');
    if (!container) return;

    if (!shopSummaries || shopSummaries.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:20px;grid-column:1/-1;"><div class="empty-sub">සාප්පු කිසිවක් නැත</div></div>';
      return;
    }

    let html = '';
    shopSummaries.forEach(s => {
      const shop = s.shop;
      const last = s.lastUpdate;
      const diff = s.diffs.overall;
      const type = diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'neutral';
      const color = type === 'profit' ? 'var(--accent-green)' : type === 'loss' ? 'var(--accent-red)' : 'var(--text-muted)';

      html += `
        <div class="card" style="padding:18px; border-radius:var(--radius-md); border:1px solid var(--border-glass); background:var(--bg-glass); display:flex; flex-direction:column; justify-content:space-between; transition:transform 0.2s, box-shadow 0.2s;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
              <div>
                <div style="font-size:1.15rem; font-weight:800; color:var(--text-primary);">🏪 ${shop.name}</div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                  ${last ? `📅 Last: ${DB.formatDateTime(last.timestamp)}` : 'දත්ත නොමැත'}
                </div>
              </div>
              <span class="badge ${type}" style="padding:4px 10px; font-size:0.8rem; font-weight:700; border-radius:12px; background:rgba(${type === 'profit' ? '16,185,129' : type === 'loss' ? '239,68,68' : '100,116,139'}, 0.15); color:${color};">
                ${last && last.comparison && !last.comparison.isFirst ? `${diff >= 0 ? '+' : ''}${DB.formatCurrency(diff)}` : 'First Update'}
              </span>
            </div>

            <!-- 3 Balances Mini Grid -->
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin:14px 0; background:rgba(0,0,0,0.03); padding:10px; border-radius:var(--radius-sm);">
              <div style="text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:600;">🔄 Reload</div>
                <div style="font-weight:700; font-size:0.95rem; color:var(--accent-blue);">${DB.formatCurrency(s.reloadTotal)}</div>
              </div>
              <div style="text-align:center; border-left:1px solid var(--border-glass); border-right:1px solid var(--border-glass);">
                <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:600;">🏦 Bank</div>
                <div style="font-weight:700; font-size:0.95rem; color:var(--accent-purple);">${DB.formatCurrency(s.bankTotal)}</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:600;">💵 Cash</div>
                <div style="font-weight:700; font-size:0.95rem; color:var(--accent-gold);">${DB.formatCurrency(s.cashInDrawer)}</div>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-top:6px; border-top:1px solid var(--border-glass);">
              <span style="font-size:0.9rem; font-weight:700; color:var(--text-secondary);">මුළු ප්‍රාග්ධනය (Total):</span>
              <span style="font-size:1.15rem; font-weight:900; color:var(--text-primary);">${DB.formatCurrency(s.totalCapital)}</span>
            </div>
          </div>

          <button class="btn btn-primary btn-sm" style="width:100%; font-weight:700; margin-top:8px;" onclick="App.selectShopAndOpen('${shop.id}')">
            👉 ${shop.name} බලන්න (Open Shop)
          </button>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  selectShopAndOpen(shopId) {
    DB.setActiveShop(shopId);
    this.refreshShopSelector();
    this.renderDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  renderRecentUpdates(shopId) {
    let updates = shopId ? DB.getUpdatesForShop(shopId) : DB.getUpdates(false);
    updates = updates.slice(0, 10);
    const container = document.getElementById('dashRecentUpdates');

    if (updates.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-icon">📭</div><div class="empty-text">Updates නැහැ</div></div>';
      return;
    }

    let html = '<div class="update-list">';
    updates.forEach(u => {
      const vals = DB.extractValues(u);
      const comp = u.comparison;
      const shop = DB.getShop(u.shopId);

      let diffBadges = '';
      if (comp && !comp.isFirst) {
        const rDiff = comp.reload?.diff ?? comp.sim?.diff ?? 0;
        const bDiff = comp.bank?.diff ?? comp.mobileRental?.diff ?? 0;
        const cDiff = comp.cash?.diff ?? 0;
        const oDiff = comp.overall?.diff ?? 0;
        const oType = comp.overall?.type ?? 'neutral';

        diffBadges = `
          <div class="update-diff" style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
            <span class="update-diff-badge ${rDiff >= 0 ? 'profit' : 'loss'}">🔄 Reload: ${rDiff >= 0 ? '+' : ''}${DB.formatCurrency(rDiff)}</span>
            <span class="update-diff-badge ${bDiff >= 0 ? 'profit' : 'loss'}">🏦 Bank: ${bDiff >= 0 ? '+' : ''}${DB.formatCurrency(bDiff)}</span>
            <span class="update-diff-badge ${cDiff >= 0 ? 'profit' : 'loss'}">💵 Cash: ${cDiff >= 0 ? '+' : ''}${DB.formatCurrency(cDiff)}</span>
            <span class="update-diff-badge ${oType}" style="font-weight:800;">💰 ${oType === 'profit' ? 'PROFIT' : oType === 'loss' ? 'LOSS' : '='}: ${oDiff >= 0 ? '+' : ''}${DB.formatCurrency(oDiff)}</span>
          </div>`;
      } else {
        diffBadges = '<div class="update-diff" style="margin-top:6px;"><span class="update-diff-badge neutral">📌 First Update (පළමු Update)</span></div>';
      }

      html += `
        <div class="update-item" onclick="App.showUpdateDetail('${u.id}')" style="cursor:pointer;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <div>
              <span class="update-time">📅 ${DB.formatDateTime(u.timestamp)}</span>
              ${!shopId && shop ? `<span class="badge" style="margin-left:8px; background:rgba(59,130,246,0.15); color:var(--accent-blue); padding:2px 8px; border-radius:10px; font-size:0.75rem; font-weight:700;">🏪 ${shop.name}</span>` : ''}
              ${u.empName ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">🧑‍💼 ${u.empName} ${u.jobRole ? `(${u.jobRole})` : ''}</div>` : ''}
            </div>
            <div style="font-size:1.1rem; font-weight:900; color:var(--accent-blue); text-align:right;">
              ${DB.formatCurrency(vals.totalCapital)}
            </div>
          </div>
          <div class="update-totals">
            <div class="update-total-item">
              <span class="update-total-label">🔄 Reload Total</span>
              <span class="update-total-value">${DB.formatCurrency(vals.reloadTotal)}</span>
            </div>
            <div class="update-total-item">
              <span class="update-total-label">🏦 Bank Total</span>
              <span class="update-total-value">${DB.formatCurrency(vals.bankTotal)}</span>
            </div>
            <div class="update-total-item">
              <span class="update-total-label">💵 Cash Drawer</span>
              <span class="update-total-value">${DB.formatCurrency(vals.totalCash)}</span>
            </div>
          </div>
          ${diffBadges}
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  },

  // ================================================================
  // UPDATE FORM (2-TRACK SYSTEM)
  // ================================================================
  setupUpdateForm() {
    // Inputs in Section 1 (Individual SIMs + Reload Cash)
    const simInputs = ['simDialog', 'simMobitel', 'simAirtel', 'simHutch', 'simEzcash', 'reloadCashInput'];
    simInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.calculateLiveBalances());
      }
    });

    // Add Bank Row Button
    const addBankBtn = document.getElementById('addBankRowBtn');
    if (addBankBtn) {
      addBankBtn.addEventListener('click', () => {
        this.addBankRow();
      });
    }

    // Form submit
    const updateForm = document.getElementById('updateForm');
    if (updateForm) {
      updateForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitUpdate();
      });
    }

    // Clear button
    const clearBtn = document.getElementById('clearFormBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        updateForm.reset();
        this.editingUpdateId = null;
        const btn = updateForm.querySelector('button[type="submit"]');
        if (btn) btn.innerHTML = '💾 Save Update';
        const bankContainer = document.getElementById('bankRowsContainer');
        if (bankContainer) bankContainer.innerHTML = '';
        this.addBankRow();
        this.calculateLiveBalances();
      });
    }
  },

  addBankRow(data = {}) {
    const container = document.getElementById('bankRowsContainer');
    if (!container) return;

    this.bankCounter++;
    const rowId = 'bankRow_' + this.bankCounter;
    const row = document.createElement('div');
    row.className = 'bank-row';
    row.id = rowId;

    const banksList = [
      'BOC',
      'Commercial Bank',
      "People's Bank",
      'HNB',
      'Sampath Bank',
      'NTB',
      'Seylan Bank',
      'Pan Asia Bank',
      'NDB',
      'DFCC Bank',
      'Other Bank'
    ];

    const currentBank = data.bank || 'Commercial Bank';
    let optionsHtml = '';
    banksList.forEach(b => {
      optionsHtml += `<option value="${b}" ${b.toLowerCase() === currentBank.toLowerCase() ? 'selected' : ''}>${b}</option>`;
    });
    if (data.bank && !banksList.some(b => b.toLowerCase() === data.bank.toLowerCase())) {
      optionsHtml += `<option value="${data.bank}" selected>${data.bank}</option>`;
    }

    const acctVal = (data.accountAmount !== undefined && data.accountAmount !== null && data.accountAmount !== '') ? data.accountAmount : '';
    const cashVal = (data.cashInDrawer !== undefined && data.cashInDrawer !== null && data.cashInDrawer !== '') ? data.cashInDrawer : '';
    const initialTotal = (parseFloat(acctVal) || 0) + (parseFloat(cashVal) || 0);

    row.innerHTML = `
      <div>
        <label class="form-label" style="font-size:0.75rem;">🏛️ ${I18N.t('upd_bank_acct_lbl') || 'Bank Name'}</label>
        <select class="form-select bank-select">
          ${optionsHtml}
        </select>
      </div>
      <div>
        <label class="form-label" style="font-size:0.75rem;">💳 ${I18N.t('upd_bank_acct_lbl') || 'Account Amount'}</label>
        <input type="number" class="form-input balance-input bank-acct-input" placeholder="0.00" step="0.01" min="0" value="${acctVal}">
      </div>
      <div>
        <label class="form-label" style="font-size:0.75rem; color:var(--accent-gold);">💵 ${I18N.t('upd_bank_cash_lbl') || 'Bank Cash in Drawer'}</label>
        <input type="number" class="form-input balance-input bank-cash-input" placeholder="0.00" step="0.01" min="0" value="${cashVal}">
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end;">
        <label class="form-label" style="font-size:0.72rem; color:var(--text-muted);">Row Total</label>
        <div class="bank-row-total">${DB.formatCurrency(initialTotal)}</div>
      </div>
      <div style="display:flex; align-items:flex-end;">
        <button type="button" class="bank-row-remove" title="Remove Bank Account" onclick="App.removeBankRow('${rowId}')">🗑️</button>
      </div>
    `;

    container.appendChild(row);

    const acctInput = row.querySelector('.bank-acct-input');
    const cashInput = row.querySelector('.bank-cash-input');
    const select = row.querySelector('.bank-select');

    const updateRow = () => {
      const a = parseFloat(acctInput.value) || 0;
      const c = parseFloat(cashInput.value) || 0;
      row.querySelector('.bank-row-total').textContent = DB.formatCurrency(a + c);
      this.calculateLiveBalances();
    };

    acctInput.addEventListener('input', updateRow);
    cashInput.addEventListener('input', updateRow);
    select.addEventListener('change', () => this.calculateLiveBalances());

    this.calculateLiveBalances();
  },

  removeBankRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
      row.remove();
    }
    const container = document.getElementById('bankRowsContainer');
    if (container && container.children.length === 0) {
      this.addBankRow();
    }
    this.calculateLiveBalances();
  },

  renderUpdateForm() {
    const shopId = DB.getActiveShopId();
    if (!shopId) return;

    const prevUpdate = DB.getLastUpdate(shopId);

    // Show previous update info & hints
    if (prevUpdate) {
      const prevVals = DB.extractValues(prevUpdate);
      const prevInfo = document.getElementById('prevUpdateInfo');
      if (prevInfo) prevInfo.style.display = 'block';
      const prevTime = document.getElementById('prevUpdateTime');
      if (prevTime) prevTime.textContent = DB.formatDateTime(prevUpdate.timestamp);

      const prevSummary = document.getElementById('prevUpdateSummary');
      if (prevSummary) {
        prevSummary.innerHTML = `
          <div class="result-item"><div class="result-label">🔄 Reload Total</div><div class="result-value" style="color:var(--accent-blue);">${DB.formatCurrency(prevVals.reloadTotal)}</div></div>
          <div class="result-item"><div class="result-label">🏦 Bank Total</div><div class="result-value" style="color:var(--accent-purple);">${DB.formatCurrency(prevVals.bankTotal)}</div></div>
          <div class="result-item"><div class="result-label">💵 Cash Drawer</div><div class="result-value" style="color:var(--accent-gold);">${DB.formatCurrency(prevVals.totalCash)}</div></div>
          <div class="result-item"><div class="result-label">💰 Grand Total Capital</div><div class="result-value" style="font-weight:800; color:var(--accent-green);">${DB.formatCurrency(prevVals.totalCapital)}</div></div>
        `;
      }

      // Hints under Section 1 inputs
      const setHint = (id, label, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `${label}: ${DB.formatCurrency(val)}`;
      };
      setHint('prevDialogHint', 'Prev', prevVals.dialog);
      setHint('prevMobitelHint', 'Prev', prevVals.mobitel);
      setHint('prevAirtelHint', 'Prev', prevVals.airtel);
      setHint('prevHutchHint', 'Prev', prevVals.hutch);
      setHint('prevEzcashHint', 'Prev', prevVals.ezcash);
      setHint('prevReloadCashHint', 'Prev Cash', prevVals.reloadCash);
    } else {
      const prevInfo = document.getElementById('prevUpdateInfo');
      if (prevInfo) prevInfo.style.display = 'none';
      ['prevDialogHint', 'prevMobitelHint', 'prevAirtelHint', 'prevHutchHint', 'prevEzcashHint', 'prevReloadCashHint'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
      });
    }

    // If bankRowsContainer is empty and not editing, add 1 initial bank row
    const container = document.getElementById('bankRowsContainer');
    if (container && container.children.length === 0 && !this.editingUpdateId) {
      this.addBankRow();
    }

    this.calculateLiveBalances();
  },

  calculateLiveBalances() {
    // 1. Reload Track
    const dialog = parseFloat(document.getElementById('simDialog')?.value) || 0;
    const mobitel = parseFloat(document.getElementById('simMobitel')?.value) || 0;
    const airtel = parseFloat(document.getElementById('simAirtel')?.value) || 0;
    const hutch = parseFloat(document.getElementById('simHutch')?.value) || 0;
    const ezcash = parseFloat(document.getElementById('simEzcash')?.value) || 0;
    const reloadCash = parseFloat(document.getElementById('reloadCashInput')?.value) || 0;

    const reloadSimTotal = dialog + mobitel + airtel + hutch + ezcash;
    const reloadTotal = reloadSimTotal + reloadCash;

    const liveReloadTotalEl = document.getElementById('liveReloadTotal');
    if (liveReloadTotalEl) liveReloadTotalEl.textContent = DB.formatCurrency(reloadTotal);

    // 2. Bank Track
    let totalBankAcct = 0;
    let totalBankCash = 0;
    let bankGrandTotal = 0;

    const bankRows = document.querySelectorAll('#bankRowsContainer .bank-row');
    bankRows.forEach(row => {
      const a = parseFloat(row.querySelector('.bank-acct-input')?.value) || 0;
      const c = parseFloat(row.querySelector('.bank-cash-input')?.value) || 0;
      totalBankAcct += a;
      totalBankCash += c;
      const rowTotal = a + c;
      const rowTotalEl = row.querySelector('.bank-row-total');
      if (rowTotalEl) rowTotalEl.textContent = DB.formatCurrency(rowTotal);
      bankGrandTotal += rowTotal;
    });

    const liveBankTotalEl = document.getElementById('liveBankTotal');
    if (liveBankTotalEl) liveBankTotalEl.textContent = DB.formatCurrency(bankGrandTotal);

    // 3. Grand Total Capital
    const grandTotal = reloadTotal + bankGrandTotal;
    const totalCapitalEl = document.getElementById('updateTotalCapital');
    if (totalCapitalEl) totalCapitalEl.textContent = DB.formatCurrency(grandTotal);

    // Diffs vs Previous Update
    const shopId = DB.getActiveShopId();
    const prevUpdate = shopId ? DB.getLastUpdate(shopId) : null;
    const reloadDiffBadge = document.getElementById('liveReloadDiffBadge');
    const bankDiffBadge = document.getElementById('liveBankDiffBadge');
    const overallDiffBadge = document.getElementById('updateOverallDiffBadge');
    const container = document.getElementById('overallSummaryPreview');

    if (!prevUpdate) {
      if (reloadDiffBadge) reloadDiffBadge.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">First Update</span>';
      if (bankDiffBadge) bankDiffBadge.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">First Update</span>';
      if (overallDiffBadge) overallDiffBadge.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">First Update</span>';
      if (container) container.style.display = 'none';
      return;
    }

    const prevVals = DB.extractValues(prevUpdate);
    const reloadDiff = reloadTotal - prevVals.reloadTotal;
    const bankDiff = bankGrandTotal - prevVals.bankTotal;
    const overallDiff = grandTotal - prevVals.totalCapital;

    const formatBadge = (diff) => {
      const type = diff > 0 ? 'profit' : diff < 0 ? 'loss' : 'neutral';
      const icon = diff > 0 ? '▲' : diff < 0 ? '▼' : '➖';
      const color = type === 'profit' ? 'var(--accent-green)' : type === 'loss' ? 'var(--accent-red)' : 'var(--text-muted)';
      return `<span style="font-size:0.82rem; font-weight:700; color:${color};">${icon} ${diff >= 0 ? '+' : ''}${DB.formatCurrency(diff)}</span>`;
    };

    if (reloadDiffBadge) reloadDiffBadge.innerHTML = formatBadge(reloadDiff);
    if (bankDiffBadge) bankDiffBadge.innerHTML = formatBadge(bankDiff);
    if (overallDiffBadge) overallDiffBadge.innerHTML = formatBadge(overallDiff);

    const overallType = overallDiff > 0 ? 'profit' : overallDiff < 0 ? 'loss' : 'neutral';
    const overallColor = overallType === 'profit' ? 'var(--accent-green)' : overallType === 'loss' ? 'var(--accent-red)' : 'var(--text-muted)';

    if (container) {
      container.style.display = 'block';
      container.innerHTML = `
        <div style="padding:18px 20px; background:${overallType === 'profit' ? 'rgba(16,185,129,0.08)' : overallType === 'loss' ? 'rgba(239,68,68,0.08)' : 'rgba(100,116,139,0.08)'}; border:2px solid ${overallType === 'profit' ? 'rgba(16,185,129,0.2)' : overallType === 'loss' ? 'rgba(239,68,68,0.2)' : 'rgba(100,116,139,0.2)'}; border-radius:var(--radius-lg);">
          <div style="text-align:center;">
            <div style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">
              ${I18N.t('comp_diff') || 'Difference vs Previous Update'}
            </div>
            <div style="font-size:2.2rem;font-weight:900;color:${overallColor};">
              ${overallDiff >= 0 ? '+' : ''}${DB.formatCurrency(overallDiff)}
            </div>
            <div style="font-size:1rem;font-weight:700;color:${overallColor};margin-top:2px;">
              ${overallType === 'profit' ? '✅ PROFIT (ලාභ)' : overallType === 'loss' ? '❌ LOSS (අලාභ)' : '➖ NO CHANGE'}
            </div>
            <div style="margin-top:14px; display:flex; justify-content:center; gap:20px; flex-wrap:wrap;">
              <span style="font-size:0.88rem; font-weight:700; color:${reloadDiff >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
                🔄 Reload Track: ${reloadDiff >= 0 ? '+' : ''}${DB.formatCurrency(reloadDiff)}
              </span>
              <span style="font-size:0.88rem; font-weight:700; color:${bankDiff >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
                🏦 Bank Track: ${bankDiff >= 0 ? '+' : ''}${DB.formatCurrency(bankDiff)}
              </span>
            </div>
          </div>
        </div>
      `;
    }
  },

  submitUpdate() {
    const shopId = DB.getActiveShopId();
    if (!shopId) {
      this.showToast('Please select a shop first (කරුණාකර සාප්පුවක් තෝරන්න)', 'error');
      return;
    }

    const empName = document.getElementById('empName').value.trim();
    const jobRole = document.getElementById('jobRole').value.trim();

    if (!empName) {
      this.showToast('Please enter Employee Name (සේවකයාගේ නම ඇතුළත් කරන්න)', 'error');
      return;
    }

    // Section 1: Reload inputs
    const dialog = parseFloat(document.getElementById('simDialog')?.value) || 0;
    const mobitel = parseFloat(document.getElementById('simMobitel')?.value) || 0;
    const airtel = parseFloat(document.getElementById('simAirtel')?.value) || 0;
    const hutch = parseFloat(document.getElementById('simHutch')?.value) || 0;
    const ezcash = parseFloat(document.getElementById('simEzcash')?.value) || 0;
    const reloadCash = parseFloat(document.getElementById('reloadCashInput')?.value) || 0;

    // Section 2: Bank inputs
    const bankRows = document.querySelectorAll('#bankRowsContainer .bank-row');
    const banks = [];
    bankRows.forEach(row => {
      const bank = row.querySelector('.bank-select')?.value || 'Commercial Bank';
      const accountAmount = parseFloat(row.querySelector('.bank-acct-input')?.value) || 0;
      const cashInDrawer = parseFloat(row.querySelector('.bank-cash-input')?.value) || 0;
      if (accountAmount > 0 || cashInDrawer > 0 || bankRows.length === 1) {
        banks.push({ bank, accountAmount, cashInDrawer });
      }
    });

    const hasReloadData = (dialog + mobitel + airtel + hutch + ezcash + reloadCash) > 0;
    const hasBankData = banks.some(b => (b.accountAmount + b.cashInDrawer) > 0);

    if (!hasReloadData && !hasBankData) {
      this.showToast('Please enter at least one balance amount (අවම වශයෙන් එක් අගයක් හෝ ඇතුළත් කරන්න)', 'error');
      return;
    }

    const updatePayload = {
      shopId,
      empName,
      jobRole,
      reload: {
        dialog,
        mobitel,
        airtel,
        hutch,
        ezcash,
        cashInDrawer: reloadCash
      },
      mobileRental: {
        banks
      }
    };

    let update;
    if (this.editingUpdateId) {
      update = DB.editUpdate(this.editingUpdateId, updatePayload);
      this.editingUpdateId = null;
      const btn = document.querySelector('#updateForm button[type="submit"]');
      if (btn) btn.innerHTML = '💾 Save Update';
      this.showToast('✅ Update successfully saved! (යාවත්කාලීන කරා)', 'success');
    } else {
      update = DB.addUpdate(updatePayload);
    }

    // Modal result
    const comp = update.comparison;
    if (comp && !comp.isFirst) {
      const type = comp.overall.type;
      const diff = comp.overall.diff;
      const rDiff = comp.reload?.diff ?? 0;
      const bDiff = comp.bank?.diff ?? 0;

      this.showModal(
        `${type === 'profit' ? '✅' : type === 'loss' ? '❌' : '➖'} Update Saved`,
        `
        <div style="text-align:center; padding:16px 0;">
          <div style="font-size:2.2rem; font-weight:900; color:var(--accent-${type === 'profit' ? 'green' : type === 'loss' ? 'red' : 'text-muted'});">
            ${diff >= 0 ? '+' : ''}${DB.formatCurrency(diff)}
          </div>
          <div style="font-size:1.1rem; font-weight:700; margin-top:4px; color:var(--accent-${type === 'profit' ? 'green' : type === 'loss' ? 'red' : 'text-muted'});">
            ${type === 'profit' ? 'PROFIT (ලාභ) ✅' : type === 'loss' ? 'LOSS (අලාභ) ❌' : 'NO CHANGE ➖'}
          </div>
          <div style="margin-top:20px; display:grid; grid-template-columns:1fr 1fr; gap:14px; background:var(--bg-glass); padding:14px; border-radius:var(--radius-sm);">
            <div>
              <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">🔄 Reload Track</div>
              <div style="font-size:1.1rem; font-weight:800; color:var(--accent-${rDiff >= 0 ? 'green' : 'red'});">
                ${rDiff >= 0 ? '+' : ''}${DB.formatCurrency(rDiff)}
              </div>
            </div>
            <div>
              <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">🏦 Bank Track</div>
              <div style="font-size:1.1rem; font-weight:800; color:var(--accent-${bDiff >= 0 ? 'green' : 'red'});">
                ${bDiff >= 0 ? '+' : ''}${DB.formatCurrency(bDiff)}
              </div>
            </div>
          </div>
        </div>
        `,
        [{ text: 'OK (හරි 👍)', class: 'btn-success', onClick: () => this.closeModal() }]
      );
    } else {
      this.showToast('✅ First Update recorded! (පළමු Update සටහන් කරා)', 'success');
    }

    // Reset Form
    document.getElementById('updateForm').reset();
    const bankContainer = document.getElementById('bankRowsContainer');
    if (bankContainer) bankContainer.innerHTML = '';
    this.addBankRow();
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

      const vals = DB.extractValues(u);
      const comp = u.comparison;

      let diffBadges = '';
      if (comp && !comp.isFirst) {
        const rDiff = comp.reload?.diff ?? comp.sim?.diff ?? 0;
        const bDiff = comp.bank?.diff ?? comp.mobileRental?.diff ?? 0;
        const cDiff = comp.cash?.diff ?? 0;
        const oDiff = comp.overall?.diff ?? 0;
        const oType = comp.overall?.type ?? 'neutral';

        diffBadges = `
          <div class="update-diff" style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
            <span class="update-diff-badge ${rDiff >= 0 ? 'profit' : 'loss'}">🔄 Reload: ${rDiff >= 0 ? '+' : ''}${DB.formatCurrency(rDiff)}</span>
            <span class="update-diff-badge ${bDiff >= 0 ? 'profit' : 'loss'}">🏦 Bank: ${bDiff >= 0 ? '+' : ''}${DB.formatCurrency(bDiff)}</span>
            <span class="update-diff-badge ${cDiff >= 0 ? 'profit' : 'loss'}">💵 Cash: ${cDiff >= 0 ? '+' : ''}${DB.formatCurrency(cDiff)}</span>
            <span class="update-diff-badge ${oType}" style="font-weight:800;">💰 ${oType === 'profit' ? 'PROFIT' : oType === 'loss' ? 'LOSS' : '='}: ${oDiff >= 0 ? '+' : ''}${DB.formatCurrency(oDiff)}</span>
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
              <span class="update-total-value">${DB.formatCurrency(vals.reloadTotal)}</span>
            </div>
            <div class="update-total-item">
              <span class="update-total-label">🏦 Bank</span>
              <span class="update-total-value">${DB.formatCurrency(vals.bankTotal)}</span>
            </div>
            <div class="update-total-item">
              <span class="update-total-label">💵 Cash</span>
              <span class="update-total-value">${DB.formatCurrency(vals.totalCash)}</span>
            </div>
            <div class="update-total-item">
              <span class="update-total-label">💰 Total</span>
              <span class="update-total-value" style="color:var(--accent-green); font-weight:800;">${DB.formatCurrency(vals.totalCapital)}</span>
            </div>
          </div>
          ${diffBadges}
        </div>`;
    });

    html += '</div>';
    container.innerHTML = html;
  },

  showUpdateDetail(updateId) {
    const updates = DB.getUpdates(true);
    const u = updates.find(x => x.id === updateId);
    if (!u) return;

    const vals = DB.extractValues(u);
    const comp = u.comparison;

    let compSummary = '';
    if (comp && !comp.isFirst) {
      const type = comp.overall.type;
      const color = type === 'profit' ? 'var(--accent-green)' : type === 'loss' ? 'var(--accent-red)' : 'var(--text-muted)';
      compSummary = `
        <div style="text-align:center;padding:16px;background:${type === 'profit' ? 'rgba(16,185,129,0.08)' : type === 'loss' ? 'rgba(239,68,68,0.08)' : 'rgba(100,116,139,0.08)'};border-radius:var(--radius-md);margin-top:16px;">
          <div style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;">Vs Previous Update</div>
          <div style="font-size:1.8rem;font-weight:900;color:${color};">
            ${comp.overall.diff >= 0 ? '+' : ''}${DB.formatCurrency(comp.overall.diff)}
          </div>
          <div style="font-weight:700;color:${color};">
            ${type === 'profit' ? '✅ PROFIT (ලාභ)' : type === 'loss' ? '❌ LOSS (අලාභ)' : '➖ NO CHANGE'}
          </div>
          <div style="margin-top:10px; display:flex; justify-content:center; gap:16px; font-size:0.85rem; font-weight:700;">
            <span style="color:var(--accent-${comp.reload.diff >= 0 ? 'green' : 'red'});">
              🔄 Reload: ${comp.reload.diff >= 0 ? '+' : ''}${DB.formatCurrency(comp.reload.diff)}
            </span>
            <span style="color:var(--accent-${comp.bank.diff >= 0 ? 'green' : 'red'});">
              🏦 Bank: ${comp.bank.diff >= 0 ? '+' : ''}${DB.formatCurrency(comp.bank.diff)}
            </span>
          </div>
        </div>`;
    }

    // Section 1 SIMs Breakdown list
    let simBreakdown = '';
    const sims = [
      { name: 'Dialog', val: vals.dialog },
      { name: 'Mobitel', val: vals.mobitel },
      { name: 'Airtel', val: vals.airtel },
      { name: 'Hutch', val: vals.hutch },
      { name: 'eZ Cash', val: vals.ezcash },
      { name: 'Reload Cash', val: vals.reloadCash }
    ].filter(s => s.val > 0);

    if (sims.length > 0) {
      simBreakdown = `
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; font-size:0.8rem;">
          ${sims.map(s => `<span class="date-pill" style="font-size:0.75rem;">${s.name}: ${DB.formatCurrency(s.val)}</span>`).join('')}
        </div>
      `;
    }

    // Section 2 Bank Breakdown list
    let bankBreakdown = '';
    if (vals.banks && vals.banks.length > 0) {
      bankBreakdown = `
        <div style="display:flex; flex-direction:column; gap:4px; margin-top:6px; font-size:0.8rem;">
          ${vals.banks.map(b => `
            <div style="display:flex; justify-content:space-between; padding:4px 8px; background:rgba(0,0,0,0.02); border-radius:4px;">
              <span>🏛️ <strong>${b.bank}</strong> (Acct: ${DB.formatCurrency(b.accountAmount)}, Cash: ${DB.formatCurrency(b.cashInDrawer)})</span>
              <strong style="color:var(--accent-purple);">${DB.formatCurrency(b.total)}</strong>
            </div>
          `).join('')}
        </div>
      `;
    }

    this.showModal(
      `📌 Update Details - ${DB.formatTime(u.timestamp)}`,
      `
      <div style="margin-bottom:14px;">
        <div style="font-size:0.82rem;color:var(--text-muted);">📅 ${DB.formatDate(u.date)} | 🕐 ${DB.formatTime(u.timestamp)}</div>
        ${u.empName ? `<div style="font-size:0.85rem; font-weight:600; margin-top:4px;">🧑‍💼 ${u.empName} ${u.jobRole ? `(${u.jobRole})` : ''}</div>` : ''}
      </div>

      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
        <!-- Reload Track -->
        <div style="padding:10px 14px; background:var(--bg-glass); border-radius:var(--radius-sm); border-left:3px solid var(--accent-blue);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700;">🔄 Reload Track Total</span>
            <span style="font-weight:800; color:var(--accent-blue); font-size:1.05rem;">${DB.formatCurrency(vals.reloadTotal)}</span>
          </div>
          ${simBreakdown}
        </div>

        <!-- Bank Track -->
        <div style="padding:10px 14px; background:var(--bg-glass); border-radius:var(--radius-sm); border-left:3px solid var(--accent-purple);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700;">🏦 Bank Track Total</span>
            <span style="font-weight:800; color:var(--accent-purple); font-size:1.05rem;">${DB.formatCurrency(vals.bankTotal)}</span>
          </div>
          ${bankBreakdown}
        </div>

        <!-- Drawer Cash Total -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-glass); border-radius:var(--radius-sm); border-left:3px solid var(--accent-gold);">
          <span style="font-weight:700;">💵 Total Cash in Drawer</span>
          <span style="font-weight:800; color:var(--accent-gold); font-size:1.05rem;">${DB.formatCurrency(vals.totalCash)}</span>
        </div>
      </div>

      <div style="font-weight:800;font-size:1.15rem;padding-top:12px;border-top:1px solid var(--border-glass);display:flex;justify-content:space-between;">
        <span>💰 Grand Total Capital:</span>
        <span style="color:var(--accent-green); font-size:1.25rem;">${DB.formatCurrency(vals.totalCapital)}</span>
      </div>

      ${compSummary}
      `,
      [
        { text: 'Close (වසන්න)', class: 'btn-ghost', onClick: () => this.closeModal() },
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

    const vals = DB.extractValues(update);

    document.getElementById('empName').value = update.empName || '';
    document.getElementById('jobRole').value = update.jobRole || '';

    // Section 1: SIMs
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = (val > 0) ? val : '';
    };
    setVal('simDialog', vals.dialog);
    setVal('simMobitel', vals.mobitel);
    setVal('simAirtel', vals.airtel);
    setVal('simHutch', vals.hutch);
    setVal('simEzcash', vals.ezcash);
    setVal('reloadCashInput', vals.reloadCash);

    // Section 2: Bank rows
    const container = document.getElementById('bankRowsContainer');
    if (container) container.innerHTML = '';

    if (vals.banks && vals.banks.length > 0) {
      vals.banks.forEach(b => this.addBankRow(b));
    } else {
      this.addBankRow({ bank: 'Commercial Bank', accountAmount: vals.bankTotal, cashInDrawer: 0 });
    }

    // Button label
    const btn = document.querySelector('#updateForm button[type="submit"]');
    if (btn) btn.innerHTML = '✏️ Update Data (වෙනස් කරන්න)';

    this.calculateLiveBalances();
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
    document.getElementById('recoverShopBtn').addEventListener('click', () => this.showRecoverShopsModal());
  },

  showRecoverShopsModal() {
    const deletedShops = DB.getShops(true).filter(s => s.deleted);
    
    if (deletedShops.length === 0) {
      this.showModal('♻️ Recover Shops', '<div style="padding: 20px; text-align: center;">මකාදැමූ සාප්පු කිසිවක් නොමැත. (No deleted shops found)</div>', [{ text: 'හරි (OK)', class: 'btn-primary', onClick: () => this.closeModal() }]);
      return;
    }

    let html = '<div class="shop-list" style="max-height: 60vh; overflow-y: auto;">';
    deletedShops.forEach(shop => {
      const deletedDate = shop.deletedAt ? new Date(shop.deletedAt).toLocaleDateString() : 'Unknown';
      html += `
        <div class="card" style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; padding: 15px;">
          <div>
            <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">${shop.name}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">Deleted: ${deletedDate}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="App.recoverShop('${shop.id}')">♻️ Recover</button>
        </div>
      `;
    });
    html += '</div>';

    this.showModal('♻️ Recover Deleted Shops', html, [{ text: 'වහන්න (Close)', class: 'btn-ghost', onClick: () => this.closeModal() }]);
  },

  recoverShop(shopId) {
    DB.recoverShop(shopId);
    this.showToast('♻️ Shop යලි ලබාගත්තා (Recovered)', 'success');
    this.refreshShopSelector();
    this.renderShops();
    this.renderDashboard();
    
    // Refresh modal if still open and has more deleted shops
    const deletedShops = DB.getShops(true).filter(s => s.deleted);
    if (deletedShops.length > 0) {
      this.showRecoverShopsModal();
    } else {
      this.closeModal();
    }
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
      '🗑️ සාප්පුව මකන්නද? (Admin Password Required)',
      `
        <div class="delete-confirm-text">"<strong>${shopName}</strong>" මකා දැමීමට Admin මුරපදය ලබා දෙන්න.</div>
        <div class="form-group" style="margin-top: 15px;">
          <input type="password" id="adminPasswordInput" class="form-input" placeholder="මුරපදය (Password)" autocomplete="off">
        </div>
      `,
      [
        { text: 'අවලංගු', class: 'btn-ghost', onClick: () => this.closeModal() },
        {
          text: '🗑️ මකන්න', class: 'btn-danger', onClick: () => {
            const pwd = document.getElementById('adminPasswordInput').value;
            if (pwd !== '1234') {
              this.showToast('❌ මුරපදය වැරදියි!', 'error');
              return;
            }
            DB.deleteShop(shopId);
            this.closeModal();
            this.refreshShopSelector();
            this.renderShops();
            this.renderDashboard();
            this.showToast('🗑️ Shop ආරක්ෂිතව මකා දැමුවා (Soft Deleted)', 'success');
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

    // Calculate totals across 2-track system + cash and overall
    let totalProfit = 0;
    let totalLoss = 0;
    let reloadProfit = 0;
    let reloadLoss = 0;
    let bankProfit = 0;
    let bankLoss = 0;
    let cashProfit = 0;
    let cashLoss = 0;

    updates.forEach(u => {
      if (u.comparison && !u.comparison.isFirst) {
        const c = u.comparison;
        if (c.overall.diff > 0) totalProfit += c.overall.diff;
        else totalLoss += Math.abs(c.overall.diff);

        const rDiff = c.reload ? c.reload.diff : (c.sim ? c.sim.diff : 0);
        if (rDiff > 0) reloadProfit += rDiff;
        else reloadLoss += Math.abs(rDiff);

        const bDiff = c.bank ? c.bank.diff : (c.mobileRental ? c.mobileRental.diff : 0);
        if (bDiff > 0) bankProfit += bDiff;
        else bankLoss += Math.abs(bDiff);

        const cDiff = c.cash ? c.cash.diff : 0;
        if (cDiff > 0) cashProfit += cDiff;
        else cashLoss += Math.abs(cDiff);
      }
    });

    const netProfitLoss = totalProfit - totalLoss;
    const netType = netProfitLoss > 0 ? 'profit' : netProfitLoss < 0 ? 'loss' : 'neutral';
    const reloadNet = reloadProfit - reloadLoss;
    const bankNet = bankProfit - bankLoss;
    const cashNet = cashProfit - cashLoss;

    // Get unique dates
    const uniqueDates = [...new Set(updates.map(u => u.date))].sort();

    container.innerHTML = `
      <!-- Overall Summary -->
      <div class="card overall-card ${netType === 'profit' ? 'profit-card' : netType === 'loss' ? 'loss-card' : 'neutral-card'}" style="margin-bottom:20px;">
        <div class="overall-label">📊 ${DB.formatDate(startDate)} - ${DB.formatDate(endDate)}</div>
        <div class="overall-value ${netType}">${netProfitLoss >= 0 ? '+' : ''}${DB.formatCurrency(netProfitLoss)}</div>
        <div class="overall-type" style="color:var(--accent-${netType === 'profit' ? 'green' : netType === 'loss' ? 'red' : 'text-muted'});">
          ${netType === 'profit' ? '✅ ' + (I18N.t('profit') || 'PROFIT') : netType === 'loss' ? '❌ ' + (I18N.t('loss') || 'LOSS') : '➖ ' + (I18N.t('neutral') || 'BREAK EVEN')}
        </div>
      </div>

      <!-- 2-Track + Cash Category Breakdown -->
      <div class="summary-grid" style="grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));">
        <div class="card accent-blue">
          <div class="card-header">
            <span class="card-title">🔄 ${I18N.t('dash_reload_total') || 'Reload Track'}</span>
          </div>
          <div style="display:flex;gap:12px;">
            <div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${I18N.t('profit') || 'Profit'}</div>
              <div style="font-weight:700;color:var(--accent-green);font-size:0.95rem;">+${DB.formatCurrency(reloadProfit)}</div>
            </div>
            <div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${I18N.t('loss') || 'Loss'}</div>
              <div style="font-weight:700;color:var(--accent-red);font-size:0.95rem;">-${DB.formatCurrency(reloadLoss)}</div>
            </div>
            <div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Net</div>
              <div style="font-weight:800;font-size:0.95rem;color:var(--accent-${reloadNet >= 0 ? 'green' : 'red'});">
                ${reloadNet >= 0 ? '+' : ''}${DB.formatCurrency(reloadNet)}
              </div>
            </div>
          </div>
        </div>

        <div class="card accent-purple">
          <div class="card-header">
            <span class="card-title">🏦 ${I18N.t('dash_bank_total') || 'Bank Track'}</span>
          </div>
          <div style="display:flex;gap:12px;">
            <div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${I18N.t('profit') || 'Profit'}</div>
              <div style="font-weight:700;color:var(--accent-green);font-size:0.95rem;">+${DB.formatCurrency(bankProfit)}</div>
            </div>
            <div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${I18N.t('loss') || 'Loss'}</div>
              <div style="font-weight:700;color:var(--accent-red);font-size:0.95rem;">-${DB.formatCurrency(bankLoss)}</div>
            </div>
            <div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Net</div>
              <div style="font-weight:800;font-size:0.95rem;color:var(--accent-${bankNet >= 0 ? 'green' : 'red'});">
                ${bankNet >= 0 ? '+' : ''}${DB.formatCurrency(bankNet)}
              </div>
            </div>
          </div>
        </div>

        <div class="card accent-yellow">
          <div class="card-header">
            <span class="card-title">💵 ${I18N.t('dash_cash_total') || 'Cash Drawer'}</span>
          </div>
          <div style="display:flex;gap:12px;">
            <div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${I18N.t('profit') || 'Profit'}</div>
              <div style="font-weight:700;color:var(--accent-green);font-size:0.95rem;">+${DB.formatCurrency(cashProfit)}</div>
            </div>
            <div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${I18N.t('loss') || 'Loss'}</div>
              <div style="font-weight:700;color:var(--accent-red);font-size:0.95rem;">-${DB.formatCurrency(cashLoss)}</div>
            </div>
            <div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Net</div>
              <div style="font-weight:800;font-size:0.95rem;color:var(--accent-${cashNet >= 0 ? 'green' : 'red'});">
                ${cashNet >= 0 ? '+' : ''}${DB.formatCurrency(cashNet)}
              </div>
            </div>
          </div>
        </div>

        <div class="card accent-green">
          <div class="card-header">
            <span class="card-title">📌 ${I18N.t('stat_total_updates') || 'Summary'}</span>
          </div>
          <div style="display:flex;gap:20px;">
            <div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Updates</div>
              <div style="font-weight:800;font-size:1.3rem;">${updates.length}</div>
            </div>
            <div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Days</div>
              <div style="font-weight:800;font-size:1.3rem;">${uniqueDates.length}</div>
            </div>
          </div>
        </div>
      </div>

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
                <th style="text-align:right;padding:10px;color:var(--text-muted);font-weight:600;">🔄 Reload Total</th>
                <th style="text-align:right;padding:10px;color:var(--text-muted);font-weight:600;">🏦 Bank Total</th>
                <th style="text-align:right;padding:10px;color:var(--text-muted);font-weight:600;">💵 Cash Drawer</th>
                <th style="text-align:right;padding:10px;color:var(--text-muted);font-weight:600;">💰 Total Capital</th>
                <th style="text-align:right;padding:10px;color:var(--text-muted);font-weight:600;">P/L</th>
              </tr>
            </thead>
            <tbody>
              ${uniqueDates.map(date => {
                const dayUpdates = updates.filter(u => u.date === date);
                const lastDayUpdate = dayUpdates[0]; // already sorted newest first
                const vals = DB.extractValues(lastDayUpdate);
                let dayPL = 0;
                dayUpdates.forEach(u => {
                  if (u.comparison && !u.comparison.isFirst) {
                    dayPL += u.comparison.overall.diff;
                  }
                });
                const dayType = dayPL > 0 ? 'profit' : dayPL < 0 ? 'loss' : 'neutral';

                return `
                  <tr style="border-bottom:1px solid var(--border-glass);">
                    <td style="padding:10px;">${DB.formatDate(date)}</td>
                    <td style="padding:10px;text-align:right;">${dayUpdates.length}</td>
                    <td style="padding:10px;text-align:right;font-weight:600;">${DB.formatCurrency(vals.reloadTotal)}</td>
                    <td style="padding:10px;text-align:right;font-weight:600;">${DB.formatCurrency(vals.bankTotal)}</td>
                    <td style="padding:10px;text-align:right;font-weight:600;">${DB.formatCurrency(vals.totalCash)}</td>
                    <td style="padding:10px;text-align:right;font-weight:700;color:var(--accent-green);">${DB.formatCurrency(vals.totalCapital)}</td>
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
    const chartCanvas = document.getElementById('reportChart');
    if (chartCanvas && window.Chart) {
      const ctx = chartCanvas.getContext('2d');
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
    }
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

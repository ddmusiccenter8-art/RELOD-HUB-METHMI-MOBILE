// ============================================
// Shop Payment Tracker - i18n Localization
// ============================================

const I18N = {
  currentLang: localStorage.getItem('spt_lang') || 'en',

  translations: {
    en: {
      // Sidebar
      'app_title': 'Shop Tracker',
      'nav_dashboard': 'Dashboard',
      'nav_update': 'Add Update',
      'nav_history': 'Update History',
      'nav_shops': 'Shops',
      'nav_reports': 'Reports',
      'select_shop': '-- Select Shop --',
      'btn_export': '📤 Data Backup / Export',
      'btn_import': '📥 Data Import / Restore',
      'backup_status': '🛡️ Backup Status',
      'cloud_sync_active': '☁️ Cloud Sync: Active',
      
      // Dashboard
      'dash_title': 'Dashboard',
      'dash_period_summary': 'PROFIT/LOSS SUMMARY',
      'period_today': 'Today',
      'period_week': 'This Week',
      'period_month': 'This Month',
      'period_year': 'This Year',
      'period_all': 'All Time',
      'dash_overall': 'VS PREVIOUS UPDATE',
      'dash_no_data': 'NO DATA',
      'dash_reload_total': '🔄 Reload Total',
      'dash_bank_total': '🏦 Bank Total',
      'dash_cash_total': '💵 Cash in Drawer Total',
      'dash_capital_total': '💰 Grand Total Capital',
      'dash_sim_total': '🔄 Reload Total',
      'dash_reload': '🔄 Reload Total',
      'dash_mobile': '🏦 Bank Total',
      'dash_today_updates': '📌 Today Updates',
      'dash_comparison_title': '📊 Financial Comparison (Vs Previous Update)',
      'dash_all_shops_title': '🏪 All Shops Live Overview',
      'dash_recent_updates': 'Recent Updates',
      'view_shop': 'Open Shop ➔',
      
      // Update Form
      'upd_title': 'Add New Update',
      'upd_emp_details': 'Employee Details',
      'upd_emp_name': 'Employee Name',
      'upd_job_role': 'Job Role (e.g. Cashier)',
      'upd_balances_title': '💰 Today Balances & Cash',
      
      // Section 1: Reload / SIMs
      'upd_reload_sec_title': '🔄 Section 1: Reload & SIMs Balance',
      'upd_sim_dialog': 'Dialog SIM',
      'upd_sim_mobitel': 'Mobitel SIM',
      'upd_sim_airtel': 'Airtel SIM',
      'upd_sim_hutch': 'Hutch SIM',
      'upd_sim_ezcash': 'eZ Cash Balance',
      'upd_reload_cash': '💵 Reload Cash in Drawer',
      'upd_reload_total_badge': '🔄 Reload Total (SIMs + Reload Cash)',
      
      // Section 2: Bank & Mobile Rental
      'upd_bank_sec_title': '🏦 Section 2: Bank & Mobile Payments',
      'upd_bank_name_lbl': 'Bank Name',
      'upd_bank_acct_lbl': 'Account Amount',
      'upd_bank_cash_lbl': 'Bank Cash in Drawer',
      'upd_add_bank': '+ Add Bank Account',
      'upd_bank_total_badge': '🏦 Bank Total (Accounts + Bank Cash)',
      'select_bank': '-- Select Bank --',
      
      // Section 3: Grand Total
      'upd_grand_sec_title': '💰 Section 3: Grand Total Capital',
      'upd_grand_total': 'Grand Total Capital (Reload + Bank)',
      'btn_save_update': '💾 Save Update',
      'btn_cancel': 'Cancel',
      
      // Comparison Table
      'comp_track_reload': '🔄 Reload / SIMs Track',
      'comp_track_bank': '🏦 Bank / Mobile Track',
      'comp_track_total': '💰 Grand Total Capital',
      'comp_prev_total': 'Previous Total',
      'comp_curr_total': 'Today Total',
      'comp_diff': 'Profit / Loss',
      
      // History
      'hist_title': 'Update History',
      'hist_filter_date': 'Filter by Date',
      'hist_btn_filter': '🔍 Filter',
      'hist_btn_all': '📄 View All',
      'hist_table_date': 'Date & Time',
      'hist_table_emp': 'Employee',
      'hist_table_reload': 'SIMs Total',
      'hist_table_mobile': 'Bank Total',
      'hist_table_cash': 'Cash',
      'hist_table_total': 'Total Profit/Loss',
      'hist_table_action': 'Action',
      'btn_view': 'View',
      'btn_delete': 'Delete',
      
      // Reports
      'rep_title': 'Reports',
      'rep_date_range': 'Date Range',
      'rep_from': 'From',
      'rep_to': 'To',
      'rep_generate': 'Generate Report',
      'rep_preset_today': 'Today',
      'rep_preset_yesterday': 'Yesterday',
      'rep_preset_this_week': 'This Week',
      'rep_preset_this_month': 'This Month',
      'rep_preset_last_3': 'Last 3 Months',
      'rep_preset_all': 'All Time',
      
      // Misc
      'profit': 'Profit',
      'loss': 'Loss',
      'neutral': 'Neutral',
      'delete_confirm': 'Are you sure you want to delete this?'
    },
    si: {
      // Sidebar
      'app_title': 'Shop Tracker',
      'nav_dashboard': 'Dashboard',
      'nav_update': 'Update කරන්න',
      'nav_history': 'Update ඉතිහාසය',
      'nav_shops': 'සාප්පු',
      'nav_reports': 'වාර්තා',
      'select_shop': '-- සාප්පුව තෝරන්න --',
      'btn_export': '📤 Data Backup / Export',
      'btn_import': '📥 Data Import / Restore',
      'backup_status': '🛡️ Backup Status',
      'cloud_sync_active': '☁️ Cloud Sync: Active',
      
      // Dashboard
      'dash_title': 'Dashboard',
      'dash_period_summary': 'ලාභ / අලාභ සාරාංශය',
      'period_today': 'අද දින (Today)',
      'period_week': 'මෙම සතිය (This Week)',
      'period_month': 'මෙම මාසය (This Month)',
      'period_year': 'මෙම වසර (This Year)',
      'period_all': 'ආරම්භයේ සිට (All Time)',
      'dash_overall': 'පෙර Update එකට සාපේක්ෂව',
      'dash_no_data': 'දත්ත නොමැත',
      'dash_reload_total': '🔄 රීලෝඩ් මුළු එකතුව',
      'dash_bank_total': '🏦 බැංකු මුළු එකතුව',
      'dash_cash_total': '💵 ලාච්චුවේ මුළු මුදල',
      'dash_capital_total': '💰 සම්පූර්ණ ප්‍රාග්ධනය',
      'dash_sim_total': '🔄 රීලෝඩ් එකතුව',
      'dash_reload': '🔄 රීලෝඩ් එකතුව',
      'dash_mobile': '🏦 බැංකු එකතුව',
      'dash_today_updates': '📌 අද Updates',
      'dash_comparison_title': '📊 පෙර දිනට සාපේක්ෂ සංසන්දනය (රූල් දෙක)',
      'dash_all_shops_title': '🏪 සියලුම සාප්පු වල සජීවී සාරාංශය (All Shops)',
      'dash_recent_updates': 'මෑතකාලීන Updates',
      'view_shop': 'සාප්පුව බලන්න ➔',
      
      // Update Form
      'upd_title': 'අලුත් Update එකක් දාන්න',
      'upd_emp_details': 'සේවක තොරතුරු',
      'upd_emp_name': 'සේවකයාගේ නම',
      'upd_job_role': 'තනතුර (උදා: Cashier)',
      'upd_balances_title': '💰 අද දින ශේෂයන් සහ ලාච්චුවේ මුදල්',
      
      // Section 1: Reload / SIMs
      'upd_reload_sec_title': '🔄 අංශය 1: රීලෝඩ් සහ සිම්පත් ශේෂයන්',
      'upd_sim_dialog': 'Dialog සිම් එක',
      'upd_sim_mobitel': 'Mobitel සිම් එක',
      'upd_sim_airtel': 'Airtel සිම් එක',
      'upd_sim_hutch': 'Hutch සිම් එක',
      'upd_sim_ezcash': 'eZ Cash ශේෂය',
      'upd_reload_cash': '💵 රීලෝඩ් ලාච්චුවේ මුදල්',
      'upd_reload_total_badge': '🔄 රීලෝඩ් මුළු එකතුව (සිම් + ලාච්චුවේ මුදල්)',
      
      // Section 2: Bank & Mobile Rental
      'upd_bank_sec_title': '🏦 අංශය 2: බැංකු සහ ජංගම ගෙවීම්',
      'upd_bank_name_lbl': 'බැංකුව',
      'upd_bank_acct_lbl': 'ගිණුමේ මුදල',
      'upd_bank_cash_lbl': 'බැංකුවට අදාළ ලාච්චුවේ මුදල්',
      'upd_add_bank': '+ තව Bank එකක් එකතු කරන්න',
      'upd_bank_total_badge': '🏦 බැංකු මුළු එකතුව (ගිණුම් + ලාච්චුවේ මුදල්)',
      'select_bank': '-- Bank තෝරන්න --',
      
      // Section 3: Grand Total
      'upd_grand_sec_title': '💰 අංශය 3: සම්පූර්ණ ප්‍රාග්ධනය',
      'upd_grand_total': 'සම්පූර්ණ ප්‍රාග්ධනය (රීලෝඩ් + බැංකු)',
      'btn_save_update': '💾 Save කරන්න',
      'btn_cancel': 'අවලංගු කරන්න',
      
      // Comparison Table
      'comp_track_reload': '🔄 රීලෝඩ් / සිම්පත් අංශය',
      'comp_track_bank': '🏦 බැංකු / ජංගම ගෙවීම් අංශය',
      'comp_track_total': '💰 සම්පූර්ණ ප්‍රාග්ධනය',
      'comp_prev_total': 'පෙර එකතුව',
      'comp_curr_total': 'අද එකතුව',
      'comp_diff': 'ලාභය / අලාභය',
      
      // History
      'hist_title': 'Update ඉතිහාසය',
      'hist_filter_date': 'දිනය අනුව සොයන්න',
      'hist_btn_filter': '🔍 හොයන්න',
      'hist_btn_all': '📄 ඔක්කොම බලන්න',
      'hist_table_date': 'දිනය සහ වේලාව',
      'hist_table_emp': 'සේවකයා',
      'hist_table_reload': 'සිම් මුදල',
      'hist_table_mobile': 'බැංකු මුදල',
      'hist_table_cash': 'ලාච්චුවේ මුදල',
      'hist_table_total': 'මුළු ලාභය/අලාභය',
      'hist_table_action': 'ක්‍රියාව',
      'btn_view': 'බලන්න',
      'btn_delete': 'මකන්න',
      
      // Reports
      'rep_title': 'වාර්තා (Reports)',
      'rep_date_range': 'කාල පරාසය',
      'rep_from': 'සිට',
      'rep_to': 'දක්වා',
      'rep_generate': 'වාර්තාව හදන්න',
      'rep_preset_today': 'අද',
      'rep_preset_yesterday': 'ඊයේ',
      'rep_preset_this_week': 'මේ සතිය',
      'rep_preset_this_month': 'මේ මාසය',
      'rep_preset_last_3': 'පහුගිය මාස 3',
      'rep_preset_all': 'සියලුම කාලය',
      
      // Misc
      'profit': 'ලාභය',
      'loss': 'අලාභය',
      'neutral': 'වෙනසක් නෑ',
      'delete_confirm': 'ඔබට විශ්වාසද මෙය මකා දැමිය යුතුයි කියා?'
    },
    ta: {
      // Sidebar
      'app_title': 'கடை ட்ராக்கர்',
      'nav_dashboard': 'முகப்பு',
      'nav_update': 'புதுப்பி',
      'nav_history': 'வரலாறு',
      'nav_shops': 'கடைகள்',
      'nav_reports': 'அறிக்கைகள்',
      'select_shop': '-- கடையை தேர்வு செய் --',
      'btn_export': '📤 தரவு ஏற்றுமதி',
      'btn_import': '📥 தரவு இறக்குமதி',
      'backup_status': '🛡️ காப்பு நிலை',
      'cloud_sync_active': '☁️ கிளவுட் ஒத்திசைவு',
      
      // Dashboard
      'dash_title': 'முகப்பு',
      'dash_period_summary': 'லாபம் / நஷ்டம் சுருக்கம்',
      'period_today': 'இன்று',
      'period_week': 'இந்த வாரம்',
      'period_month': 'இந்த மாதம்',
      'period_year': 'இந்த வருடம்',
      'period_all': 'அனைத்து நேரமும்',
      'dash_overall': 'முந்தைய தின ஒப்பீடு',
      'dash_no_data': 'தரவு இல்லை',
      'dash_reload_total': '🔄 ரீலோட் மொத்தம்',
      'dash_bank_total': '🏦 வங்கி மொத்தம்',
      'dash_cash_total': '💵 டிராயர் பணம்',
      'dash_capital_total': '💰 மொத்த மூலதனம்',
      'dash_sim_total': '🔄 ரீலோட் மொத்தம்',
      'dash_reload': '🔄 ரீலோட் மொத்தம்',
      'dash_mobile': '🏦 வங்கி மொத்தம்',
      'dash_today_updates': '📌 இன்றைய புதுப்பிப்புகள்',
      'dash_comparison_title': '📊 நிதி ஒப்பீடு',
      'dash_all_shops_title': '🏪 அனைத்து கடைகள் நேரலை',
      'dash_recent_updates': 'சமீபத்திய புதுப்பிப்புகள்',
      'view_shop': 'கடையைப் பார் ➔',
      
      // Update Form
      'upd_title': 'புதிய புதுப்பிப்பு',
      'upd_emp_details': 'பணியாளர் விவரங்கள்',
      'upd_emp_name': 'பணியாளர் பெயர்',
      'upd_job_role': 'பதவி',
      'upd_balances_title': '💰 தற்போதைய நிலுவைகள்',
      
      // Section 1: Reload / SIMs
      'upd_reload_sec_title': '🔄 பிரிவு 1: ரீலோட் & சிம் இருப்பு',
      'upd_sim_dialog': 'Dialog சிம்',
      'upd_sim_mobitel': 'Mobitel சிம்',
      'upd_sim_airtel': 'Airtel சிம்',
      'upd_sim_hutch': 'Hutch சிம்',
      'upd_sim_ezcash': 'eZ Cash இருப்பு',
      'upd_reload_cash': '💵 ரீலோட் டிராயர் பணம்',
      'upd_reload_total_badge': '🔄 ரீலோட் மொத்தம் (சிம் + பணம்)',
      
      // Section 2: Bank & Mobile Rental
      'upd_bank_sec_title': '🏦 பிரிவு 2: வங்கி & மொபைல் கொடுப்பனவுகள்',
      'upd_bank_name_lbl': 'வங்கி பெயர்',
      'upd_bank_acct_lbl': 'கணக்கு இருப்பு',
      'upd_bank_cash_lbl': 'வங்கி டிராயர் பணம்',
      'upd_add_bank': '+ வங்கியைச் சேர்',
      'upd_bank_total_badge': '🏦 வங்கி மொத்தம் (கணக்கு + பணம்)',
      'select_bank': '-- வங்கியைத் தேர்ந்தெடு --',
      
      // Section 3: Grand Total
      'upd_grand_sec_title': '💰 பிரிவு 3: மொத்த மூலதனம்',
      'upd_grand_total': 'மொத்த மூலதனம் (ரீலோட் + வங்கி)',
      'btn_save_update': '💾 சேமி',
      'btn_cancel': 'ரத்து செய்',
      
      // Comparison Table
      'comp_track_reload': '🔄 ரீலோட் பிரிவு',
      'comp_track_bank': '🏦 வங்கி பிரிவு',
      'comp_track_total': '💰 மொத்த மூலதனம்',
      'comp_prev_total': 'முந்தைய மொத்தம்',
      'comp_curr_total': 'இன்றைய மொத்தம்',
      'comp_diff': 'லாபம் / நஷ்டம்',
      
      // History
      'hist_title': 'வரலாறு',
      'hist_filter_date': 'தேதி வாரியாக தேடு',
      'hist_btn_filter': '🔍 தேடு',
      'hist_btn_all': '📄 அனைத்தையும் காண்க',
      'hist_table_date': 'தேதி & நேரம்',
      'hist_table_emp': 'பணியாளர்',
      'hist_table_reload': 'சிம் மொத்தம்',
      'hist_table_mobile': 'வங்கி மொத்தம்',
      'hist_table_cash': 'டிராயர் பணம்',
      'hist_table_total': 'மொத்த லாபம்/நஷ்டம்',
      'hist_table_action': 'செயல்',
      'btn_view': 'பார்',
      'btn_delete': 'நீக்கு',
      
      // Reports
      'rep_title': 'அறிக்கைகள்',
      'rep_date_range': 'தேதி வரம்பு',
      'rep_from': 'இருந்து',
      'rep_to': 'வரை',
      'rep_generate': 'அறிக்கை உருவாக்கு',
      'rep_preset_today': 'இன்று',
      'rep_preset_yesterday': 'நேற்று',
      'rep_preset_this_week': 'இந்த வாரம்',
      'rep_preset_this_month': 'இந்த மாதம்',
      'rep_preset_last_3': 'கடந்த 3 மாதங்கள்',
      'rep_preset_all': 'எல்லா நேரமும்',
      
      // Misc
      'profit': 'லாபம்',
      'loss': 'நஷ்டம்',
      'neutral': 'சமம்',
      'delete_confirm': 'நிச்சயமாக நீக்க விரும்புகிறீர்களா?'
    }
  },

  setLanguage(lang) {
    if (this.translations[lang]) {
      this.currentLang = lang;
      localStorage.setItem('spt_lang', lang);
      this.translatePage();
    }
  },

  get(key) {
    return (this.translations[this.currentLang] && this.translations[this.currentLang][key]) || key;
  },

  t(key) {
    return this.get(key);
  },

  translatePage() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (this.translations[this.currentLang][key]) {
        if (el.tagName === 'INPUT' && el.type === 'text') {
            el.placeholder = this.translations[this.currentLang][key];
        } else {
            el.innerHTML = this.translations[this.currentLang][key];
        }
      }
    });
  }
};

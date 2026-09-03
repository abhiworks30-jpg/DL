/**
 * app.js - Deep Learning Exam Master
 * Interactive Page-Wise Slideshow & Comprehensive Exam Study Engine
 * Features: Pure synchronous KaTeX rendering, SML-inspired visual cards,
 * full dark/light modes, keyboard shortcuts, and continuous study feed.
 */

(function() {
  'use strict';

  // State Management
  const state = {
    questions: [],
    filteredIndices: [],
    currentIndex: 0,
    activeUnit: 'all',
    activeType: 'all',
    searchQuery: '',
    viewMode: 'slideshow', // 'slideshow' | 'document'
    theme: localStorage.getItem('dl_theme') || 'dark',
    bookmarked: new Set(JSON.parse(localStorage.getItem('dl_bookmarks') || '[]')),
    completed: new Set(JSON.parse(localStorage.getItem('dl_completed') || '[]'))
  };

  // DOM Elements
  const el = {
    app: document.documentElement,
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    viewModeToggleBtn: document.getElementById('viewModeToggleBtn'),
    drawerToggleBtn: document.getElementById('drawerToggleBtn'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    closeDrawerBtn: document.getElementById('closeDrawerBtn'),
    drawerItemsList: document.getElementById('drawerItemsList'),
    drawerSearchInput: document.getElementById('drawerSearchInput'),
    
    // Header & Filter controls
    unitFilterChips: document.getElementById('unitFilterChips'),
    typeFilterSelect: document.getElementById('typeFilterSelect'),
    progressText: document.getElementById('progressText'),
    progressBarFill: document.getElementById('progressBarFill'),

    // Permanent Left Sidebar Elements
    leftSidebar: document.getElementById('leftSidebar'),
    sidebarCollapseBtn: document.getElementById('sidebarCollapseBtn'),
    sidebarProgressText: document.getElementById('sidebarProgressText'),
    sidebarProgressFill: document.getElementById('sidebarProgressFill'),
    sidebarFilterPills: document.getElementById('sidebarFilterPills'),
    sidebarSearchInput: document.getElementById('sidebarSearchInput'),
    sidebarUnitsContainer: document.getElementById('sidebarUnitsContainer'),
    
    // Slideshow Elements
    slideshowView: document.getElementById('slideshowView'),
    slideCard: document.getElementById('slideCard'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    jumperInput: document.getElementById('jumperInput'),
    totalSlidesSpan: document.getElementById('totalSlidesSpan'),
    
    // Continuous Document Mode Elements
    documentView: document.getElementById('documentView'),
    documentFeed: document.getElementById('documentFeed'),
    tocList: document.getElementById('tocList')
  };

  // =========================================================================
  // BULLETPROOF SYNCHRONOUS KATEX RENDERING ENGINE
  // =========================================================================
  function renderTex(texStr, displayMode = false) {
    if (!texStr || typeof texStr !== 'string') return '';
    let s = texStr.trim();
    
    // Strip accidental outer delimiters
    if (s.startsWith('$$') && s.endsWith('$$') && s.length >= 4) {
      s = s.slice(2, -2).trim();
      displayMode = true;
    } else if (s.startsWith('$') && s.endsWith('$') && s.length >= 2) {
      s = s.slice(1, -1).trim();
    }

    // 1. Normalize accidental double-backslashes before LaTeX command names
    // e.g. \\frac -> \frac, \\partial -> \partial, \\mathbf -> \mathbf
    s = s.replace(/\\\\([a-zA-Z]+)/g, (m, cmd) => '\\' + cmd);

    // 2. Heal accidental control characters from unescaped strings
    s = s.replace(/\x08egin/g, '\\begin')
         .replace(/\x08/g, '\\b')
         .replace(/\x07pprox/g, '\\approx')
         .replace(/\x07lpha/g, '\\alpha')
         .replace(/\x07/g, '\\a')
         .replace(/\x0crac/g, '\\frac')
         .replace(/\x0corall/g, '\\forall')
         .replace(/\x0c/g, '\\f')
         .replace(/\t/g, ' ')
         .replace(/\r/g, '')
         .replace(/(?<![a-zA-Z\\])ight([\)\]\}])/g, '\\right$1')
         .replace(/(?<!\\)right\)/g, '\\right)')
         .replace(/(?<!\\)right\]/g, '\\right]')
         .replace(/(?<!\\)right\}/g, '\\right}');
    
    if (window.katex && typeof window.katex.renderToString === 'function') {
      try {
        return window.katex.renderToString(s, {
          displayMode: displayMode,
          throwOnError: false
        });
      } catch (e) {
        console.warn('KaTeX render error:', e, s);
        return `<span class="tex-fallback">${escapeHtml(s)}</span>`;
      }
    }
    return `<span class="tex-fallback">${escapeHtml(s)}</span>`;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Parse text that might contain $...$ or $$...$$
  function formatMathInText(text) {
    if (!text || typeof text !== 'string') return text || '';
    
    // 1. Replace display math $$...$$
    let out = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, tex) => {
      return `<div class="math-callout">${renderTex(tex, true)}</div>`;
    });
    
    // 2. Replace inline math $...$
    out = out.replace(/\$([^\$\n]+?)\$/g, (match, tex) => {
      return renderTex(tex, false);
    });

    return out;
  }

  // Initialize Application
  function init() {
    if (!window.QUESTIONS_DATA || !Array.isArray(window.QUESTIONS_DATA)) {
      console.error('QUESTIONS_DATA not found or invalid format.');
      return;
    }

    state.questions = window.QUESTIONS_DATA;
    state.filteredIndices = state.questions.map((_, i) => i);
    
    // Apply saved theme
    setTheme(state.theme);

    // Render Filter Chips
    renderFilterChips();

    // Render Drawer List
    renderDrawerList();

    // Handle initial slide index from URL Hash or default 0
    parseUrlHash();

    // Render Initial View
    render();

    // Bind Event Listeners
    bindEvents();
  }

  // Theme Management
  function setTheme(theme) {
    state.theme = theme;
    el.app.setAttribute('data-theme', theme);
    localStorage.setItem('dl_theme', theme);
    if (el.themeToggleBtn) {
      el.themeToggleBtn.innerHTML = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    }
  }

  // Render Filter Chips for Units
  function renderFilterChips() {
    if (!el.unitFilterChips) return;
    
    const unitsMap = new Map();
    unitsMap.set('all', { title: 'All Questions', count: state.questions.length });

    state.questions.forEach(q => {
      const uId = q.unitId || 'unit-0';
      const uTitle = q.unitTitle || 'General';
      if (!unitsMap.has(uId)) {
        unitsMap.set(uId, { title: uTitle, count: 0 });
      }
      unitsMap.get(uId).count++;
    });

    el.unitFilterChips.innerHTML = '';
    unitsMap.forEach((info, uId) => {
      const chip = document.createElement('button');
      chip.className = `chip ${state.activeUnit === uId ? 'active' : ''}`;
      chip.textContent = `${info.title} (${info.count})`;
      chip.addEventListener('click', () => {
        state.activeUnit = uId;
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        applyFilters();
      });
      el.unitFilterChips.appendChild(chip);
    });
  }

  // Apply Search and Filters
  function applyFilters() {
    state.filteredIndices = [];
    const query = state.searchQuery.toLowerCase().trim();

    state.questions.forEach((q, idx) => {
      // Unit filter
      if (state.activeUnit !== 'all' && q.unitId !== state.activeUnit) {
        return;
      }
      // Type filter
      if (state.activeType !== 'all') {
        if (state.activeType === 'bookmarked' && !state.bookmarked.has(q.id)) return;
        if (state.activeType === 'completed' && !state.completed.has(q.id)) return;
        if (state.activeType === 'unstudied' && state.completed.has(q.id)) return;
        if (state.activeType !== 'bookmarked' && state.activeType !== 'completed' && state.activeType !== 'unstudied') {
          if (q.type !== state.activeType) return;
        }
      }
      // Search Query filter
      if (query) {
        const textToSearch = `${q.number} ${q.title} ${q.question} ${JSON.stringify(q.solution)}`.toLowerCase();
        if (!textToSearch.includes(query)) return;
      }

      state.filteredIndices.push(idx);
    });

    // Reset current index to 0 or clamp
    state.currentIndex = 0;
    render();
    renderDrawerList();
  }

  // Render Slideshow View or Document View
  function render() {
    updateProgress();
    renderSidebarUnits();

    if (state.viewMode === 'slideshow') {
      if (el.slideshowView) el.slideshowView.style.display = 'flex';
      if (el.documentView) el.documentView.classList.remove('active');
      renderSlide();
    } else {
      if (el.slideshowView) el.slideshowView.style.display = 'none';
      if (el.documentView) el.documentView.classList.add('active');
      renderDocumentFeed();
    }
  }

  // Render Permanent Left Navigation Menu Syllabus & Questions
  function renderSidebarUnits() {
    if (!el.sidebarUnitsContainer) return;
    el.sidebarUnitsContainer.innerHTML = '';

    // Group questions by unit
    const unitsMap = new Map();
    state.questions.forEach((q, originalIdx) => {
      const uId = q.unitId || 'unit-0';
      if (!unitsMap.has(uId)) {
        unitsMap.set(uId, {
          id: uId,
          title: q.unitTitle || 'General',
          questions: []
        });
      }
      unitsMap.get(uId).questions.push({ ...q, originalIdx });
    });

    const activeOriginalIdx = state.filteredIndices.length > 0 ? state.filteredIndices[state.currentIndex] : -1;
    const sideQuery = (el.sidebarSearchInput ? el.sidebarSearchInput.value : '').toLowerCase().trim();

    unitsMap.forEach((unit) => {
      // Filter questions in this unit if activeType or sideQuery applies
      const matchingQuestions = unit.questions.filter(q => {
        if (state.activeType !== 'all') {
          if (state.activeType === 'bookmarked' && !state.bookmarked.has(q.id)) return false;
          if (state.activeType === 'completed' && !state.completed.has(q.id)) return false;
          if (state.activeType !== 'bookmarked' && state.activeType !== 'completed') {
            if (q.type !== state.activeType) return false;
          }
        }
        if (sideQuery) {
          const text = `${q.number} ${q.title} ${q.question}`.toLowerCase();
          if (!text.includes(sideQuery)) return false;
        }
        return true;
      });

      if (matchingQuestions.length === 0 && (sideQuery || state.activeType !== 'all')) {
        return;
      }

      // Compute completed count in this unit
      const unitTotal = unit.questions.length;
      const unitDone = unit.questions.filter(q => state.completed.has(q.id)).length;
      const containsActive = unit.questions.some(q => q.originalIdx === activeOriginalIdx);

      const accordion = document.createElement('div');
      accordion.className = `unit-accordion ${containsActive || sideQuery ? 'open' : ''}`;
      accordion.id = `sidebar-${unit.id}`;

      // Accordion Header
      const header = document.createElement('div');
      header.className = 'unit-accordion-header';
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.innerHTML = `
        <div class="unit-accordion-title">
          <span class="unit-chevron">▶</span>
          <span class="unit-label">${escapeHtml(unit.title)}</span>
        </div>
        <span class="unit-badge-count">${unitDone}/${unitTotal}</span>
      `;
      header.addEventListener('click', () => {
        accordion.classList.toggle('open');
      });
      accordion.appendChild(header);

      // Questions list
      const qList = document.createElement('div');
      qList.className = 'unit-questions-list';

      matchingQuestions.forEach(q => {
        const isCurrent = q.originalIdx === activeOriginalIdx;
        const isBookmarked = state.bookmarked.has(q.id);
        const isDone = state.completed.has(q.id);

        const link = document.createElement('a');
        link.className = `sidebar-q-link ${isCurrent ? 'active' : ''}`;
        link.id = `sidebar-link-${q.id}`;
        
        let statusIcons = '';
        if (isDone) statusIcons += '<span style="color:#34d399;font-weight:700;">✓</span>';
        if (isBookmarked) statusIcons += '<span style="color:#fbbf24;">★</span>';

        link.innerHTML = `
          <div class="sidebar-q-info">
            <span class="sidebar-q-id">${escapeHtml(q.id)}</span>
            <span class="sidebar-q-title" title="${escapeHtml(q.title)}">${escapeHtml(q.title)}</span>
          </div>
          <div class="sidebar-q-status">${statusIcons}</div>
        `;

        link.addEventListener('click', (e) => {
          e.preventDefault();
          const targetPos = state.filteredIndices.indexOf(q.originalIdx);
          if (targetPos > state.currentIndex) {
            markCurrentQuestionDone();
          }
          if (targetPos !== -1) {
            state.currentIndex = targetPos;
          } else {
            // Reset filter to show this question
            state.activeType = 'all';
            state.activeUnit = 'all';
            state.searchQuery = '';
            applyFilters();
            state.currentIndex = state.filteredIndices.indexOf(q.originalIdx);
          }
          render();
        });

        qList.appendChild(link);
      });

      accordion.appendChild(qList);
      el.sidebarUnitsContainer.appendChild(accordion);
    });

    // Auto-scroll active link into view
    setTimeout(() => {
      const activeLink = document.querySelector('.sidebar-q-link.active');
      if (activeLink) {
        activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 50);
  }

  // Parse Markdown & Math for Complete Model Answers
  function formatMarkdownAndMath(text) {
    if (!text || typeof text !== 'string') return '';
    
    // 1. Stash and protect math blocks ($$...$$ and $...$)
    const mathStash = [];
    let processed = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, tex) => {
      const idx = mathStash.length;
      mathStash.push({ tex: tex.trim(), isBlock: true });
      return `@@@MATH_BLOCK_${idx}@@@`;
    });
    processed = processed.replace(/\$([^\$\n]+?)\$/g, (match, tex) => {
      const idx = mathStash.length;
      mathStash.push({ tex: tex.trim(), isBlock: false });
      return `@@@MATH_INLINE_${idx}@@@`;
    });

    // 2. Parse Markdown Headings
    processed = processed.replace(/^### (.*$)/gim, '<h4 class="complete-ans-h4">$1</h4>');
    processed = processed.replace(/^#### (.*$)/gim, '<h5 class="complete-ans-h5">$1</h5>');

    // 3. Parse Markdown Tables
    processed = processed.replace(/((?:^\|[^\n]+\|\r?\n)+)/gm, (tableMatch) => {
      const rows = tableMatch.trim().split(/\r?\n/).map(r => r.trim());
      if (rows.length < 2) return tableMatch;
      
      let tableHtml = '<div class="table-responsive"><table class="complete-ans-table">';
      const headers = rows[0].split('|').slice(1, -1).map(c => c.trim());
      tableHtml += '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
      
      tableHtml += '<tbody>';
      for (let i = 2; i < rows.length; i++) {
        const cells = rows[i].split('|').slice(1, -1).map(c => c.trim());
        tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
      tableHtml += '</tbody></table></div>';
      return tableHtml;
    });

    // 4. Parse Lists
    processed = processed.replace(/^[-*]\s+(.*$)/gim, '<li class="complete-ans-li">$1</li>');
    processed = processed.replace(/((?:<li class="complete-ans-li">.*?<\/li>\s*)+)/gis, '<ul class="complete-ans-ul">$1</ul>');

    // 5. Bold & Italic
    processed = processed.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');

    // 6. Inline code
    processed = processed.replace(/`([^`]+?)`/g, '<code class="inline-code">$1</code>');

    // 7. Paragraphs: double newlines
    const paragraphs = processed.split(/\n\s*\n/);
    processed = paragraphs.map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<div') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol') || trimmed.startsWith('<table')) {
        return trimmed;
      }
      return `<p class="complete-ans-p">${trimmed}</p>`;
    }).join('\n');

    // 8. Restore Math
    processed = processed.replace(/@@@MATH_BLOCK_(\d+)@@@/g, (match, idx) => {
      const item = mathStash[Number(idx)];
      return `<div class="math-callout">${renderTex(item.tex, true)}</div>`;
    });
    processed = processed.replace(/@@@MATH_INLINE_(\d+)@@@/g, (match, idx) => {
      const item = mathStash[Number(idx)];
      return renderTex(item.tex, false);
    });

    return processed;
  }

  // Render Solution Content Blocks
  function buildSolutionHtml(q) {
    const sol = q.solution || {};
    let html = '';

    // 0. Complete University-Grade Answer Card (Top Priority)
    if (sol.completeAnswer) {
      html += `
        <div class="complete-answer-card">
          <div class="complete-answer-header">
            <div class="complete-answer-badge">
              <span class="badge-icon">👑</span>
              <span class="badge-text">Complete Descriptive Model Answer (University Exam Full-Marks Blueprint)</span>
            </div>
            <span class="complete-answer-badge-sub">High-Yield Synthesis</span>
          </div>
          <div class="complete-answer-body">
            ${formatMarkdownAndMath(sol.completeAnswer)}
          </div>
        </div>
      `;
    }

    // 1. Core Concept Block
    if (sol.concept) {
      html += `
        <div class="sol-block">
          <div class="sol-block-title">💡 Core Concept &amp; Principle</div>
          <div class="sol-text">${formatMathInText(sol.concept)}</div>
        </div>
      `;
    }

    // 2. Comprehensive Theory Block
    if (sol.theory) {
      html += `
        <div class="sol-block">
          <div class="sol-block-title">📖 Comprehensive Theoretical Explanation</div>
          <div class="sol-text">${formatMathInText(sol.theory)}</div>
        </div>
      `;
    }

    // 3. Mathematical Formula Callout Block (Direct Synchronous KaTeX Render)
    const formulaStr = sol.formula || sol.math;
    if (formulaStr) {
      html += `
        <div class="sol-block">
          <div class="sol-block-title">📐 Mathematical Formulation &amp; Derivations</div>
          <div class="math-callout">
            ${renderTex(formulaStr, true)}
          </div>
        </div>
      `;
    }

    // 4. Structured Points Block
    if (sol.points && sol.points.length > 0) {
      html += `
        <div class="sol-block">
          <div class="sol-block-title">📝 Key Examination Points</div>
          <ul class="steps-list">
            ${sol.points.map(pt => `<li class="step-item">${formatMathInText(pt)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    // 5. Numerical Step-by-Step Calculations Working (Structured Step Cards)
    if (sol.steps && sol.steps.length > 0) {
      html += `
        <div class="sol-block">
          <div class="sol-block-title">🔢 Detailed Step-by-Step Calculation Working</div>
          <div style="display: flex; flex-direction: column; gap: 0.85rem; margin-top: 0.25rem;">
            ${sol.steps.map((step, idx) => {
              // Extract step label if present (e.g. "Step 1: ...")
              let title = `Step ${idx + 1}`;
              let content = step;
              const match = step.match(/^(?:Step\s*\d+:?|\d+\.)\s*(.*?):\s*(.*)$/i);
              if (match) {
                title = `Step ${idx + 1}: ${match[1]}`;
                content = match[2];
              }
              return `
                <div class="step-calc-card">
                  <div class="step-calc-header">
                    <span class="step-pill">${escapeHtml(title)}</span>
                  </div>
                  <div class="step-calc-content">
                    ${formatMathInText(content)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // 6. Final Result Box
    if (sol.result) {
      html += `
        <div class="result-box">
          <span style="font-weight: 700;">Final Result &amp; Interpretation:</span> ${formatMathInText(sol.result)}
        </div>
      `;
    }

    // 7. Exam Strategy Pro-Tip Box
    if (sol.examTip) {
      html += `
        <div class="exam-tip-box">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <div>
            <span style="font-weight:700;">Examiner Pro-Tip:</span> ${formatMathInText(sol.examTip)}
          </div>
        </div>
      `;
    }

    return html;
  }

  // Render Single Slide in Slideshow Mode
  function renderSlide() {
    if (state.filteredIndices.length === 0) {
      if (el.slideCard) {
        el.slideCard.innerHTML = `
          <div style="text-align:center; padding: 4rem 1rem;">
            <h3 style="font-size: 1.3rem; margin-bottom: 0.5rem; color: var(--text-secondary);">No Questions Match Filter</h3>
            <p style="color: var(--text-muted);">Try adjusting your unit selection, question type filter, or search query.</p>
            <button class="action-btn" style="margin-top: 1.25rem;" onclick="window.resetFilters()">Reset All Filters</button>
          </div>
        `;
      }
      if (el.prevBtn) el.prevBtn.disabled = true;
      if (el.nextBtn) el.nextBtn.disabled = true;
      if (el.jumperInput) el.jumperInput.value = 0;
      if (el.totalSlidesSpan) el.totalSlidesSpan.textContent = '0';
      return;
    }

    const actualIdx = state.filteredIndices[state.currentIndex];
    const q = state.questions[actualIdx];
    const total = state.filteredIndices.length;
    const currentNum = state.currentIndex + 1;

    // Update Nav controls
    if (el.prevBtn) el.prevBtn.disabled = state.currentIndex === 0;
    if (el.nextBtn) el.nextBtn.disabled = state.currentIndex === total - 1;
    if (el.jumperInput) el.jumperInput.value = currentNum;
    if (el.totalSlidesSpan) el.totalSlidesSpan.textContent = total;

    // Update URL hash
    window.location.hash = `#${q.id}`;

    // Build Slide HTML
    const isBookmarked = state.bookmarked.has(q.id);
    const isCompleted = state.completed.has(q.id);
    const solutionHtml = buildSolutionHtml(q);

    // Trigger smooth entrance animation
    el.slideCard.classList.remove('slide-entering');
    void el.slideCard.offsetWidth; // force reflow
    el.slideCard.classList.add('slide-entering');

    el.slideCard.innerHTML = `
      <!-- Slide Meta Row -->
      <div class="slide-meta-row">
        <div class="badge-group">
          <span class="badge badge-unit">${escapeHtml(q.unitTitle)}</span>
          <span class="badge badge-number">${escapeHtml(q.number)}</span>
          <span class="badge badge-type">${escapeHtml(q.type)}</span>
          <span class="badge badge-marks">${escapeHtml(q.marks)}</span>
        </div>
        <div class="slide-status-actions">
          <button class="status-toggle-btn ${isBookmarked ? 'bookmarked' : ''}" id="slideBookmarkBtn">
            ${isBookmarked ? '★ Bookmarked' : '☆ Bookmark'}
          </button>
          <button class="status-toggle-btn ${isCompleted ? 'completed' : ''}" id="slideCompleteBtn">
            ${isCompleted ? '✓ Studied' : '○ Mark Studied'}
          </button>
        </div>
      </div>

      <!-- Question Title -->
      <h2 class="question-title">${escapeHtml(q.title)}</h2>
      
      <!-- Exact Question Box -->
      <div class="question-statement-box">
        <strong>Question:</strong> ${formatMathInText(q.question)}
      </div>

      <!-- Bespoke SVG Visual Diagram -->
      <div class="diagram-wrapper">
        ${q.svg}
        <div class="diagram-caption">Figure: Bespoke Visual Architecture &amp; Mathematical Concept Diagram</div>
      </div>

      <!-- Detailed Descriptive Solution -->
      <div class="solution-container">
        <div class="solution-header">
          <h3>📝 Detailed Descriptive Solution (Exam Format)</h3>
        </div>
        ${solutionHtml}
      </div>
    `;

    // Bind slide status toggles
    document.getElementById('slideBookmarkBtn').addEventListener('click', () => toggleBookmark(q.id));
    document.getElementById('slideCompleteBtn').addEventListener('click', () => toggleComplete(q.id));

    // Secondary auto-render pass for any remaining raw math
    triggerAutoRender(el.slideCard);
  }

  // Render Continuous Document Feed
  function renderDocumentFeed() {
    if (!el.documentFeed || !el.tocList) return;

    el.documentFeed.innerHTML = '';
    el.tocList.innerHTML = '';

    state.filteredIndices.forEach((idx, pos) => {
      const q = state.questions[idx];

      // Add to TOC sidebar
      const tocItem = document.createElement('li');
      tocItem.className = 'toc-item';
      tocItem.innerHTML = `<a href="#doc-${q.id}" title="${escapeHtml(q.title)}">${escapeHtml(q.number)}: ${escapeHtml(q.title)}</a>`;
      el.tocList.appendChild(tocItem);

      // Create Document Card
      const docCard = document.createElement('div');
      docCard.className = 'slide-card';
      docCard.id = `doc-${q.id}`;
      
      const solHtml = buildSolutionHtml(q);

      docCard.innerHTML = `
        <div class="slide-meta-row">
          <div class="badge-group">
            <span class="badge badge-unit">${escapeHtml(q.unitTitle)}</span>
            <span class="badge badge-number">${escapeHtml(q.number)}</span>
            <span class="badge badge-type">${escapeHtml(q.type)}</span>
            <span class="badge badge-marks">${escapeHtml(q.marks)}</span>
          </div>
        </div>
        <h2 class="question-title">${escapeHtml(q.title)}</h2>
        <div class="question-statement-box"><strong>Question:</strong> ${formatMathInText(q.question)}</div>
        <div class="diagram-wrapper">${q.svg}</div>
        <div class="solution-container">${solHtml}</div>
      `;
      el.documentFeed.appendChild(docCard);
    });

    triggerAutoRender(el.documentFeed);
  }

  // Double Guarantee: Trigger AutoRender if available
  function triggerAutoRender(container) {
    if (window.renderMathInElement && container) {
      try {
        window.renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      } catch (e) {
        // silent
      }
    }
  }

  // Render Table of Contents Drawer List
  function renderDrawerList() {
    if (!el.drawerItemsList) return;

    el.drawerItemsList.innerHTML = '';
    const query = (el.drawerSearchInput ? el.drawerSearchInput.value : '').toLowerCase().trim();

    state.questions.forEach((q, idx) => {
      if (query && !`${q.number} ${q.title} ${q.question}`.toLowerCase().includes(query)) {
        return;
      }

      const item = document.createElement('div');
      const isCurrent = state.filteredIndices[state.currentIndex] === idx;
      const isBookmarked = state.bookmarked.has(q.id);
      const isCompleted = state.completed.has(q.id);

      item.className = `drawer-item ${isCurrent ? 'active' : ''}`;
      item.innerHTML = `
        <div class="drawer-item-title">${escapeHtml(q.number)}: ${escapeHtml(q.title)}</div>
        <div class="drawer-item-sub">
          <span>${escapeHtml(q.marks)}</span>
          <span>•</span>
          <span>${escapeHtml(q.type)}</span>
          ${isBookmarked ? '<span>⭐</span>' : ''}
          ${isCompleted ? '<span style="color:var(--accent-emerald);">✓ Studied</span>' : ''}
        </div>
      `;

      item.addEventListener('click', () => {
        const targetPos = state.filteredIndices.indexOf(idx);
        if (targetPos !== -1) {
          state.currentIndex = targetPos;
        } else {
          state.activeUnit = 'all';
          state.activeType = 'all';
          state.searchQuery = '';
          applyFilters();
          state.currentIndex = state.filteredIndices.indexOf(idx);
        }
        render();
        closeDrawer();
      });

      el.drawerItemsList.appendChild(item);
    });
  }

  // =========================================================================
  // CELEBRATORY CONFETTI ENGINE (Every 10 Questions Milestone)
  // =========================================================================
  let lastMilestoneFired = -1;

  function triggerConfetti(milestoneCount) {
    if (lastMilestoneFired === milestoneCount) return;
    lastMilestoneFired = milestoneCount;

    // 1. Create or get overlay canvas
    let canvas = document.getElementById('confettiCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'confettiCanvas';
      canvas.className = 'confetti-canvas';
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // 2. Spawn vibrant particles
    const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#38bdf8', '#fbbf24', '#ec4899'];
    const particles = [];
    const particleCount = 150;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * (canvas.width * 0.5),
        y: canvas.height * 0.35 + (Math.random() - 0.5) * 60,
        w: Math.random() * 11 + 6,
        h: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 18,
        vy: -Math.random() * 16 - 6,
        gravity: 0.38 + Math.random() * 0.16,
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 14,
        opacity: 1,
        shape: Math.random() > 0.35 ? 'rect' : 'circle'
      });
    }

    // 3. Display celebratory milestone toast
    showMilestoneToast(milestoneCount);

    // 4. Animate physics loop
    let animationFrame;
    const startTime = performance.now();
    const duration = 2900;

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      if (elapsed > duration) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const progress = elapsed / duration;
      const globalAlpha = progress > 0.65 ? 1 - (progress - 0.65) / 0.35 : 1;

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.985;
        p.rotation += p.vRot;

        ctx.save();
        ctx.globalAlpha = Math.max(0, globalAlpha * p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;

        if (p.shape === 'rect') {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      animationFrame = requestAnimationFrame(animate);
    }

    animationFrame = requestAnimationFrame(animate);
  }

  function showMilestoneToast(count) {
    const existing = document.querySelector('.milestone-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'milestone-toast';
    toast.innerHTML = `
      <div class="milestone-icon">🎉</div>
      <div class="milestone-info">
        <div class="milestone-heading">${count} Questions Milestone!</div>
        <div class="milestone-sub">Outstanding achievement! Keep up the momentum!</div>
      </div>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('visible');
    }, 15);

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 450);
    }, 3400);
  }

  function checkMilestone(currentQuestionIndex) {
    const qNumber = currentQuestionIndex + 1;
    if (qNumber > 0 && qNumber % 10 === 0) {
      triggerConfetti(qNumber);
    }
  }

  function checkCompletionMilestone() {
    const count = state.completed.size;
    if (count > 0 && count % 10 === 0) {
      triggerConfetti(count);
    }
  }

  // Mark Current Question as Studied/Done Helper
  function markCurrentQuestionDone() {
    if (state.filteredIndices.length === 0) return;
    const currentIdx = state.filteredIndices[state.currentIndex];
    const currentQ = state.questions[currentIdx];
    if (currentQ && !state.completed.has(currentQ.id)) {
      state.completed.add(currentQ.id);
      localStorage.setItem('dl_completed', JSON.stringify([...state.completed]));
      updateProgress();
      checkCompletionMilestone();
    }
  }

  // Navigation Handlers
  function nextSlide() {
    if (state.currentIndex < state.filteredIndices.length - 1) {
      markCurrentQuestionDone();
      state.currentIndex++;
      checkMilestone(state.currentIndex);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function prevSlide() {
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderSlide();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function goToSlide(targetNum) {
    if (typeof targetNum === 'string') {
      const trimmed = targetNum.trim().toUpperCase();
      // Support direct question ID jumping (e.g. Q67, NP2, etc.)
      const qIdx = state.questions.findIndex(q => q.id.toUpperCase() === trimmed || ('Q' + trimmed) === q.id.toUpperCase());
      if (qIdx !== -1) {
        const pos = state.filteredIndices.indexOf(qIdx);
        if (pos !== -1) {
          if (pos > state.currentIndex) markCurrentQuestionDone();
          state.currentIndex = pos;
          checkMilestone(state.currentIndex);
          render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }
    }

    const idx = parseInt(targetNum, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < state.filteredIndices.length) {
      if (idx > state.currentIndex) {
        markCurrentQuestionDone();
      }
      state.currentIndex = idx;
      checkMilestone(state.currentIndex);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      if (el.jumperInput) el.jumperInput.value = state.currentIndex + 1;
    }
  }

  // Bookmark & Completion Toggles
  function toggleBookmark(qid) {
    if (state.bookmarked.has(qid)) {
      state.bookmarked.delete(qid);
    } else {
      state.bookmarked.add(qid);
    }
    localStorage.setItem('dl_bookmarks', JSON.stringify([...state.bookmarked]));
    render();
    renderDrawerList();
  }

  function toggleComplete(qid) {
    if (state.completed.has(qid)) {
      state.completed.delete(qid);
    } else {
      state.completed.add(qid);
      checkCompletionMilestone();
    }
    localStorage.setItem('dl_completed', JSON.stringify([...state.completed]));
    render();
    renderDrawerList();
  }

  function updateProgress() {
    const total = state.questions.length;
    const completedCount = state.completed.size;
    const percent = Math.round((completedCount / total) * 100);

    if (el.progressText) {
      el.progressText.textContent = `${completedCount} / ${total} Studied (${percent}%)`;
    }
    if (el.progressBarFill) {
      el.progressBarFill.style.width = `${percent}%`;
    }

    // Sync Permanent Left Sidebar Progress
    if (el.sidebarProgressText) {
      el.sidebarProgressText.textContent = `${completedCount} / ${total} (${percent}%)`;
    }
    if (el.sidebarProgressFill) {
      el.sidebarProgressFill.style.width = `${percent}%`;
    }
  }

  // URL Hash Parsing
  function parseUrlHash() {
    const hash = window.location.hash.replace('#', '').trim();
    if (!hash) return;

    const targetIdx = state.questions.findIndex(q => q.id === hash || `doc-${q.id}` === hash);
    if (targetIdx !== -1) {
      const pos = state.filteredIndices.indexOf(targetIdx);
      if (pos !== -1) {
        state.currentIndex = pos;
      }
    }
  }

  // Drawer Controls
  function openDrawer() {
    if (el.drawerBackdrop) el.drawerBackdrop.classList.add('open');
    if (el.drawerSearchInput) {
      setTimeout(() => el.drawerSearchInput.focus(), 100);
    }
  }

  function closeDrawer() {
    if (el.drawerBackdrop) el.drawerBackdrop.classList.remove('open');
  }

  // Reset Filters Helper
  window.resetFilters = function() {
    state.activeUnit = 'all';
    state.activeType = 'all';
    state.searchQuery = '';
    if (el.typeFilterSelect) el.typeFilterSelect.value = 'all';
    document.querySelectorAll('.chip').forEach((c, i) => {
      c.classList.toggle('active', i === 0);
    });
    applyFilters();
  };

  // Bind All Event Listeners
  function bindEvents() {
    // Navigation Buttons
    if (el.prevBtn) el.prevBtn.addEventListener('click', prevSlide);
    if (el.nextBtn) el.nextBtn.addEventListener('click', nextSlide);

    // Left Sidebar Mini Collapse Button
    if (el.sidebarCollapseBtn && el.leftSidebar) {
      el.sidebarCollapseBtn.addEventListener('click', () => {
        el.leftSidebar.classList.toggle('collapsed');
        el.sidebarCollapseBtn.textContent = el.leftSidebar.classList.contains('collapsed') ? '▶' : '◀';
      });
    }

    // Left Sidebar Live Search Input
    if (el.sidebarSearchInput) {
      el.sidebarSearchInput.addEventListener('input', () => {
        renderSidebarUnits();
      });
    }

    // Left Sidebar Filter Pills
    if (el.sidebarFilterPills) {
      el.sidebarFilterPills.querySelectorAll('.side-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          el.sidebarFilterPills.querySelectorAll('.side-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          state.activeType = pill.getAttribute('data-type');
          if (el.typeFilterSelect) el.typeFilterSelect.value = state.activeType;
          applyFilters();
        });
      });
    }

    // Jumper Input
    if (el.jumperInput) {
      el.jumperInput.addEventListener('change', (e) => goToSlide(e.target.value));
      el.jumperInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') goToSlide(e.target.value);
      });
    }

    // Drawer Toggles
    if (el.drawerToggleBtn) el.drawerToggleBtn.addEventListener('click', openDrawer);
    if (el.closeDrawerBtn) el.closeDrawerBtn.addEventListener('click', closeDrawer);
    if (el.drawerBackdrop) {
      el.drawerBackdrop.addEventListener('click', (e) => {
        if (e.target === el.drawerBackdrop) closeDrawer();
      });
    }
    if (el.drawerSearchInput) {
      el.drawerSearchInput.addEventListener('input', renderDrawerList);
    }

    // Type Filter Select
    if (el.typeFilterSelect) {
      el.typeFilterSelect.addEventListener('change', (e) => {
        state.activeType = e.target.value;
        applyFilters();
      });
    }

    // View Mode Toggle (Slideshow vs Document)
    if (el.viewModeToggleBtn) {
      el.viewModeToggleBtn.addEventListener('click', () => {
        state.viewMode = state.viewMode === 'slideshow' ? 'document' : 'slideshow';
        el.viewModeToggleBtn.innerHTML = state.viewMode === 'slideshow' ? '📄 Continuous Mode' : '🖥️ Slideshow Mode';
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Theme Switcher
    if (el.themeToggleBtn) {
      el.themeToggleBtn.addEventListener('click', () => {
        const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
      });
    }

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        if (e.key === 'Escape') {
          document.activeElement.blur();
          closeDrawer();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case ' ': // Space
        case 'k':
        case 'K':
          e.preventDefault();
          nextSlide();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          prevSlide();
          break;
        case 'b':
        case 'B':
          if (state.filteredIndices.length > 0) {
            toggleBookmark(state.questions[state.filteredIndices[state.currentIndex]].id);
          }
          break;
        case 'm':
        case 'M':
          if (state.filteredIndices.length > 0) {
            toggleComplete(state.questions[state.filteredIndices[state.currentIndex]].id);
          }
          break;
        case '/':
          e.preventDefault();
          openDrawer();
          break;
        case 'Escape':
          closeDrawer();
          break;
        case 't':
        case 'T':
          setTheme(state.theme === 'dark' ? 'light' : 'dark');
          break;
        case 'f':
        case 'F':
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
          break;
      }
    });

    // Hash Change Navigation
    window.addEventListener('hashchange', () => {
      parseUrlHash();
      render();
    });
  }

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

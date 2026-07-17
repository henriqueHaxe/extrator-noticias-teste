document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('extract-form');
  const urlInput = document.getElementById('news-url');
  const submitBtn = document.getElementById('submit-btn');
  const btnSpinner = document.getElementById('btn-spinner');
  const btnText = submitBtn.querySelector('span');
  
  const outputContent = document.getElementById('output-content');
  const copyBtn = document.getElementById('copy-btn');
  
  const errorBanner = document.getElementById('error-banner');
  const errorMessage = document.getElementById('error-message');

  // Collapsible History elements
  const historyCard = document.getElementById('history-card');
  const historyToggle = document.getElementById('history-toggle');
  const historyContent = document.getElementById('history-content');
  const historyList = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const compareBtn = document.getElementById('compare-btn');

  // Sidebar Metrics Elements
  const metricsCard = document.getElementById('metrics-card');
  const metricTime = document.getElementById('metric-time');
  const metricInput = document.getElementById('metric-input');
  const metricOutput = document.getElementById('metric-output');
  const metricTotal = document.getElementById('metric-total');

  // Modal Compare Elements
  const compareModal = document.getElementById('compare-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const compareSelectionList = document.getElementById('compare-selection-list');
  const compareChartContainer = document.getElementById('compare-chart-container');

  const defaultPlaceholder = `<p class="placeholder-text">Cole o link da notícia na barra lateral e clique em "Extrair Conteúdo" para ver o texto limpo aqui.</p>`;
  const loadingPlaceholder = `<div class="placeholder-text"><div class="spinner" style="margin: 0 auto 15px auto;"></div>Buscando e transcrevendo a notícia com Inteligência Artificial...</div>`;

  let extractedMarkdownText = '';
  let historyData = [];

  // Initialize History
  loadHistory();

  // Form Submit Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = urlInput.value.trim();
    if (!url) return;

    // Reset UI state
    hideError();
    resetResult(loadingPlaceholder, true);
    setLoading(true);
    
    // Hide metrics card during loading
    metricsCard.style.display = 'none';

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao extrair conteúdo da notícia.');
      }

      // Success
      extractedMarkdownText = data.text;
      
      // Parse markdown to HTML using marked
      outputContent.innerHTML = marked.parse(extractedMarkdownText);
      copyBtn.disabled = false;

      // Show real-time metrics in the sidebar
      if (data.metrics) {
        showCurrentMetrics(data.metrics);
        
        // Add to history list
        const title = extractTitle(extractedMarkdownText, url);
        addHistoryEntry(title, url, data.metrics);
      }

    } catch (err) {
      console.error(err);
      showError(err.message || 'Ocorreu um erro desconhecido.');
      resetResult(defaultPlaceholder, true);
    } finally {
      setLoading(false);
    }
  });

  // Copy to clipboard functionality
  copyBtn.addEventListener('click', async () => {
    if (!extractedMarkdownText) return;

    try {
      await navigator.clipboard.writeText(extractedMarkdownText);
      
      // Visual feedback
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copiado!';
      copyBtn.style.backgroundColor = '#10b981';
      copyBtn.style.color = '#ffffff';
      copyBtn.style.borderColor = '#10b981';

      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.backgroundColor = '';
        copyBtn.style.color = '';
        copyBtn.style.borderColor = '';
      }, 2000);
    } catch (err) {
      console.error('Falha ao copiar:', err);
      alert('Não foi possível copiar o texto automaticamente.');
    }
  });

  // Toggle History Menu Collapsible
  historyToggle.addEventListener('click', () => {
    const isExpanded = historyCard.classList.contains('expanded');
    if (isExpanded) {
      historyCard.classList.remove('expanded');
      historyContent.style.display = 'none';
    } else {
      historyCard.classList.add('expanded');
      historyContent.style.display = 'block';
    }
  });

  // Clear History Handler
  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Deseja limpar todo o histórico de uso?')) {
      historyData = [];
      saveHistory();
      renderHistory();
      compareModal.style.display = 'none';
    }
  });

  // ==========================================
  // COMPARE MODAL LOGIC
  // ==========================================

  // Open Modal
  compareBtn.addEventListener('click', () => {
    // Populate the selection list dynamically
    compareSelectionList.innerHTML = '';
    compareChartContainer.style.display = 'none';
    compareModal.style.display = 'flex';

    if (historyData.length < 2) {
      compareSelectionList.innerHTML = '<p class="no-history">É necessário ter pelo menos 2 extrações no histórico para comparar.</p>';
      return;
    }

    let selectedIds = [];

    historyData.forEach(item => {
      const optionContainer = document.createElement('div');
      optionContainer.className = 'compare-option';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = item.id;
      checkbox.id = `chk-${item.id}`;

      const label = document.createElement('label');
      label.className = 'compare-option-label';
      label.htmlFor = `chk-${item.id}`;

      const seconds = (item.metrics.durationMs / 1000).toFixed(1);
      label.innerHTML = `
        <span class="compare-option-title">${item.title}</span>
        <span class="compare-option-meta">${item.time} • ${seconds}s • ${item.metrics.totalTokens.toLocaleString('pt-BR')} tokens</span>
      `;

      // Checkbox Change Event
      checkbox.addEventListener('change', (e) => {
        const id = parseInt(e.target.value);
        
        if (e.target.checked) {
          if (selectedIds.length >= 2) {
            // Already has 2 selected, reject this check
            e.target.checked = false;
            alert('Você só pode selecionar 2 itens para comparação.');
            return;
          }
          selectedIds.push(id);
          optionContainer.classList.add('checked');
        } else {
          selectedIds = selectedIds.filter(selId => selId !== id);
          optionContainer.classList.remove('checked');
        }

        // Trigger chart render if exactly 2 are selected
        if (selectedIds.length === 2) {
          renderComparisonChart(selectedIds[0], selectedIds[1]);
        } else {
          compareChartContainer.style.display = 'none';
        }
      });

      optionContainer.appendChild(checkbox);
      optionContainer.appendChild(label);
      compareSelectionList.appendChild(optionContainer);
    });
  });

  // Close Modal
  closeModalBtn.addEventListener('click', () => {
    compareModal.style.display = 'none';
  });

  // Close Modal clicking outside content
  window.addEventListener('click', (e) => {
    if (e.target === compareModal) {
      compareModal.style.display = 'none';
    }
  });

  // Heuristic Render CSS Bar Charts
  function renderComparisonChart(id1, id2) {
    const item1 = historyData.find(item => item.id === id1);
    const item2 = historyData.find(item => item.id === id2);

    if (!item1 || !item2) return;

    // --- TIME COMPARISON ---
    const t1 = item1.metrics.durationMs / 1000;
    const t2 = item2.metrics.durationMs / 1000;
    const maxTime = Math.max(t1, t2, 0.1); // Avoid division by zero

    document.getElementById('bar-label-time-1').textContent = item1.title;
    document.getElementById('bar-label-time-2').textContent = item2.title;
    
    document.getElementById('bar-fill-time-1').style.width = `${(t1 / maxTime) * 100}%`;
    document.getElementById('bar-fill-time-2').style.width = `${(t2 / maxTime) * 100}%`;
    
    document.getElementById('bar-val-time-1').textContent = `${t1.toFixed(2)}s`;
    document.getElementById('bar-val-time-2').textContent = `${t2.toFixed(2)}s`;

    // --- TOKENS COMPARISON ---
    const tk1 = item1.metrics.totalTokens;
    const tk2 = item2.metrics.totalTokens;
    const maxTokens = Math.max(tk1, tk2, 1);

    document.getElementById('bar-label-tokens-1').textContent = item1.title;
    document.getElementById('bar-label-tokens-2').textContent = item2.title;
    
    document.getElementById('bar-fill-tokens-1').style.width = `${(tk1 / maxTokens) * 100}%`;
    document.getElementById('bar-fill-tokens-2').style.width = `${(tk2 / maxTokens) * 100}%`;
    
    document.getElementById('bar-val-tokens-1').textContent = `${tk1.toLocaleString('pt-BR')} tks`;
    document.getElementById('bar-val-tokens-2').textContent = `${tk2.toLocaleString('pt-BR')} tks`;

    // Reveal Chart Container
    compareChartContainer.style.display = 'block';
  }

  // ==========================================
  // HELPERS & BUSINESS LOGIC
  // ==========================================
  function setLoading(isLoading) {
    if (isLoading) {
      submitBtn.disabled = true;
      btnSpinner.style.display = 'block';
      btnText.textContent = 'Processando...';
    } else {
      submitBtn.disabled = false;
      btnSpinner.style.display = 'none';
      btnText.textContent = 'Extrair Conteúdo';
    }
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorBanner.style.display = 'flex';
  }

  function hideError() {
    errorBanner.style.display = 'none';
  }

  function resetResult(placeholderContent, disableCopy) {
    outputContent.innerHTML = placeholderContent;
    extractedMarkdownText = '';
    copyBtn.disabled = disableCopy;
  }

  // Display Realtime Metrics in sidebar metrics card
  function showCurrentMetrics(metrics) {
    const seconds = (metrics.durationMs / 1000).toFixed(1);
    
    metricTime.textContent = `${seconds}s`;
    metricInput.textContent = `${metrics.promptTokens.toLocaleString('pt-BR')} tokens`;
    metricOutput.textContent = `${metrics.candidatesTokens.toLocaleString('pt-BR')} tokens`;
    metricTotal.textContent = `${metrics.totalTokens.toLocaleString('pt-BR')} tokens`;
    
    metricsCard.style.display = 'block';
  }

  // Extract article title from markdown or fallback to site domain
  function extractTitle(markdown, fallbackUrl) {
    const lines = markdown.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('# ')) {
        return line.substring(2).trim();
      }
      if (line.startsWith('## ')) {
        return line.substring(3).trim();
      }
    }
    
    // Fallback to domain name
    try {
      const parsedUrl = new URL(fallbackUrl);
      return `Artigo de ${parsedUrl.hostname.replace('www.', '')}`;
    } catch (e) {
      return 'Notícia Extraída';
    }
  }

  // History State Management
  function loadHistory() {
    const stored = localStorage.getItem('news_extractor_history');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        historyData = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        historyData = [];
      }
    } else {
      historyData = [];
    }
    renderHistory();
  }

  function saveHistory() {
    localStorage.setItem('news_extractor_history', JSON.stringify(historyData));
  }

  function addHistoryEntry(title, url, metrics) {
    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    
    const newEntry = {
      id: Date.now(),
      title,
      url,
      time: `${date} às ${time}`,
      metrics: metrics || { durationMs: 0, promptTokens: 0, candidatesTokens: 0, totalTokens: 0 }
    };

    // Prepend to history and limit to 20 entries
    historyData.unshift(newEntry);
    if (historyData.length > 20) {
      historyData.pop();
    }

    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    historyList.innerHTML = '';
    
    if (!Array.isArray(historyData) || historyData.length === 0) {
      historyList.innerHTML = `<p class="no-history">Nenhuma extração realizada ainda.</p>`;
      clearHistoryBtn.style.display = 'none';
      compareBtn.disabled = true; // Disable Compare Button if no history
      return;
    }

    clearHistoryBtn.style.display = 'block';
    
    // Enable compare button if we have at least 2 items in history
    compareBtn.disabled = historyData.length < 2;

    historyData.forEach(item => {
      // Safely access metrics values with default fallbacks to prevent crashes
      const duration = item.metrics && item.metrics.durationMs ? item.metrics.durationMs : 0;
      const seconds = (duration / 1000).toFixed(1);
      
      const promptTokens = item.metrics && item.metrics.promptTokens ? item.metrics.promptTokens : 0;
      const candidatesTokens = item.metrics && item.metrics.candidatesTokens ? item.metrics.candidatesTokens : 0;
      const totalTokens = item.metrics && item.metrics.totalTokens ? item.metrics.totalTokens : 0;

      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      
      historyItem.innerHTML = `
        <div class="history-item-header">
          <span class="history-item-title" title="${item.title}">${item.title}</span>
          <span class="history-item-time">${item.time}</span>
        </div>
        <a href="${item.url}" target="_blank" class="history-item-url" title="${item.url}">${item.url}</a>
        <div class="metrics-grid">
          <div class="metric-badge time">⏱️ ${seconds}s</div>
          <div class="metric-badge tokens">In: ${promptTokens.toLocaleString('pt-BR')}</div>
          <div class="metric-badge tokens">Out: ${candidatesTokens.toLocaleString('pt-BR')}</div>
          <div class="metric-badge tokens">Total: ${totalTokens.toLocaleString('pt-BR')}</div>
        </div>
      `;
      
      historyList.appendChild(historyItem);
    });
  }
});

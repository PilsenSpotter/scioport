(function () {
  const MAX_HISTORY = 10;
  const MAX_STORED_HISTORY = 60;
  const CHAT_HISTORY_STORAGE_KEY = 'scioport.aiChat.history.v1';
  const chatHistory = [];

  const panel = document.getElementById('ai-chat-panel');
  if (!panel) {
    return;
  }

  const studentWork = document.getElementById('student-work');
  const avatarCenter = document.querySelector('.student-work-center');
  if (avatarCenter && !avatarCenter.contains(panel)) {
    avatarCenter.appendChild(panel);
  }

  const messagesContainer = panel.querySelector('#ai-chat-messages');
  const userInput = panel.querySelector('#ai-chat-input');
  const sendButton = panel.querySelector('#ai-chat-send');
  const clearButton = panel.querySelector('#ai-chat-clear');
  const statusElement = panel.querySelector('#ai-chat-status');
  const closeButton = panel.querySelector('#ai-chat-close');
  const titleElement = panel.querySelector('#ai-chat-title');
  const introElement = panel.querySelector('#ai-chat-intro');
  const helpButtons = document.querySelectorAll('[data-ai-help]');
  const defaultTitle = titleElement ? titleElement.textContent : 'Chatbot Gemini Flash 3.5';
  const defaultIntro = introElement ? introElement.textContent : '';
  const defaultInputPlaceholder = userInput ? (userInput.getAttribute('placeholder') || '') : '';
  let activeHelpButton = null;
  let lastHelpPrompt = '';

  function getModelName() {
    return String(window.GEMINI_MODEL_NAME || 'gemini-2.5-flash').trim();
  }

  function getProxyUrl() {
    return String(window.GEMINI_PROXY_URL || '/.netlify/functions/gemini').trim();
  }

  function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const role = entry.role === 'assistant' ? 'assistant' : entry.role === 'user' ? 'user' : '';
    const content = String(entry.content || '').trim();
    if (!role || !content) {
      return null;
    }

    return { role, content };
  }

  function trimChatHistory() {
    if (chatHistory.length > MAX_STORED_HISTORY) {
      chatHistory.splice(0, chatHistory.length - MAX_STORED_HISTORY);
    }
  }

  function loadStoredChatHistory() {
    try {
      const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map(normalizeHistoryEntry)
        .filter(Boolean)
        .slice(-MAX_STORED_HISTORY);
    } catch (error) {
      return [];
    }
  }

  function saveChatHistory() {
    try {
      trimChatHistory();
      window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(chatHistory));
    } catch (error) {
      // Local history is best-effort only.
    }
  }

  function addHistoryEntry(role, content) {
    const entry = normalizeHistoryEntry({ role, content });
    if (!entry) {
      return;
    }

    chatHistory.push(entry);
    saveChatHistory();
  }

  function setStatus(message, isError) {
    if (!statusElement) {
      return;
    }
    statusElement.textContent = message || '';
    statusElement.classList.toggle('ai-chat-status-error', Boolean(isError));
  }

  function syncHelpButtonState(isOpen) {
    helpButtons.forEach(function (button) {
      const isActive = Boolean(isOpen && button === activeHelpButton);
      button.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    });
  }

  function setPanelOpen(isOpen, sourceButton) {
    activeHelpButton = isOpen ? (sourceButton || activeHelpButton) : null;
    panel.hidden = !isOpen;
    panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    panel.classList.toggle('is-open', Boolean(isOpen));
    if (studentWork) {
      studentWork.classList.toggle('is-ai-open', Boolean(isOpen));
    }
    syncHelpButtonState(isOpen);
  }

  function openPanelFromHelp(button) {
    const context = String(button && button.dataset ? button.dataset.aiContext || '' : '').trim();
    const prompt = String(button && button.dataset ? button.dataset.aiPrompt || '' : '').trim();

    setPanelOpen(true, button);

    if (titleElement) {
      titleElement.textContent = context ? `AI průvodce: ${context}` : defaultTitle;
    }

    if (introElement) {
      introElement.textContent = context
        ? `Zeptej se AI na pomoc k tlacitku "${context}". Otazku muzes hned odeslat nebo prepsat.`
        : defaultIntro;
    }

    if (userInput) {
      userInput.setAttribute('placeholder', prompt || defaultInputPlaceholder);
      const currentValue = userInput.value.trim();
      if (prompt && (!currentValue || currentValue === lastHelpPrompt)) {
        userInput.value = prompt;
      }
    }
    lastHelpPrompt = prompt;

    setStatus(context ? `AI napoveda otevrena pro: ${context}.` : 'AI napoveda otevrena.');

    requestAnimationFrame(function () {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (userInput) {
        userInput.focus();
        if (userInput.value.trim()) {
          userInput.select();
        }
      }
    });
  }

  function closePanel() {
    setPanelOpen(false);

    if (titleElement) {
      titleElement.textContent = defaultTitle;
    }

    if (introElement) {
      introElement.textContent = defaultIntro;
    }

    if (userInput) {
      userInput.setAttribute('placeholder', defaultInputPlaceholder);
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function getSafeUrl(value) {
    const url = String(value || '').trim();
    if (/^(https?:|mailto:)/i.test(url)) {
      return url;
    }
    return '';
  }

  function renderInlineStyles(value) {
    return escapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>');
  }

  function renderLinks(value) {
    const text = String(value || '');
    const linkPattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    let html = '';
    let lastIndex = 0;
    let match = linkPattern.exec(text);

    while (match) {
      html += renderInlineStyles(text.slice(lastIndex, match.index));
      const url = getSafeUrl(match[2]);
      if (url) {
        html += `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${renderInlineStyles(match[1])}</a>`;
      } else {
        html += renderInlineStyles(match[0]);
      }
      lastIndex = linkPattern.lastIndex;
      match = linkPattern.exec(text);
    }

    html += renderInlineStyles(text.slice(lastIndex));
    return html;
  }

  function renderInlineMarkdown(value) {
    const text = String(value || '');
    const codePattern = /`([^`]+)`/g;
    let html = '';
    let lastIndex = 0;
    let match = codePattern.exec(text);

    while (match) {
      html += renderLinks(text.slice(lastIndex, match.index));
      html += `<code>${escapeHtml(match[1])}</code>`;
      lastIndex = codePattern.lastIndex;
      match = codePattern.exec(text);
    }

    html += renderLinks(text.slice(lastIndex));
    return html;
  }

  function renderMarkdown(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let listType = '';
    let paragraph = [];

    function flushParagraph() {
      if (!paragraph.length) {
        return;
      }
      html.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    }

    function closeList() {
      if (!listType) {
        return;
      }
      html.push(`</${listType}>`);
      listType = '';
    }

    lines.forEach(function (line) {
      const trimmed = line.trim();
      const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
      const ordered = /^\d+[.)]\s+(.+)$/.exec(trimmed);

      if (!trimmed) {
        flushParagraph();
        closeList();
        return;
      }

      if (unordered || ordered) {
        const nextListType = unordered ? 'ul' : 'ol';
        flushParagraph();
        if (listType !== nextListType) {
          closeList();
          html.push(`<${nextListType}>`);
          listType = nextListType;
        }
        html.push(`<li>${renderInlineMarkdown((unordered || ordered)[1])}</li>`);
        return;
      }

      closeList();
      paragraph.push(trimmed);
    });

    flushParagraph();
    closeList();
    return html.join('');
  }

  function createMessageElement(role, text) {
    const wrapper = document.createElement('div');
    wrapper.className = `ai-chat-message ai-chat-message--${role}`;

    const egg = document.createElement('span');
    egg.className = 'ai-chat-message-role';
    egg.textContent = role === 'assistant' ? 'AI' : 'Ty';

    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-message-bubble';
    if (role === 'assistant') {
      bubble.innerHTML = renderMarkdown(text);
    } else {
      bubble.textContent = text;
    }

    wrapper.appendChild(egg);
    wrapper.appendChild(bubble);
    return wrapper;
  }

  function appendMessage(role, text) {
    if (!messagesContainer) {
      return;
    }
    const message = createMessageElement(role, text);
    messagesContainer.appendChild(message);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function restoreChatHistory() {
    const storedHistory = loadStoredChatHistory();
    if (!storedHistory.length) {
      return false;
    }

    storedHistory.forEach(function (entry) {
      chatHistory.push(entry);
      appendMessage(entry.role, entry.content);
    });
    return true;
  }

  function getConversationContents() {
    return chatHistory.slice(-MAX_HISTORY).map((entry) => ({
      role: entry.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: entry.content }]
    }));
  }

  function extractAssistantText(response) {
    const candidates = response && Array.isArray(response.candidates)
      ? response.candidates
      : [];
    if (Array.isArray(candidates) && candidates.length > 0) {
      const parts = candidates[0] && candidates[0].content && Array.isArray(candidates[0].content.parts)
        ? candidates[0].content.parts
        : [];
      if (parts.length) {
        return parts.map((item) => item.text || '').join('');
      }
    }

    return '';
  }

  function getFriendlyErrorMessage(error) {
    const message = String(error && error.message ? error.message : error || '');
    if (/requests to this api .* are blocked/i.test(message) || /api[_ -]?key.*blocked/i.test(message)) {
      return 'Serverový Gemini API klíč je zablokovaný nebo nemá povolenou Generative Language API. Vyměň ho v nastavení environment variables na hostingu.';
    }
    if (/high demand|temporarily overloaded|503/i.test(message)) {
      return 'Gemini je teď dočasně přetížený. Aplikace zkouší záložní modely, ale pokud chyba zůstane, zkus to prosím za chvíli znovu.';
    }
    return `Chyba Gemini: ${message}`;
  }

  async function sendUserMessage() {
    if (!userInput || !userInput.value.trim()) {
      setStatus('Napiš prosím zprávu.', true);
      return;
    }

    const userText = userInput.value.trim();
    userInput.value = '';
    appendMessage('user', userText);
    addHistoryEntry('user', userText);
    setStatus('Odesílám dotaz do Gemini...');
    userInput.disabled = true;
    sendButton.disabled = true;
    clearButton.disabled = true;

    try {
      const requestBody = {
        model: getModelName(),
        contents: getConversationContents(),
        generationConfig: {
          temperature: 0.45,
          candidateCount: 1,
          maxOutputTokens: 512,
          topP: 0.95,
          topK: 40
        }
      };

      const response = await fetch(getProxyUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let message = errorText || `${response.status} ${response.statusText}`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed && parsed.error && parsed.error.message) {
            message = parsed.error.message;
          } else if (parsed && typeof parsed.error === 'string') {
            message = parsed.error;
          }
        } catch (_) {
          // Keep the raw response text.
        }
        throw new Error(`${response.status} ${response.statusText}: ${message}`);
      }

      const json = await response.json();
      const assistantText = extractAssistantText(json);
      if (!assistantText) {
        throw new Error('Gemini nevrátil žádný text.' );
      }

      appendMessage('assistant', assistantText);
      addHistoryEntry('assistant', assistantText);
      setStatus('Odpověď přijata. Můžeš pokračovat další otázkou.');
    } catch (error) {
      appendMessage('assistant', 'Omlouvám se, nastala chyba při volání Gemini.');
      setStatus(getFriendlyErrorMessage(error), true);
      console.error(error);
    } finally {
      userInput.disabled = false;
      sendButton.disabled = false;
      clearButton.disabled = false;
      userInput.focus();
    }
  }

  function clearChat() {
    chatHistory.length = 0;
    if (messagesContainer) {
      messagesContainer.innerHTML = '';
    }
    try {
      window.localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
    } catch (error) {
      // Local history is best-effort only.
    }
    setStatus('Chat vyčištěn. Napiš další zprávu.');
  }

  const hasStoredHistory = restoreChatHistory();
  setStatus(hasStoredHistory ? 'Historie chatu nactena.' : 'Napiš svoji první zprávu.');

  if (sendButton) {
    sendButton.addEventListener('click', sendUserMessage);
  }

  if (clearButton) {
    clearButton.addEventListener('click', clearChat);
  }

  if (closeButton) {
    closeButton.addEventListener('click', closePanel);
  }

  helpButtons.forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      openPanelFromHelp(button);
    });
  });

  if (userInput) {
    userInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendUserMessage();
      }
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.hidden) {
      closePanel();
    }
  });
})();

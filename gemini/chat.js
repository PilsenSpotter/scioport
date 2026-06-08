(function () {
  const STORAGE_KEY = 'scioport-ai-assistant-instructions';
  const MAX_HISTORY = 10;
  const chatHistory = [];

  const panel = document.getElementById('ai-chat-panel');
  if (!panel) {
    return;
  }

  const messagesContainer = panel.querySelector('#ai-chat-messages');
  const instructionsInput = panel.querySelector('#ai-instructions');
  const userInput = panel.querySelector('#ai-chat-input');
  const sendButton = panel.querySelector('#ai-chat-send');
  const clearButton = panel.querySelector('#ai-chat-clear');
  const statusElement = panel.querySelector('#ai-chat-status');
  const closeButton = panel.querySelector('#ai-chat-close');
  const titleElement = panel.querySelector('#ai-chat-title');
  const introElement = panel.querySelector('#ai-chat-intro');
  const presetButtons = panel.querySelectorAll('[data-ai-preset]');
  const helpButtons = document.querySelectorAll('[data-ai-help]');
  const defaultTitle = titleElement ? titleElement.textContent : 'Chatbot Gemini Flash 3.5';
  const defaultIntro = introElement ? introElement.textContent : '';
  const defaultInputPlaceholder = userInput ? (userInput.getAttribute('placeholder') || '') : '';
  let activeHelpButton = null;
  let lastHelpPrompt = '';

  function getApiKey() {
    return String(window.GEMINI_API_KEY || '').trim();
  }

  function getModelName() {
    return String(window.GEMINI_MODEL_NAME || 'gemini-3.5-flash').trim();
  }

  function getDefaultInstructions() {
    return String(window.GEMINI_DEFAULT_INSTRUCTIONS || '').trim() ||
      'Jsi vzdělávací AI chatbot v aplikaci. Odpovídej jasně, vstřícně a srozumitelně.';
  }

  function buildApiUrl() {
    const apiKey = getApiKey();
    const modelName = getModelName();
    if (!apiKey) {
      return null;
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  }

  function saveInstructions() {
    if (!instructionsInput) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, instructionsInput.value || '');
  }

  function loadInstructions() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (instructionsInput && saved) {
      instructionsInput.value = saved;
    }
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

  function createMessageElement(role, text) {
    const wrapper = document.createElement('div');
    wrapper.className = `ai-chat-message ai-chat-message--${role}`;

    const egg = document.createElement('span');
    egg.className = 'ai-chat-message-role';
    egg.textContent = role === 'assistant' ? 'AI' : 'Ty';

    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-message-bubble';
    bubble.textContent = text;

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

  function getSystemInstruction() {
    const systemPrompt = instructionsInput
      ? String(instructionsInput.value || '').trim() || getDefaultInstructions()
      : getDefaultInstructions();
    return {
      parts: [{ text: systemPrompt }]
    };
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

  async function sendUserMessage() {
    if (!userInput || !userInput.value.trim()) {
      setStatus('Napiš prosím zprávu.', true);
      return;
    }

    const userText = userInput.value.trim();
    userInput.value = '';
    appendMessage('user', userText);
    chatHistory.push({ role: 'user', content: userText });
    setStatus('Odesílám dotaz do Gemini...');
    userInput.disabled = true;
    sendButton.disabled = true;
    clearButton.disabled = true;

    const endpoint = buildApiUrl();
    if (!endpoint) {
      setStatus('Není nastaven Gemini API klíč v souboru gemini/config.js.', true);
      userInput.disabled = false;
      sendButton.disabled = false;
      clearButton.disabled = false;
      return;
    }

    try {
      const requestBody = {
        systemInstruction: getSystemInstruction(),
        contents: getConversationContents(),
        generationConfig: {
          temperature: 0.45,
          candidateCount: 1,
          maxOutputTokens: 512,
          topP: 0.95,
          topK: 40
        }
      };

      const response = await fetch(endpoint, {
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
          message = parsed && parsed.error && parsed.error.message
            ? parsed.error.message
            : message;
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
      chatHistory.push({ role: 'assistant', content: assistantText });
      setStatus('Odpověď přijata. Můžeš pokračovat další otázkou.');
    } catch (error) {
      appendMessage('assistant', 'Omlouvám se, nastala chyba při volání Gemini.');
      setStatus(`Chyba Gemini: ${String(error.message || error)}`, true);
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
    setStatus('Chat vyčištěn. Vlož nové instrukce nebo napiš další zprávu.');
  }

  function applyPreset(event) {
    const button = event.currentTarget;
    if (!button) {
      return;
    }
    const preset = button.dataset.aiPreset || '';
    if (!preset) {
      return;
    }
    instructionsInput.value = preset;
    saveInstructions();
    setStatus('Instrukce byly aktualizovány.');
  }

  loadInstructions();
  setStatus('Vyplň instrukce, potom napiš svoji první zprávu.');

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

  if (instructionsInput) {
    instructionsInput.addEventListener('change', saveInstructions);
    instructionsInput.addEventListener('input', saveInstructions);
  }

  presetButtons.forEach(function (button) {
    button.addEventListener('click', applyPreset);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.hidden) {
      closePanel();
    }
  });
})();

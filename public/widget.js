(function () {
  'use strict';

  // const WIDGET_API = 'http://localhost:5000/api/widget';
  const WIDGET_API = 'https://camero.myabmedia.com/api/widget';


  const fetchWithTimeout = (url, opts = {}, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    opts.signal = controller.signal;
    return fetch(url, opts).finally(() => clearTimeout(id));
  };

  class ChatWidget {
    constructor(config) {
      this.apiKey = config.apiKey;
      this.apiUrl = (config.apiUrl || WIDGET_API).replace(/\/$/, '');
      this.sessionId = null;
      this.chatName = null;
      this.config = null;
      this.isOpen = false;
      this.isInitialized = false;
      this.messages = [];

      // Session storage keys
      this.sessionIdKey = 'ai_chat_sessionId';
      this.chatNameKey = 'ai_chat_chatName';

      // Load saved session from localStorage
      this.sessionId = localStorage.getItem(this.sessionIdKey);
      this.chatName = localStorage.getItem(this.chatNameKey);

      console.log('💬 Chat Widget Loaded');
      if (this.sessionId) {
        console.log('📦 Existing session found:', this.chatName || this.sessionId);
      }

      this.injectStyles();
      this.renderChatBubble();
      this.checkAndMaybeAutoRestore()
      // Auto-check for existing session
      // setTimeout(() => this.checkAndMaybeAutoRestore(), 500);
    }

    // Inject all widget styles
    injectStyles() {
      if (document.getElementById('chat-widget-styles')) return;

      const style = document.createElement('style');
      style.id = 'chat-widget-styles';
      style.textContent = `
        #chat-bubble:hover { transform: scale(1.1); }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px);} to {opacity:1; transform:translateY(0);} }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        #chat-messages::-webkit-scrollbar { width: 6px; }
        #chat-messages::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        #chat-messages::-webkit-scrollbar-thumb { background: #17876E; border-radius: 10px; }
        .typing-indicator { display:flex; gap:4px; padding:10px 0; justify-content: flex-start; }
        .typing-indicator span { width:8px; height:8px; background:#999; border-radius:50%; animation:bounce 1.4s infinite; }
        .typing-indicator span:nth-child(2) { animation-delay:0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay:0.4s; }
        @keyframes bounce { 0%,60%,100% { transform: translateY(0);} 30% { transform: translateY(-8px);} }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        
        /* Message formatting styles */
        .chat-msg-content { line-height: 1.6; word-wrap: break-word; font-size: 14px; }
        .chat-msg-content p { margin: 0 0 10px 0; }
        .chat-msg-content p:last-child { margin-bottom: 0; }
        .chat-msg-content strong, .chat-msg-content b { font-weight: 700; color: #222; }
        .chat-msg-content em, .chat-msg-content i { font-style: italic; }
        .chat-msg-content ul, .chat-msg-content ol { margin: 10px 0; padding-left: 0; list-style: none; }
        .chat-msg-content li { margin: 8px 0; padding-left: 16px; position: relative; }
        .chat-msg-content li:before { content: "•"; position: absolute; left: 0; color: #17876E; font-weight: bold; }
        .chat-msg-content code { background: rgba(0,0,0,0.08); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
        .chat-msg-content a { color: #17876E; text-decoration: underline; }
        .chat-msg-content blockquote { border-left: 3px solid #17876E; margin: 10px 0; padding-left: 12px; font-style: italic; color: #666; }
        
        /* Product Carousel Styles */
        .product-carousel-wrapper { margin-top: 12px; }
        .product-carousel { 
          display: flex; 
          gap: 10px; 
          overflow-x: auto; 
          padding: 8px 4px; 
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }
        .product-carousel::-webkit-scrollbar { height: 4px; }
        .product-carousel::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .product-carousel::-webkit-scrollbar-thumb { background: #17876E; border-radius: 10px; }
        .product-card {
          flex: 0 0 160px;
          scroll-snap-align: start;
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
          border: 1px solid #eee;
        }
        .product-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        .product-card img { width: 100%; height: 100px; object-fit: cover; background: #f5f5f5; }
        .product-card-body { padding: 10px; }
        .product-card-title { font-weight: 600; font-size: 12px; margin-bottom: 4px; color: #333; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 32px; }
        .product-card-price { font-weight: 700; font-size: 13px; color: #17876E; margin-bottom: 6px; }
        .product-card-btn { display: block; width: 100%; padding: 6px; background: #17876E; color: white; border: none; border-radius: 5px; font-size: 11px; font-weight: 500; cursor: pointer; text-align: center; text-decoration: none; transition: background 0.2s; }
        .product-card-btn:hover { background: #14725d; }
        
        /* No image placeholder */
        .product-img-placeholder { 
          width: 100%; 
          height: 100px; 
          background: linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%); 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          color: #999;
          font-size: 28px;
        }
      `;
      document.head.appendChild(style);
    }

    // Format message text with markdown-like syntax
    formatMessage(text) {
      if (!text) return '';

      let formatted = String(text);

      // First, escape HTML to prevent XSS
      formatted = formatted
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Process bold: **text** (do this before italic to avoid conflicts)
      formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

      // Process italic: *text* (single asterisk)
      formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

      // Process inline code: `code`
      formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

      // Process links: [text](url)
      formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

      // Split into lines for list processing
      const lines = formatted.split('\n');
      const processedLines = [];
      let inList = false;

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        // Check for bullet list items (- or *)
        const bulletMatch = line.match(/^[-•*]\s+(.+)$/);
        // Check for numbered list items
        const numberMatch = line.match(/^\d+[.)]\s+(.+)$/);

        if (bulletMatch) {
          if (!inList) {
            processedLines.push('<ul>');
            inList = true;
          }
          processedLines.push('<li>' + bulletMatch[1] + '</li>');
        } else if (numberMatch) {
          if (!inList) {
            processedLines.push('<ul>');
            inList = true;
          }
          processedLines.push('<li>' + numberMatch[1] + '</li>');
        } else {
          if (inList) {
            processedLines.push('</ul>');
            inList = false;
          }
          if (line) {
            processedLines.push('<p>' + line + '</p>');
          }
        }
      }

      // Close any open list
      if (inList) {
        processedLines.push('</ul>');
      }

      formatted = processedLines.join('');

      // Clean up empty paragraphs
      formatted = formatted.replace(/<p><\/p>/g, '');

      // If nothing was wrapped, wrap in a simple span
      if (!formatted.includes('<')) {
        formatted = '<p>' + formatted + '</p>';
      }

      return formatted;
    }

    // Parse products from AI response if present
    parseProducts(text) {
      // Look for JSON product array in the response
      const productMatch = text.match(/\[PRODUCTS\]([\s\S]*?)\[\/PRODUCTS\]/);
      if (!productMatch) return { text, products: [] };

      try {
        const products = JSON.parse(productMatch[1]);
        const cleanText = text.replace(/\[PRODUCTS\][\s\S]*?\[\/PRODUCTS\]/, '').trim();
        return { text: cleanText, products };
      } catch (e) {
        console.warn('Failed to parse products:', e);
        return { text, products: [] };
      }
    }

    // Render product carousel HTML
    renderProductCarousel(products) {
      if (!products || products.length === 0) return '';

      const cardsHtml = products.map(product => {
        const imageHtml = product.imageUrl
          ? `<img src="${product.imageUrl}" alt="${product.name || 'Product'}" onerror="this.parentElement.innerHTML='<div class=\\'product-img-placeholder\\'>📦</div>'">`
          : `<div class="product-img-placeholder">📦</div>`;

        const priceHtml = product.price
          ? `<div class="product-card-price">$${parseFloat(product.price).toFixed(2)}</div>`
          : '';

        const btnHtml = product.url
          ? `<a href="${product.url}" target="_blank" class="product-card-btn">View Details →</a>`
          : '';

        return `
          <div class="product-card">
            ${imageHtml}
            <div class="product-card-body">
              <div class="product-card-title">${product.name || 'Product'}</div>
              ${priceHtml}
              ${btnHtml}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="product-carousel-wrapper">
          <div style="font-size:11px; color:#888; margin-bottom:6px;">📦 Products</div>
          <div class="product-carousel">${cardsHtml}</div>
        </div>
      `;
    }

    // Save session to localStorage
    saveSession(sessionId, chatName) {
      this.sessionId = sessionId;
      this.chatName = chatName;
      localStorage.setItem(this.sessionIdKey, sessionId);
      if (chatName) {
        localStorage.setItem(this.chatNameKey, chatName);
      }
    }

    _buildHeaders() {
      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      };
      if (this.sessionId) {
        headers['x-session-id'] = this.sessionId;
      }
      return headers;
    }

    renderChatBubble() {
      const existingWidget = document.getElementById('ai-chat-widget');
      if (existingWidget) existingWidget.remove();

      const widgetHTML = `
        <div id="ai-chat-widget" style="position: fixed; bottom: 20px; right: 20px; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div id="chat-bubble" style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #17876E 0%, #14a085 100%); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 20px rgba(23, 135, 110, 0.4); transition: all 0.3s ease;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div id="chat-window-container" style="display: none; position: absolute; bottom: 80px; right: 0;"></div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', widgetHTML);
      const bubble = document.getElementById('chat-bubble');
      if (bubble) bubble.addEventListener('click', () => this.handleBubbleClick());
    }

    renderNudge(nudge) {
      console.log('🔔 renderNudge called with:', nudge);
      if (!nudge || !nudge.isActive) {
        console.log('❌ Nudge invalid or inactive');
        return;
      }

      const existingNudge = document.getElementById('ai-nudge-popup');
      if (existingNudge) existingNudge.remove();

      this.showNudgeUI(nudge);
    }

    showNudgeUI(nudge) {
      // ❌ koi isOpen check nahi
      const themeColor = this.config?.interfaceColor || '#17876E';
      const position = nudge.appearance?.position || 'bottom-right';

      const bottomOffset = '90px';
      const rightOffset = '20px';

      const nudgeHTML = `
    <div id="ai-nudge-popup" style="position: fixed; bottom: ${bottomOffset}; right: ${rightOffset}; width: 300px; background: white; border-radius: 12px; box-shadow: 0 5px 20px rgba(0,0,0,0.15); z-index: 999998; animation: slideUp 0.5s ease; border-left: 4px solid ${themeColor}; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <button id="close-nudge" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: #999; cursor: pointer; font-size: 18px; line-height: 1;">×</button>
      <div style="font-size: 14px; color: #333; margin-bottom: 12px; line-height: 1.5;">${this.formatMessage(nudge.message)}</div>
      <button id="nudge-cta" style="background: ${themeColor}; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%;">Ask Me Anything</button>
    </div>
  `;

      document.body.insertAdjacentHTML('beforeend', nudgeHTML);

      document.getElementById('close-nudge').onclick = (e) => {
        e.stopPropagation();
        document.getElementById('ai-nudge-popup').remove();
        // ⚠️ yahan kuch bhi localStorage/sessionStorage mat daalna
      };

      document.getElementById('nudge-cta').onclick = () => {
        document.getElementById('ai-nudge-popup').remove();
        this.handleBubbleClick();
      };
    }


    handleBubbleClick() {
      if (!this.isOpen) {
        this.isOpen = true;
        if (!this.isInitialized) this.initChat();
        else this.showChatWindow();
      } else {
        this.isOpen = false;
        this.hideChatWindow();
      }
    }

    async checkAndMaybeAutoRestore() {
      if (!this.apiKey) return;  // sirf apiKey check karo

      try {
        const body = {
          pageUrl: window.location.href,
          referrer: document.referrer
        };

        // agar sessionId hai to bhej do, warna mat bhejo – but call hamesha karo
        if (this.sessionId) {
          body.sessionId = this.sessionId;
        }

        const resp = await fetchWithTimeout(
          `${this.apiUrl}/init`,
          {
            method: 'POST',
            headers: this._buildHeaders(),
            body: JSON.stringify(body)
          },
          5000
        );

        if (!resp.ok) return;
        const data = await resp.json();
        console.log('🔍 Auto-restore response:', data);

        if (data.success && data.data) {
          // config set karo (colors, etc)
          this.config = data.data.config || this.config;

          // agar server ne new sessionId diya ho to save kar lo
          if (data.data.sessionId) {
            this.saveSession(data.data.sessionId, data.data.chatName);
          }

          // agar history hai to restore bhi kar sakte ho (optional)
          if (data.data.conversation && data.data.conversation.length > 0) {
            this.isInitialized = true;
            // sirf tab window show karni ho to yaha decide karna – agar nahi chahiye to skip
            // this.renderChatWindow();
            // this.renderHistory(data.data.conversation);
          }

          // ⭐ IMPORTANT: yahan se nudge hamesha try karo
          if (data.data.nudge) {
            this.renderNudge(data.data.nudge);
          }
        }
      } catch (err) {
        console.warn('Session check failed:', err);
      }
    }


    async initChat() {
      this.showLoading();
      try {
        const response = await fetchWithTimeout(
          `${this.apiUrl}/init`,
          {
            method: 'POST',
            headers: this._buildHeaders(),
            body: JSON.stringify({
              sessionId: this.sessionId,
              pageUrl: window.location.href,
              referrer: document.referrer
            })
          },
          10000
        );

        if (!response.ok) {
          this.showError(`Init failed (${response.status})`);
          return;
        }

        const data = await response.json();
        console.log('🚀 Init response:', data);
        if (data.success) {
          this.saveSession(data.data.sessionId, data.data.chatName);
          this.config = data.data.config;
          this.isInitialized = true;
          this.renderChatWindow();

          if (data.data.conversation && data.data.conversation.length > 0) {
            this.renderHistory(data.data.conversation);
          }

          if (data.data.nudge) {
            this.renderNudge(data.data.nudge);
          }
        } else {
          this.showError(data.message || 'Failed to initialize chat');
        }
      } catch (error) {
        console.error('Init Error:', error);
        this.showError('Connection error. Please try again.');
      }
    }

    renderHistory(messages) {
      const messagesDiv = document.getElementById('chat-messages');
      if (!messagesDiv) return;

      // Remove quick questions when loading history
      const quickQ = document.getElementById('quick-questions');
      if (quickQ) quickQ.remove();

      messages.forEach((msg) => {
        this.appendMessageToUI(msg.role, msg.message, false);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    showLoading() {
      const container = document.getElementById('chat-window-container');
      if (!container) return;
      container.style.display = 'block';
      container.innerHTML = `
        <div style="width: 380px; height: 600px; background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 1rem;">
          <div style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #17876E; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <div style="color: #666; font-size: 14px;">Loading chat...</div>
        </div>
      `;
    }

    showError(msg) {
      const container = document.getElementById('chat-window-container');
      if (!container) return;
      container.innerHTML = `
        <div style="width: 380px; padding: 40px 20px; background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); text-align: center;">
          <div style="font-size: 40px; margin-bottom: 16px;">😕</div>
          <div style="color: #e74c3c; font-weight: 500; margin-bottom: 8px;">Connection Error</div>
          <div style="color: #666; font-size: 13px;">${msg}</div>
          <button onclick="location.reload()" style="margin-top: 16px; padding: 8px 20px; background: #17876E; color: white; border: none; border-radius: 6px; cursor: pointer;">Try Again</button>
        </div>
      `;
    }

    renderChatWindow() {
      const container = document.getElementById('chat-window-container');
      if (!container) return;
      const botName = (this.config?.assistantName || 'AI Assistant').toUpperCase();

      // Suggestions from backend
      const suggestions = Array.isArray(this.config?.suggestedQuestions)
        ? this.config.suggestedQuestions
        : [];
      let quickQuestionsHtml = '';

      if (suggestions.length) {
        const buttonsHtml = suggestions
          .map((q) => {
            const safeQ = q.replace(/"/g, '&quot;');
            return `
              <button class="quick-question-btn"
                      data-question="${safeQ}"
                      style="display:block;width:100%;text-align:left;margin:4px 0;padding:10px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;cursor:pointer;transition:all 0.2s;color:#333;">
                ${safeQ}
              </button>`;
          })
          .join('');

        quickQuestionsHtml = `
          <div id="quick-questions" style="margin-top:12px; padding: 0 4px;">
            <div style="font-size:12px; color:#888; margin-bottom:8px; font-weight:500;">💡 Quick Questions</div>
            ${buttonsHtml}
          </div>
        `;
      }

      // Avatar handling
      let avatarFileName = this.config?.avatar || 'a1.svg';

      if (avatarFileName.startsWith('/loginassets/')) {
        avatarFileName = avatarFileName.substring(13);
      } else if (avatarFileName.startsWith('avatar-')) {
        const avatarNumber = avatarFileName.replace('avatar-', '').replace('.png', '');
        avatarFileName = `a${avatarNumber}.svg`;
      }

      const avatarPath = `${this.apiUrl.replace('/api/widget', '')}/loginassets/${avatarFileName}`;
      const themeColor = this.config?.interfaceColor || '#17876E';

      container.style.display = 'block';
      container.innerHTML = `
        <div style="width: 380px; height: 600px; background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); display: flex; flex-direction: column; animation: slideUp 0.3s ease; overflow: hidden;">
          <div style="padding: 14px 16px; background: linear-gradient(135deg, ${themeColor} 0%, ${this.adjustColor(themeColor, 15)} 100%); color: white; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <img src="${avatarPath}" alt="Assistant" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.1);">
              <div>
                <div style="font-weight: 600; font-size: 15px;">${botName}</div>
                <div style="font-size: 11px; opacity: 0.9; display: flex; align-items: center; gap: 4px;">
                  <span style="width:6px;height:6px;background:#4ade80;border-radius:50%;display:inline-block;"></span> Online
                </div>
              </div>
            </div>
            <button id="close-chat" style="background:rgba(255,255,255,0.15);border:none;width:32px;height:32px;border-radius:50%;color:white;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">×</button>
          </div>
          <div id="chat-messages" style="flex: 1; padding: 16px; overflow-y: auto; background: #f8f9fa;">
            <div class="message" style="animation: fadeIn 0.3s ease; display: flex; justify-content: flex-start; margin-bottom: 12px;">
              <div style="background: white; padding: 14px 16px; border-radius: 4px 16px 16px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); max-width: 85%; border: 1px solid #eee;">
                <div class="chat-msg-content">${this.formatMessage(this.config?.welcomeMessage || "Hi! I'm your AI assistant. How can I help you today?")}</div>
              </div>
            </div>
            ${quickQuestionsHtml}
          </div>
          <div id="typing-placeholder" style="padding: 0 16px; background: #f8f9fa;"></div>
          <div style="padding: 12px 16px; border-top: 1px solid #eee; display: flex; gap: 10px; background: white;">
            <input id="chat-input" type="text" placeholder="Type your message..." style="flex:1; padding:12px 16px; border:1px solid #e0e0e0; border-radius:24px; outline:none; font-size:14px; transition:border-color 0.2s, box-shadow 0.2s;" onfocus="this.style.borderColor='${themeColor}';this.style.boxShadow='0 0 0 3px ${themeColor}22'" onblur="this.style.borderColor='#e0e0e0';this.style.boxShadow='none'" />
            <button id="send-btn" style="padding:12px 18px; background:${themeColor}; color:white; border:none; border-radius:24px; cursor:pointer; font-weight:600; font-size:14px; transition:opacity 0.2s, transform 0.1s;" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">Send</button>
          </div>
        </div>
      `;

      document.getElementById('close-chat').onclick = () => {
        this.isOpen = false;
        this.hideChatWindow();
      };
      document.getElementById('send-btn').onclick = () => this.sendMessage();
      document.getElementById('chat-input').onkeypress = (e) => {
        if (e.key === 'Enter') this.sendMessage();
      };

      // Attach quick question click listeners
      const quickButtons = container.querySelectorAll('.quick-question-btn');
      quickButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const q = btn.getAttribute('data-question');
          this.sendQuickQuestion(q);
        });
        btn.addEventListener('mouseover', () => {
          btn.style.background = '#f0f0f0';
          btn.style.borderColor = '#17876E';
        });
        btn.addEventListener('mouseout', () => {
          btn.style.background = '#fff';
          btn.style.borderColor = '#e5e7eb';
        });
      });
    }

    // Adjust color brightness
    adjustColor(color, percent) {
      const num = parseInt(color.replace('#', ''), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) + amt;
      const G = (num >> 8 & 0x00FF) + amt;
      const B = (num & 0x0000FF) + amt;
      return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    }

    showChatWindow() {
      const c = document.getElementById('chat-window-container');
      if (c) c.style.display = 'block';
    }

    hideChatWindow() {
      const c = document.getElementById('chat-window-container');
      if (c) c.style.display = 'none';
    }

    appendMessageToUI(role, text, removeQuickQ = true) {
      const messagesDiv = document.getElementById('chat-messages');
      if (!messagesDiv) return;

      // Remove quick questions on first message
      if (removeQuickQ) {
        const quickQ = document.getElementById('quick-questions');
        if (quickQ) quickQ.remove();
      }

      const div = document.createElement('div');
      div.className = 'message';
      div.style.cssText = `display:flex; margin-bottom:12px; justify-content:${role === 'user' ? 'flex-end' : 'flex-start'}; animation: fadeIn 0.3s ease;`;

      const themeColor = this.config?.interfaceColor || '#17876E';

      if (role === 'user') {
        // User message
        div.innerHTML = `
          <div style="background:${themeColor}; color:#fff; padding:12px 16px; border-radius:16px 16px 4px 16px; max-width:85%; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <div class="chat-msg-content" style="color:#fff;">${this.formatMessage(text)}</div>
          </div>
        `;
      } else {
        // Bot message - check for products
        const { text: cleanText, products } = this.parseProducts(text);
        const productCarouselHtml = this.renderProductCarousel(products);

        div.innerHTML = `
          <div style="background:white; color:#333; padding:14px 16px; border-radius:4px 16px 16px 16px; max-width:85%; box-shadow:0 1px 3px rgba(0,0,0,0.08); border: 1px solid #eee;">
            <div class="chat-msg-content">${this.formatMessage(cleanText)}</div>
            ${productCarouselHtml}
          </div>
        `;
      }

      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    showTypingIndicator() {
      const placeholder = document.getElementById('typing-placeholder');
      if (placeholder) {
        placeholder.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; padding:10px 0;">
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span style="font-size:12px; color:#888;">Typing...</span>
          </div>
        `;
      }
    }

    hideTypingIndicator() {
      const placeholder = document.getElementById('typing-placeholder');
      if (placeholder) {
        placeholder.innerHTML = '';
      }
    }

    async _sendToServer(message) {
      try {
        const response = await fetchWithTimeout(
          `${this.apiUrl}/chat`,
          {
            method: 'POST',
            headers: this._buildHeaders(),
            body: JSON.stringify({
              sessionId: this.sessionId,
              chatName: this.chatName,
              message,
              pageUrl: window.location.href
            })
          },
          30000
        );

        const data = await response.json();
        if (data.success) {
          // Check if products are included in response
          const botMessage = data.data.message;
          const products = data.data.products || [];

          // If products exist, append them in special format
          let finalMessage = botMessage;
          if (products.length > 0) {
            finalMessage += `\n[PRODUCTS]${JSON.stringify(products)}[/PRODUCTS]`;
          }

          this.appendMessageToUI('bot', finalMessage);

          if (data.data.sessionId) {
            this.saveSession(data.data.sessionId, data.data.chatName || this.chatName);
          }
        } else {
          this.appendMessageToUI('bot', data.message || 'Sorry, I encountered an error. Please try again.');
        }
      } catch (error) {
        console.error(error);
        this.appendMessageToUI('bot', 'Connection error. Please check your internet and try again.');
      } finally {
        this.hideTypingIndicator();
      }
    }

    async sendMessage() {
      const input = document.getElementById('chat-input');
      if (!input) return;
      const message = input.value.trim();
      if (!message) return;

      this.appendMessageToUI('user', message);
      input.value = '';

      this.showTypingIndicator();
      await this._sendToServer(message);
    }

    async sendQuickQuestion(question) {
      if (!question) return;
      this.appendMessageToUI('user', question);
      this.showTypingIndicator();
      await this._sendToServer(question);
    }
  }

  window.initAIChatWidget = function (config) {
    if (!config?.apiKey) return console.error('API key required');
    new ChatWidget(config);
  };
})();

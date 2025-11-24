(function () {
  'use strict';

  const WIDGET_API = 'http://localhost:5000/api/widget'; // Adjust port if needed

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
      this.config = null;
      this.isOpen = false;
      this.isInitialized = false;
      this.messages = [];
      
      // 1. Initialize publicIp as null
      this.publicIp = null; 

      // Stable visitorId
      this.localVisitorIdKey = 'ai_chat_visitorId';
      this.clientVisitorId = localStorage.getItem(this.localVisitorIdKey);
      if (!this.clientVisitorId) {
        this.clientVisitorId = 'client-' + Math.random().toString(36).slice(2, 12);
        localStorage.setItem(this.localVisitorIdKey, this.clientVisitorId);
      }

      console.log('💬 Chat Widget Loaded');
      
      // 2. Call the IP Fetcher immediately
      this.fetchIp(); 

      this.renderChatBubble();
      // Auto-open check (optional, runs after IP fetch)
      setTimeout(() => this.checkIpAndMaybeAutoOpen(), 1000);
    }

    // --- NEW FUNCTION TO GET IP FROM IPIFY ---
    async fetchIp() {
        try {
            console.log('🌍 Fetching Public IP...');
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            if (data && data.ip) {
                this.publicIp = data.ip;
                console.log('✅ Public IP Found:', this.publicIp);
            }
        } catch (error) {
            console.warn('❌ Failed to fetch IP from ipify:', error);
            // If ipify fails, we leave it null, backend will try to detect
            this.publicIp = null; 
        }
    }

    _buildHeaders() {
      return {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'x-visitor-id': this.clientVisitorId
      };
    }

    renderChatBubble() {
      const existingWidget = document.getElementById('ai-chat-widget');
      if (existingWidget) existingWidget.remove();

      const widgetHTML = `
        <div id="ai-chat-widget" style="position: fixed; bottom: 20px; right: 20px; z-index: 999999; font-family: system-ui, sans-serif;">
          <div id="chat-bubble" style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #17876E 0%, #14a085 100%); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 20px rgba(23, 135, 110, 0.4); transition: all 0.3s ease;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div id="chat-window-container" style="display: none; position: absolute; bottom: 80px; right: 0;"></div>
        </div>
      `;

      if (!document.getElementById('chat-widget-styles')) {
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
        `;
        document.head.appendChild(style);
      }

      document.body.insertAdjacentHTML('beforeend', widgetHTML);
      const bubble = document.getElementById('chat-bubble');
      if (bubble) bubble.addEventListener('click', () => this.handleBubbleClick());
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

    async checkIpAndMaybeAutoOpen() {
      if (!this.apiKey) return;
      
      // Wait a bit if IP is not fetched yet
      if (!this.publicIp) {
          await new Promise(r => setTimeout(r, 500));
      }

      try {
        // Pass IP in Query String
        const url = `${this.apiUrl}/init?ip=${encodeURIComponent(this.publicIp || '')}`;
        
        const resp = await fetchWithTimeout(url, {
          method: 'POST', // Changed to POST to match your Controller
          headers: this._buildHeaders(),
          body: JSON.stringify({
             ip: this.publicIp, // Send IP in body too
             pageUrl: window.location.href
          })
        }, 5000);

        if (!resp.ok) return;
        const data = await resp.json();

        // If previous chat exists
        if (data.exists && data.data?.conversation?.length > 0) {
          console.log('🔄 Auto-restoring chat history...');
          this.sessionId = data.data.sessionId;
          this.config = data.data.config;
          this.isInitialized = true;
          this.renderChatWindow();
          this.renderHistory(data.data.conversation);
        }
      } catch (err) {
        console.warn('Auto-open check failed:', err);
      }
    }

    async initChat() {
      this.showLoading();
      try {
        // 3. SEND IP TO BACKEND IN INIT
        const response = await fetchWithTimeout(`${this.apiUrl}/init`, {
          method: 'POST',
          headers: this._buildHeaders(),
          body: JSON.stringify({
            ip: this.publicIp || '', // <--- Important
            pageUrl: window.location.href,
            referrer: document.referrer
          })
        }, 10000);

        if (!response.ok) {
          this.showError(`Init failed (${response.status})`);
          return;
        }

        const data = await response.json();
        if (data.success) {
          this.sessionId = data.data.sessionId;
          this.config = data.data.config;
          this.isInitialized = true;
          this.renderChatWindow();

          // Check for history
          if (data.data.conversation && data.data.conversation.length > 0) {
             this.renderHistory(data.data.conversation);
          }
        } else {
          this.showError(data.message || 'Failed to initialize chat');
        }
      } catch (error) {
        console.error('Init Error:', error);
        this.showError('Connection error. Please try again.');
      }
    }

    // Helper to render list of messages
    renderHistory(messages) {
        const messagesDiv = document.getElementById('chat-messages');
        if (!messagesDiv) return;
        
        messages.forEach(msg => {
            this.appendMessageToUI(msg.role, msg.message);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    showLoading() {
      const container = document.getElementById('chat-window-container');
      container.style.display = 'block';
      container.innerHTML = `<div style="width: 380px; height: 600px; background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 1rem;"><div style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #17876E; border-radius: 50%; animation: spin 1s linear infinite;"></div></div>`;
    }

    showError(msg) {
       const container = document.getElementById('chat-window-container');
       container.innerHTML = `<div style="padding:20px;background:white;height:200px;">Error: ${msg}</div>`;
    }

    renderChatWindow() {
        const container = document.getElementById('chat-window-container');
        // *** MODIFIED: Capitalized Bot Name ***
        const botName = (this.config.assistantName || 'AI Assistant').toUpperCase(); 
        
        // Get avatar path - handle different formats correctly with full URL
        let avatarFileName = this.config.avatar || 'a1.svg';
        

        
        if (avatarFileName.startsWith('/loginassets/')) {
            // Already has the full path, just use it as is
            avatarFileName = avatarFileName.substring(13); // Remove '/loginassets/' prefix
        } else if (avatarFileName.startsWith('avatar-')) {
            // Convert avatar-1.png format to a1.svg format
            const avatarNumber = avatarFileName.replace('avatar-', '').replace('.png', '');
            avatarFileName = `a${avatarNumber}.svg`;
        }
        
        // Use full URL path for avatar
        const avatarPath = `${this.apiUrl.replace('/api/widget', '')}/loginassets/${avatarFileName}`;

        container.innerHTML = `
          <div style="width: 380px; height: 600px; background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); display: flex; flex-direction: column; animation: slideUp 0.3s ease;">
            <div style="padding: 1rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <img src="${avatarPath}" alt="Assistant Avatar" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                <div style="font-weight: bold;">${botName}</div>
              </div>
              <button id="close-chat" style="background:none;border:none;font-size:20px;cursor:pointer;">×</button>
            </div>
            <div id="chat-messages" style="flex: 1; padding: 1rem; overflow-y: auto;">
               <div class="message" style="animation: fadeIn 0.3s ease;">
                 <div style="background: white; padding: 12px 16px; border-radius: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                   ${this.config.welcomeMessage}
                 </div>
               </div>
            </div>
            <div id="typing-placeholder" style="padding: 0 1rem;"></div>
            <div style="padding: 1rem; border-top: 1px solid #eee; display: flex; gap: 8px;">
              <input id="chat-input" type="text" placeholder="Type..." style="flex:1; padding:10px; border:1px solid #ddd; border-radius:8px;" />
              <button id="send-btn" style="padding:10px 15px; background:${this.config.interfaceColor}; color:white; border:none; border-radius:8px; cursor:pointer;">Send</button>
            </div>
          </div>
        `;
        
        document.getElementById('close-chat').onclick = () => { this.isOpen = false; this.hideChatWindow(); };
        document.getElementById('send-btn').onclick = () => this.sendMessage();
        document.getElementById('chat-input').onkeypress = (e) => { if(e.key === 'Enter') this.sendMessage(); };
    }
    
    showChatWindow() { document.getElementById('chat-window-container').style.display = 'block'; }
    hideChatWindow() { document.getElementById('chat-window-container').style.display = 'none'; }
    
    appendMessageToUI(role, text) {
        const messagesDiv = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'message';
        div.style.cssText = `display:flex; margin-bottom:10px; justify-content:${role === 'user' ? 'flex-end' : 'flex-start'}`;
        const bg = role === 'user' ? (this.config.interfaceColor || '#17876E') : '#fff';
        const color = role === 'user' ? '#fff' : '#000';
        div.innerHTML = `<div style="background:${bg}; color:${color}; padding:10px 14px; border-radius:12px; max-width:85%; box-shadow:0 1px 2px rgba(0,0,0,0.1);">${text}</div>`;
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // --- NEW TYPING INDICATOR METHODS ---
    showTypingIndicator() {
        const placeholder = document.getElementById('typing-placeholder');
        if (placeholder) {
            placeholder.innerHTML = `
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
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

    async sendMessage() {
      const input = document.getElementById('chat-input');
      const message = input.value.trim();
      if (!message) return;

      this.appendMessageToUI('user', message);
      input.value = '';
      
      this.showTypingIndicator();

      try {
        // 4. SEND IP TO BACKEND IN SENDMESSAGE
        const response = await fetchWithTimeout(`${this.apiUrl}/chat`, {
          method: 'POST',
          headers: this._buildHeaders(),
          body: JSON.stringify({ 
            sessionId: this.sessionId, 
            message, 
            ip: this.publicIp || '', // <--- Important
            pageUrl: window.location.href 
          })
        }, 20000);

        this.hideTypingIndicator(); // Hide indicator when response starts arriving

        const data = await response.json();
        if (data.success) {
          this.appendMessageToUI('bot', data.data.message);
          // If backend corrected the sessionId, update it
          if(data.data.sessionId) this.sessionId = data.data.sessionId;
        } else {
            // Handle API specific errors if needed
            this.appendMessageToUI('bot', data.message || 'An error occurred processing your request.');
        }
      } catch (error) {
        console.error(error);
        this.hideTypingIndicator(); 
        this.appendMessageToUI('bot', 'Connection error. Could not get a response.');
      }
    }
  }

  window.initAIChatWidget = function (config) {
    if (!config?.apiKey) return console.error('API key required');
    new ChatWidget(config);
  };
})();
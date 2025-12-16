(function () {
  'use strict';
  const isLocalhost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
  const WIDGET_API = isLocalhost
    ? 'http://localhost:4000/api/widget'
    : 'https://camero.myabmedia.com/api/widget';

  const TRANSLATIONS = {
    en: {
      typeMessage: 'Type your message...',
      send: 'Send',
      online: 'Online',
      typing: 'Typing...',
      connectionError: 'Connection Error',
      tryAgain: 'Try Again',
      initFailed: 'Failed to initialize chat',
      welcomeDefault: "Hi! I'm your AI assistant. How can I help you today?",
      genericError: 'Sorry, I encountered an error. Please try again.',
      connectionErrorMsg: 'Connection error. Please check your internet and try again.'
    },
    es: {
      typeMessage: 'Escribe tu mensaje...',
      send: 'Enviar',
      online: 'En línea',
      typing: 'Escribiendo...',
      connectionError: 'Error de conexión',
      tryAgain: 'Intentar de nuevo',
      initFailed: 'Error al inicializar el chat',
      welcomeDefault: "¡Hola! Soy tu asistente de IA. ¿Cómo puedo ayudarte hoy?",
      genericError: 'Lo siento, encontré un error. Por favor, inténtalo de nuevo.',
      connectionErrorMsg: 'Error de conexión. Por favor, verifica tu internet e inténtalo de nuevo.'
    },
    fr: {
      typeMessage: 'Tapez votre message...',
      send: 'Envoyer',
      online: 'En ligne',
      typing: 'En train d\'écrire...',
      connectionError: 'Erreur de connexion',
      tryAgain: 'Réessayer',
      initFailed: 'Échec de l\'initialisation du chat',
      welcomeDefault: "Salut! Je suis votre assistant IA. Comment puis-je vous aider aujourd'hui?",
      genericError: 'Désolé, j\'ai rencontré une erreur. Veuillez réessayer.',
      connectionErrorMsg: 'Erreur de connexion. Veuillez vérifier votre internet et réessayer.'
    },
    de: {
      typeMessage: 'Geben Sie Ihre Nachricht ein...',
      send: 'Senden',
      online: 'Online',
      typing: 'Schreiben...',
      connectionError: 'Verbindungsfehler',
      tryAgain: 'Erneut versuchen',
      initFailed: 'Chat konnte nicht initialisiert werden',
      welcomeDefault: "Hallo! Ich bin Ihr KI-Assistent. Wie kann ich Ihnen heute helfen?",
      genericError: 'Entschuldigung, ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
      connectionErrorMsg: 'Verbindungsfehler. Bitte überprüfen Sie Ihr Internet und versuchen Sie es erneut.'
    }
  };

  const fetchWithTimeout = (url, opts = {}, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    opts.signal = controller.signal;
    return fetch(url, opts).finally(() => clearTimeout(id));
  };

  // Global Product Cache
  window.widgetProducts = {};

  // Global scrolling handlers for the widget carousels
  window.widgetScrollProductCarousel = (id, direction) => {
    const el = document.getElementById(id);
    if (!el) return;
    const amount = 200;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  window.widgetCheckScroll = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const leftGrad = document.getElementById(id + '-grad-left');
    const rightGrad = document.getElementById(id + '-grad-right');

    if (leftGrad) leftGrad.style.display = el.scrollLeft > 10 ? 'block' : 'none';
    if (rightGrad) rightGrad.style.display = el.scrollLeft < (el.scrollWidth - el.clientWidth - 10) ? 'block' : 'none';
  };

  // Show Product Modal
  window.widgetShowProductModal = (id) => {
    const product = window.widgetProducts[id];
    if (!product) return;

    // Create modal elements
    const backdrop = document.createElement('div');
    backdrop.className = 'product-modal-backdrop';
    backdrop.onclick = (e) => {
      if (e.target === backdrop) backdrop.remove();
    };

    const hasDiscount = product.originalPrice && parseFloat(product.originalPrice) > parseFloat(product.price);
    const discountPercent = hasDiscount ? Math.round((1 - parseFloat(product.price) / parseFloat(product.originalPrice)) * 100) : 0;
    const priceFormatted = parseFloat(product.price).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

    // Fallback image handling
    const imgUrl = product.imageUrl || '';
    const imgOnError = "this.src='https://via.placeholder.com/100?text=No+Image'";

    backdrop.innerHTML = `
        <div class="product-modal">
            <button class="product-modal-close" onclick="this.closest('.product-modal-backdrop').remove()">×</button>
            
            <div class="modal-product-content">
                <img src="${imgUrl}" onerror="${imgOnError}" class="modal-product-img" alt="${product.name}" />
                <div class="modal-product-details">
                    <div class="modal-product-title">${product.name}</div>
                    
                    <div class="modal-product-price-row">
                        <span class="modal-final-price">₹${priceFormatted}</span>
                        ${hasDiscount ? `<span class="modal-original-price">₹${parseFloat(product.originalPrice).toLocaleString('en-IN')}</span>` : ''}
                    </div>
                    
                    ${hasDiscount ? `<span class="modal-discount-badge">${discountPercent}% off</span>` : ''}
                </div>
            </div>

            <div class="modal-actions">
                <button class="modal-checkout-btn" onclick="window.location.href='/cart/${product.defaultVariantId}:1'">
                    CHECKOUT - ₹${priceFormatted}
                </button>
            </div>
        </div>
    `;

    document.getElementById('chat-window-container').appendChild(backdrop);
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
        console.log('� Existing session found:', this.chatName || this.sessionId);
      }

      this.injectStyles();
      // Render immediately so user sees the bubble. Config update will re-render it later.
      this.renderChatBubble();
      this.checkAndMaybeAutoRestore();
    }

    // Helper for translations
    t(key) {
      const lang = this.config?.language || 'en';
      return TRANSLATIONS[lang]?.[key] || TRANSLATIONS['en'][key];
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
        .product-carousel-wrapper { margin-top: 16px; margin-bottom: 8px; }

        /* Widget Effects - Matching Tailwind */
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        .animate-ping { animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite; }

        @keyframes pulse { 50% { opacity: .5; } }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        
        /* Helper classes for positioning */
        .absolute-inset-0 { position: absolute; top: 0; right: 0; bottom: 0; left: 0; }
        .rounded-full { border-radius: 9999px; }
        .status-dot { position: absolute; top: 0; right: 0; width: 12px; height: 12px; background-color: #22c55e; border: 2px solid white; border-radius: 9999px; z-index: 20; }


        .product-carousel-wrapper { margin-top: 16px; margin-bottom: 8px; }
        .product-carousel { 
          display: flex; 
          gap: 12px; 
          overflow-x: auto; 
          padding: 4px 4px 16px 4px; /* Bottom padding for shadow */
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }
        .product-carousel::-webkit-scrollbar { height: 4px; }
        .product-carousel::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .product-carousel::-webkit-scrollbar-thumb { background: #17876E; border-radius: 10px; }
        
        .product-card {
          flex: 0 0 210px; /* w-52 approx */
          scroll-snap-align: start;
          background: #fff;
          border-radius: 16px; /* rounded-2xl */
          box-shadow: 0 2px 4px rgba(0,0,0,0.05); /* shadow-sm */
          overflow: hidden;
          transition: box-shadow 0.2s;
          border: 1px solid #e5e7eb; /* gray-200 */
          display: flex;
          flex-direction: column;
        }
        .product-card:hover { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); /* shadow-md */ }
        
        .product-card-img-container {
          height: 192px; /* h-48 */
          padding: 16px;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          position: relative;
        }

        .product-card img { 
          width: 100%; 
          height: 100%; 
          object-fit: contain; 
        }
        
        .product-card-body { 
          padding: 0 16px 16px 16px; 
          display: flex; 
          flex-direction: column; 
          flex: 1; 
        }
        
        .product-card-title { 
          font-weight: 500; 
          font-size: 14px; 
          margin-bottom: 8px; 
          color: #111827; /* gray-900 */
          line-height: 1.4; 
          display: -webkit-box; 
          -webkit-line-clamp: 3; 
          -webkit-box-orient: vertical; 
          overflow: hidden; 
          min-height: 60px;
        }
        
        .product-card-price { 
          font-weight: 700; 
          font-size: 18px; 
          color: #111827; /* gray-900 */
        }
        
        .product-card-actions {
          margin-top: auto;
          border-top: 1px solid #f3f4f6; /* gray-100 */
        }

        .product-action-btn { 
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%; 
          padding: 12px 0; 
          background: transparent;
          color: #2563eb; /* blue-600 */
          border: none; 
          font-size: 14px; 
          font-weight: 500; 
          cursor: pointer; 
          text-decoration: none; 
          transition: background-color 0.2s; 
        }
        .product-action-btn:hover { background-color: #eff6ff; /* blue-50 */ }
        
        .product-view-btn {
          border-bottom: 1px solid #f3f4f6; /* gray-100 */
        }
        
        /* No image placeholder */
        .product-img-placeholder { 
          font-size: 36px;
        }

        /* Carousel Navigation & Layout */
        .carousel-btn {
          display: none; /* hidden by default, shown on md screens */
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 32px;
          height: 32px;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          border: 1px solid #e5e7eb;
          background: rgba(255, 255, 255, 0.9);
          color: #4b5563;
          cursor: pointer;
          transition: all 0.2s;
          z-index: 30;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .carousel-btn-left { left: 0; }
        .carousel-btn-right { right: 0; }

        .carousel-btn:hover:not(:disabled) {
          background-color: #ffffff;
          border-color: #9ca3af;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        .carousel-btn:disabled {
          display: none;
        }
        
        /* Media query for carousel buttons - mimicking md:flex */
        @media (min-width: 768px) {
          .carousel-btn { display: flex; }
        }

        .carousel-container {
          position: relative;
          flex: 1;
          overflow: hidden;
        }

        .carousel-gradient-left {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 24px;
          background: linear-gradient(to right, #F4F6F8, transparent);
          z-index: 10;
          pointer-events: none;
        }
        .carousel-gradient-right {
          position: absolute;
          right: 0; top: 0; bottom: 0;
          width: 24px;
          background: linear-gradient(to left, #F4F6F8, transparent);
          z-index: 10;
          pointer-events: none;
        }

        /* Hide scrollbar but keep functionality */
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        
        /* Mobile Dots */
        .carousel-dots {
          display: flex;
          justify-content: center;
          gap: 6px;
          margin-top: 8px;
        }
        .carousel-dot {
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background-color: #d1d5db;
        }
        /* Product Modal */
        .product-modal-backdrop {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.3);
          display: flex;
          align-items: flex-end; /* Align to bottom */
          justify-content: center;
          z-index: 100;
          opacity: 0;
          animation: fadeIn 0.3s forwards;
          border-radius: 16px; /* Match widget border radius */
          overflow: hidden;
        }
        .product-modal {
          background: white;
          width: 100%;
          border-top-left-radius: 20px;
          border-top-right-radius: 20px;
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
          transform: translateY(100%);
          animation: slideUpModal 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          position: relative;
          padding-bottom: 20px;
        }
        @keyframes slideUpModal { 
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .product-modal-close {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 28px;
          height: 28px;
          background: #f3f4f6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #6b7280;
          border: none;
          font-size: 18px;
          z-index: 10;
        }
        .product-modal-close:hover { background: #e5e7eb; color: #111827; }

        .modal-product-content { padding: 20px; display: flex; gap: 16px; align-items: start; }
        .modal-product-img { 
          width: 100px; 
          height: 100px; 
          flex-shrink: 0; 
          border-radius: 8px; 
          border: 1px solid #e5e7eb;
          padding: 8px;
          object-fit: contain;
        }
        .modal-product-details { flex: 1; min-width: 0; }
        .modal-product-title { font-size: 14px; font-weight: 500; color: #111827; margin-bottom: 8px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .modal-product-price-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
        .modal-final-price { font-size: 18px; font-weight: 700; color: #111827; }
        .modal-original-price { font-size: 13px; color: #9ca3af; text-decoration: line-through; }
        .modal-discount-badge { background: #16a34a; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        
        .modal-actions { padding: 16px 20px 20px; border-top: 1px solid #f3f4f6; }
        .modal-checkout-btn {
          width: 100%;
          background: #15803d; /* green-700 */
          color: white;
          padding: 14px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          border: none;
          cursor: pointer;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 6px -1px rgba(21, 128, 61, 0.2);
        }
        .modal-checkout-btn:hover { background: #166534; } /* green-800 */
        
        @media (min-width: 768px) {
          .carousel-dots { display: none; }
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
      formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
      formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
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

      const carouselId = 'carousel-' + Math.random().toString(36).substr(2, 9);

      const cardsHtml = products.map(product => {
        const imageHtml = product.imageUrl
          ? `<img src="${product.imageUrl}" alt="${product.name || 'Product'}" onerror="this.parentElement.innerHTML='<div class=\\'product-img-placeholder\\'>📦</div>'">`
          : `<div class="product-img-placeholder">📦</div>`;

        const priceHtml = product.price
          ? `<div class="product-card-price">₹${parseFloat(product.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>`
          : '';

        // Check for discount
        const discountBadge = (product.originalPrice && parseFloat(product.originalPrice) > parseFloat(product.price))
          ? `<span style="position:absolute; top:8px; left:8px; padding:2px 6px; background:#ef4444; color:white; font-size:10px; font-weight:bold; border-radius:4px;">${Math.round((1 - parseFloat(product.price) / parseFloat(product.originalPrice)) * 100)}% OFF</span>`
          : '';

        const viewIcon = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';

        const cartIcon = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>';

        // Register product in global cache
        const productId = 'prod_' + Math.random().toString(36).substr(2, 9);
        window.widgetProducts[productId] = product;

        const actionsHtml = `
            <div class="product-card-actions">
                ${product.url ? `
                <a href="${product.url}" target="_blank" class="product-action-btn product-view-btn">
                    View Product ${viewIcon}
                </a>` : ''}
                <button class="product-action-btn" onclick="window.widgetShowProductModal('${productId}')">
                    ${cartIcon} Add to cart
                </button>
            </div>
        `;

        return `
          <div class="product-card" style="position:relative;">
            <div class="product-card-img-container">
                ${discountBadge}
                ${imageHtml}
            </div>
            <div class="product-card-body">
              <div class="product-card-title" title="${product.name || 'Product'}">${product.name || 'Product'}</div>
              ${priceHtml}
            </div>
            ${actionsHtml}
          </div>
        `;
      }).join('');

      // Navigation Icons
      const chevronLeft = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><polyline points="15 18 9 12 15 6"></polyline></svg>';
      const chevronRight = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><polyline points="9 18 15 12 9 6"></polyline></svg>';

      // Dots for mobile
      const dotsHtml = products.length > 2
        ? `<div class="carousel-dots">
             ${products.slice(0, Math.min(5, products.length)).map(() => `<div class="carousel-dot"></div>`).join('')}
             ${products.length > 5 ? '<span style="font-size:10px; color:#9ca3af; margin-left:2px;">+' + (products.length - 5) + '</span>' : ''}
           </div>`
        : '';

      // Left/Right arrow logic - buttons call global function
      const leftBtn = products.length > 2
        ? `<button class="carousel-btn carousel-btn-left" onclick="window.widgetScrollProductCarousel('${carouselId}', 'left')">${chevronLeft}</button>`
        : '';
      const rightBtn = products.length > 2
        ? `<button class="carousel-btn carousel-btn-right" onclick="window.widgetScrollProductCarousel('${carouselId}', 'right')">${chevronRight}</button>`
        : '';

      return `
        <div class="product-carousel-wrapper" style="width:100%; margin-top:12px;">
          <!-- Header -->
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-left:4px;">
            <div style="width:4px; height:16px; background:#17876E; border-radius:99px;"></div>
            <span style="font-size:12px; font-weight:600; color:#4b5563; text-transform:uppercase; letter-spacing:0.05em;">Recommended Products</span>
            <span style="font-size:12px; color:#9ca3af;">(${products.length})</span>
          </div>

          <!-- Carousel Area -->
          <div style="position:relative; width:100%;">
            ${leftBtn}
            
            <div class="carousel-container">
               <div class="carousel-gradient-left" style="display:none;" id="${carouselId}-grad-left"></div>
               <div class="carousel-gradient-right" id="${carouselId}-grad-right"></div>
               
               <div id="${carouselId}" class="product-carousel scrollbar-hide" onscroll="window.widgetCheckScroll('${carouselId}')">
                 ${cardsHtml}
                 <div style="flex-shrink:0; width:4px;"></div>
               </div>
            </div>
            
            ${rightBtn}
          </div>
          ${dotsHtml}
        </div>
      `;
    }

    // Render product carousel HTML
    renderProductCarousel_OLD(products) {
      // PREMIUM UPDATED
      if (!products || products.length === 0) return '';

      const cardsHtml = products.map(product => {
        const imageHtml = product.imageUrl
          ? `<img src="${product.imageUrl}" alt="${product.name || 'Product'}" onerror="this.parentElement.innerHTML='<div class=\\'product-img-placeholder\\'>📦</div>'">`
          : `<div class="product-img-placeholder">📦</div>`;

        const priceHtml = product.price
          ? `<div class="product-card-price">₹${parseFloat(product.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>`
          : '';

        const viewIcon = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';

        const cartIcon = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>';

        const actionsHtml = `
            <div class="product-card-actions">
                ${product.url ? `
                <a href="${product.url}" target="_blank" class="product-action-btn product-view-btn">
                    View Product ${viewIcon}
                </a>` : ''}
                <button class="product-action-btn" onclick="console.log('Add to cart')">
                    ${cartIcon} Add to cart
                </button>
            </div>
        `;

        return `
          <div class="product-card">
            <div class="product-card-img-container">
                ${imageHtml}
            </div>
            <div class="product-card-body">
              <div class="product-card-title" title="${product.name || 'Product'}">${product.name || 'Product'}</div>
              ${priceHtml}
            </div>
            ${actionsHtml}
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

    _getChannelButtonHtml() {
      const activeChannel = this.config?.activeChannel;
      const contact = this.config?.supportContact || {};
      let href = '';
      let iconPath = '';
      let viewBox = '0 0 448 512';

      if (activeChannel === 'Wp' && contact.whatsapp) {
        const num = (contact.whatsappCode || '') + contact.whatsapp;
        href = `https://wa.me/${num.replace(/\+/g, '')}`;
        iconPath = 'M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z';
      } else if (activeChannel === 'Insta' && contact.instagram) {
        const handle = contact.instagram.replace('@', '');
        href = `https://instagram.com/${handle}`;
        iconPath = 'M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.5 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z';
      } else if (activeChannel === 'Email' && contact.email) {
        href = `mailto:${contact.email}`;
        iconPath = 'M502.3 190.8c3.9-3.1 9.7-.2 9.7 4.7V400c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V195.6c0-5 5.7-7.8 9.7-4.7 22.4 17.4 52.1 39.5 154.1 113.6 21.1 15.4 56.7 47.8 92.2 47.6 35.7.3 72-32.8 92.3-47.6 102-74.1 131.6-96.3 154-113.7zM256 320c23.2.4 56.6-29.2 73.4-41.4 132.7-96.3 142.8-104.7 173.4-128.7 5.8-4.5 9.2-11.5 9.2-18.9v-19c0-26.5-21.5-48-48-48H48C21.5 64 0 85.5 0 112v19c0 7.4 3.4 14.3 9.2 18.9 30.6 23.9 40.7 32.4 173.4 128.7 16.8 12.2 50.2 41.8 73.4 41.4z';
        viewBox = '0 0 512 512';
      }

      if (!href) return '';

      return `<a href="${href}" target="_blank" style="margin-right:8px; display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,0.2); color:white; text-decoration:none; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="${viewBox}" height="16px" width="16px" xmlns="http://www.w3.org/2000/svg"><path d="${iconPath}"></path></svg>
      </a>`;
    }


    getWidgetConfig() {
      const isMobile = window.innerWidth < 768;
      const c = this.config || {};

      // Default values
      const defaults = {
        visible: true,
        position: 'right',
        xOffset: 20,
        yOffset: 20,
        size: 'large',
        showText: true,
        text: 'Chat with us',
        avatar: c.avatar || 'a1.svg'
      };

      if (isMobile) {
        if (c.mobileEntryStrategy === 'same') {
          return {
            visible: c.desktopVisible ?? defaults.visible,
            position: c.desktopPosition || defaults.position,
            xOffset: c.desktopMarginLeft || defaults.xOffset,
            yOffset: c.desktopMarginBottom || defaults.yOffset,
            size: c.desktopButtonSize || defaults.size,
            showText: c.desktopShowText ?? defaults.showText,
            text: c.desktopWidgetText || defaults.text,
            avatar: c.avatar || defaults.avatar
          };
        } else {
          return {
            visible: c.mobileVisible ?? defaults.visible,
            position: c.mobilePosition || defaults.position,
            xOffset: c.mobileMarginLeft || defaults.xOffset,
            yOffset: c.mobileMarginBottom || defaults.yOffset,
            size: c.mobileButtonSize || defaults.size,
            showText: false, // Mobile custom usually hides text
            text: '',
            avatar: c.avatar || defaults.avatar
          };
        }
      } else {
        // Desktop
        return {
          visible: c.desktopVisible ?? defaults.visible,
          position: c.desktopPosition || defaults.position,
          xOffset: c.desktopMarginLeft || defaults.xOffset,
          yOffset: c.desktopMarginBottom || defaults.yOffset,
          size: c.desktopButtonSize || defaults.size,
          showText: c.desktopShowText ?? defaults.showText,
          text: c.desktopWidgetText || defaults.text,
          avatar: c.avatar || defaults.avatar
        };
      }
    }

    renderChatBubble() {
      const existingWidget = document.getElementById('ai-chat-widget');
      if (existingWidget) existingWidget.remove();

      const config = this.getWidgetConfig();
      // Previously hidden entire widget if !visible. Now user wants Avatar ALWAYS visible.
      // if (!config.visible) return; 

      const themeColor = this.config?.interfaceColor || '#17876E';
      const sizePx = config.size === 'small' ? 40 : 60;

      // Calculate position styles
      const bottom = `${config.yOffset}px`;
      const side = config.position === 'left' ? 'left' : 'right';
      const sideValue = `${config.xOffset}px`;

      // Avatar handling
      let avatarFileName = config.avatar;
      if (avatarFileName && avatarFileName.startsWith('/loginassets/')) {
        avatarFileName = avatarFileName.substring(13);
      } else if (avatarFileName && avatarFileName.startsWith('avatar-')) {
        const avatarNumber = avatarFileName.replace('avatar-', '').replace('.png', '');
        avatarFileName = `a${avatarNumber}.svg`;
      }
      const avatarPath = `${this.apiUrl.replace('/api/widget', '')}/loginassets/${avatarFileName}`;

      // Effect Handling logic matching Preview component
      const effect = this.config?.effect || 'none';

      // Ripple is an inner div
      const rippleHtml = effect === 'ripple'
        ? `<div class="absolute-inset-0 rounded-full animate-ping" style="background: ${themeColor}; opacity: 0.75;"></div>`
        : '';

      // Dot/Blink is a sibling div (positioned absolute)
      const dotHtml = (effect === 'dot' || effect === 'blink')
        ? `<div class="status-dot ${effect === 'blink' ? 'animate-pulse' : ''}"></div>`
        : '';

      // Determine Layout: Row for Left (Avatar->Text), Row-Reverse for Right (Text<-Avatar)
      const isLeft = side === 'left';
      const flexDirection = isLeft ? 'row' : 'row-reverse';

      // Text Visibility: Show text ONLY if "Entry Point Visible" (config.visible) AND "Show Text" (config.showText) are BOTH true.
      const shouldShowText = config.visible && config.showText;

      const widgetHTML = `
        <div id="ai-chat-widget" style="position: fixed; bottom: ${bottom}; ${side}: ${sideValue}; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: ${isLeft ? 'flex-start' : 'flex-end'};">
          
          <div id="launcher-wrapper" style="
              display: flex; 
              align-items: center; 
              gap: 12px; 
              flex-direction: ${flexDirection};
          ">
            
            <div style="position: relative;">
               <div id="chat-bubble" style="width: ${sizePx}px; height: ${sizePx}px; border-radius: 50%; background: ${themeColor}; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,0.2); transition: transform 0.3s ease; position: relative; z-index: 10;">
                  ${rippleHtml}
                  <img src="${avatarPath}" alt="Chat" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; position: relative; z-index: 10;">
                  ${dotHtml}
               </div>
            </div>

            ${shouldShowText ? `
              <div id="chat-widget-text" style="animation: fadeIn 0.5s ease;">
                <div style="background: ${themeColor}; color: white; padding: 10px 18px; border-radius: 20px; font-size: 15px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15); white-space: nowrap; cursor: pointer; position: relative;">
                  ${config.text}
                  <button onclick="this.parentElement.parentElement.remove()" style="position: absolute; top: -8px; right: -8px; background: white; border: 1px solid #eee; color: #999; border-radius: 50%; width: 20px; height: 20px; font-size: 14px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">×</button>
                </div>
              </div>
            ` : ''}

          </div>
          
          <div id="chat-window-container" style="display: none; position: absolute; bottom: ${sizePx + 15}px; ${side}: 0;"></div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', widgetHTML);

      // Attach click to Avatar Bubble
      const bubble = document.getElementById('chat-bubble');
      if (bubble) bubble.addEventListener('click', () => this.handleBubbleClick());

      // Attach click to Text Bubble (if exists)
      const textBubble = document.getElementById('chat-widget-text');
      if (textBubble) {
        textBubble.addEventListener('click', (e) => {
          // Prevent opening if the user clicked the close button
          if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
          this.handleBubbleClick();
        });
      }
    }

    renderNudge(nudge) {
      console.log('🔔 renderNudge called with:', nudge);
      if (!nudge || !nudge.isActive) {
        console.log('❌ Nudge invalid or inactive');
        return;
      }

      // Check triggers
      this.handleTriggers(nudge, () => {
        const existingNudge = document.getElementById('ai-nudge-popup');
        if (existingNudge) existingNudge.remove();
        this.showNudgeUI(nudge);
      });
    }

    handleTriggers(nudge, callback) {
      const triggers = nudge.triggers || {};
      const { timeDelay = 0, scrollDepth = 0, deviceTargeting = [] } = triggers;

      // Device Targeting
      const isMobile = window.innerWidth <= 768;
      const targetMobile = deviceTargeting.includes('mobile');
      const targetDesktop = deviceTargeting.includes('desktop');

      if (deviceTargeting.length > 0) {
        if (isMobile && !targetMobile) return;
        if (!isMobile && !targetDesktop) return;
      }

      let timeConditionMet = timeDelay === 0;
      let scrollConditionMet = scrollDepth === 0;

      const checkAllConditions = () => {
        if (timeConditionMet && scrollConditionMet) {
          callback();
        }
      };

      // Time Delay
      if (timeDelay > 0) {
        setTimeout(() => {
          timeConditionMet = true;
          checkAllConditions();
        }, timeDelay * 1000);
      }

      // Scroll Depth
      if (scrollDepth > 0) {
        const handleScroll = () => {
          const scrollTop = window.scrollY;
          const docHeight = document.documentElement.scrollHeight - window.innerHeight;
          const scrollPercent = (scrollTop / docHeight) * 100;

          if (scrollPercent >= scrollDepth) {
            scrollConditionMet = true;
            window.removeEventListener('scroll', handleScroll);
            checkAllConditions();
          }
        };
        window.addEventListener('scroll', handleScroll);
      } else {
        checkAllConditions();
      }
    }

    showNudgeUI(nudge) {
      const themeColor = this.config?.interfaceColor || '#17876E';
      const position = nudge.appearance?.position || 'bottom-right';
      const bgColor = nudge.appearance?.bgColor || '#ffffff';
      const btnColor = nudge.appearance?.btnColor || themeColor;

      const bottomOffset = '90px';
      const rightOffset = position === 'bottom-right' ? '20px' : 'auto';
      const leftOffset = position === 'bottom-left' ? '20px' : 'auto';

      if (nudge.messageType === 'text' && nudge.textConfigType === 'conversion') {
        const bubbles = nudge.conversationStarters || ['What are the best air purifiers available?', 'Do you offer a warranty on kitchen appliances?', 'Is same-day delivery available for electronics?'];
        const bubblesHtml = bubbles.map(msg => `
          <div class="nudge-bubble-btn" data-msg="${msg}" style="background: ${btnColor}; color: white; padding: 12px 16px; border-radius: 18px 18px 4px 18px; font-size: 0.9rem; box-shadow: 0 2px 8px rgba(0,0,0,0.15); text-align: left; margin-bottom: 10px; cursor: pointer; transition: transform 0.2s; width: 100%;">
            ${msg}
          </div>
        `).join('');

        const containerHtml = `
          <div id="ai-nudge-popup" style="position: fixed; bottom: ${bottomOffset}; right: ${rightOffset}; left: ${leftOffset}; width: 300px; background: transparent; z-index: 999998; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: flex-end;">
            <button id="close-nudge" style="background: white; border: none; color: #666; cursor: pointer; font-size: 14px; line-height: 1; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 10px; align-self: flex-end;">✕</button>
            <div style="width: 100%; display: flex; flex-direction: column; align-items: flex-end;">
                ${bubblesHtml}
            </div>
          </div>
        `;
        document.body.insertAdjacentHTML('beforeend', containerHtml);

        document.getElementById('close-nudge').onclick = (e) => {
          e.stopPropagation();
          document.getElementById('ai-nudge-popup').remove();
        };

        // Attach click handlers
        const bubbleBtns = document.querySelectorAll('.nudge-bubble-btn');
        bubbleBtns.forEach(btn => {
          btn.onclick = () => {
            const msg = btn.getAttribute('data-msg');
            document.getElementById('ai-nudge-popup').remove();
            this.handleBubbleClick();
            setTimeout(() => {
              if (this.isInitialized) {
                this.sendQuickQuestion(msg);
              } else {
                this.sendQuickQuestion(msg);
              }
            }, 500);
          };
        });
        return;
      }



      // Generate buttons from quickReplies
      const replies = (nudge.quickReplies && nudge.quickReplies.length > 0)
        ? nudge.quickReplies
        : ['Ask Me Anything'];

      const buttonsHtml = replies.map((reply, index) => `
        <button class="nudge-cta-btn" data-reply="${reply.replace(/"/g, '&quot;')}" style="background: ${btnColor}; color: white; border: none; padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; margin-right: 5px; margin-bottom: 5px; display: inline-block;">
          ${reply}
        </button>
      `).join('');

      // Determine text color based on background brightness (simple heuristic)
      const textColor = '#333';

      const nudgeHTML = `
    <div id="ai-nudge-popup" style="position: fixed; bottom: ${bottomOffset}; right: ${rightOffset}; left: ${leftOffset}; width: 300px; background: ${bgColor}; border-radius: 12px; box-shadow: 0 5px 20px rgba(0,0,0,0.15); z-index: 999998; animation: slideUp 0.5s ease; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <button id="close-nudge" style="position: absolute; top: -10px; right: -10px; background: white; border: none; color: #666; cursor: pointer; font-size: 14px; line-height: 1; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">✕</button>
      
      ${nudge.messageType === 'product' ? `
        <div style="position: relative; margin-top: 10px;">
            <div style="
                position: absolute; top: -25px; left: -10px;
                background: #FFD700; color: #000; padding: 4px 12px;
                border-radius: 12px; font-size: 0.75rem; font-weight: bold;
                display: flex; align-items: center; gap: 4px; z-index: 20;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            ">
                ✨ Top picks
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-start; margin-bottom: 10px;">
                ${nudge.productDetails?.productImage ?
            `<img src="${nudge.productDetails.productImage}" alt="Product" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.2);" />` :
            `<div style="width: 60px; height: 60px; background: rgba(255,255,255,0.1); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.6rem; flex-shrink: 0;">No Image</div>`
          }
                <div style="text-align: left; color: white;">
                    <div style="font-size: 0.85rem; line-height: 1.3; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${nudge.productDetails?.productName || 'Product Name'}
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="font-weight: bold; font-size: 0.95rem;">${nudge.productDetails?.price || '₹0'}</span>
                        ${nudge.productDetails?.originalPrice ?
            `<span style="text-decoration: line-through; opacity: 0.7; font-size: 0.75rem;">${nudge.productDetails.originalPrice}</span>` : ''
          }
                        ${nudge.productDetails?.discountLabel ?
            `<span style="font-size: 0.75rem; font-weight: bold;">${nudge.productDetails.discountLabel}</span>` : ''
          }
                    </div>
                </div>
            </div>
        </div>
      ` : ''}

      ${nudge.messageType === 'offer' ? `
        <div style="text-align: center; margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.2); border-radius: 8px; color: ${textColor};">
            <div style="font-size: 1.4rem; font-weight: bold;">${nudge.offerDetails?.discountAmount || ''}</div>
            <div style="font-size: 0.8rem; opacity: 0.9;">Use Code: <strong>${nudge.offerDetails?.discountCode || ''}</strong></div>
        </div>
      ` : ''}

      <div style="font-size: 14px; color: ${textColor}; margin-bottom: 12px; line-height: 1.5; font-weight: 500;">${this.formatMessage(nudge.message)}</div>
      <div id="nudge-buttons-container">
        ${buttonsHtml}
      </div>
    </div>
  `;

      document.body.insertAdjacentHTML('beforeend', nudgeHTML);

      document.getElementById('close-nudge').onclick = (e) => {
        e.stopPropagation();
        document.getElementById('ai-nudge-popup').remove();
        // ⚠️ yahan kuch bhi localStorage/sessionStorage mat daalna
      };

      // Attach click handlers to all generated buttons
      const ctaButtons = document.querySelectorAll('.nudge-cta-btn');
      ctaButtons.forEach(btn => {
        btn.onclick = () => {
          const replyText = btn.getAttribute('data-reply');
          document.getElementById('ai-nudge-popup').remove();
          this.handleBubbleClick();
          // Wait for chat to open then send message
          setTimeout(() => {
            if (this.isInitialized) {
              this.sendQuickQuestion(replyText);
            } else {
              // If not initialized, we might need to wait or init first
              // handleBubbleClick calls initChat if needed, so we just need to wait a bit
              // A better approach would be to pass an initial message to initChat, but for now:
              this.sendQuickQuestion(replyText);
            }
          }, 500);
        };
      });
    }


    handleBubbleClick() {
      if (this.isLoading) return; // Prevent double clicks during init

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

          // Re-render chat bubble to reflect new config
          this.renderChatBubble();

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
      if (this.isLoading) return;
      this.isLoading = true;
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
          this.renderChatBubble(); // Re-render bubble with new config
          this.renderChatBubble(); // Re-render bubble with new config

          if (data.data.isOffline) {
            this.renderOfflineState(data.data.offlineMessage);
          } else {
            this.renderChatWindow();
            if (data.data.conversation && data.data.conversation.length > 0) {
              this.renderHistory(data.data.conversation);
            }
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
      } finally {
        this.isLoading = false;
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
          <div style="color: #e74c3c; font-weight: 500; margin-bottom: 8px;">${this.t('connectionError')}</div>
          <div style="color: #666; font-size: 13px;">${msg}</div>
          <button onclick="location.reload()" style="margin-top: 16px; padding: 8px 20px; background: #17876E; color: white; border: none; border-radius: 6px; cursor: pointer;">${this.t('tryAgain')}</button>
        </div>
      `;
    }

    renderChatWindow() {
      const container = document.getElementById('chat-window-container');
      if (!container) return;
      const botName = (this.config?.assistantName || 'AI Assistant').toUpperCase();

      // Determine Page Type
      const path = window.location.pathname;
      let pageType = 'home';

      if (path.includes('/products/')) pageType = 'product';
      else if (path.includes('/collections/')) pageType = 'collection';
      else if (path.includes('/search')) pageType = 'search';
      else if (path === '/' || path === '') pageType = 'home';
      else pageType = 'other';

      // Suggestions: Handle both legacy array and new structured object
      let suggestions = [];

      // Try to get page-specific questions, fallback to home
      if (this.config?.conversationStarters?.[pageType] && Array.isArray(this.config.conversationStarters[pageType])) {
        suggestions = this.config.conversationStarters[pageType]
          .filter(item => item.enabled)
          .map(item => item.label);
      } else if (this.config?.conversationStarters?.home && Array.isArray(this.config.conversationStarters.home)) {
        suggestions = this.config.conversationStarters.home
          .filter(item => item.enabled)
          .map(item => item.label);
      } else if (Array.isArray(this.config?.suggestedQuestions)) {
        // Fallback or legacy structure
        suggestions = this.config.suggestedQuestions;
      }

      let quickActionsHtml = '';
      // Try to get page-specific actions, fallback to home
      let quickActionsList = this.config?.quickActions?.[pageType] || [];

      // If no specific actions found (empty array) and page is NOT home, try falling back to home actions
      if ((!quickActionsList || quickActionsList.length === 0) && pageType !== 'home') {
        quickActionsList = this.config?.quickActions?.home || [];
      }

      const quickActionsVisible = this.config?.quickActionsVisible !== false; // Default true if undefined

      if (quickActionsVisible && Array.isArray(quickActionsList)) {
        const enabledActions = quickActionsList.filter(qa => qa.enabled);
        if (enabledActions.length > 0) {
          const actionsButtonsHtml = enabledActions.map(qa => {
            const safeLabel = qa.label.replace(/"/g, '&quot;');
            return `
               <div class="quick-action-chip" 
                    data-action="${safeLabel}"
                    style="background:${themeColor}; color:white; font-size:11px; padding:6px 12px; border-radius:12px; cursor:pointer; user-select:none; display:flex; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.1); transition:transform 0.1s; margin-bottom: 6px;">
                 ${safeLabel}
               </div>
             `;
          }).join('');

          const actionsTitle = this.config?.quickActionsDisplayName ?
            `<div style="font-size:11px; color:#888; margin-bottom:6px; font-weight:500; width:100%;">${this.config.quickActionsDisplayName}</div>`
            : '';

          quickActionsHtml = `
             <div id="quick-actions" style="margin-top:8px; padding: 0 4px; display:flex; flex-wrap:wrap; gap:6px;">
               ${actionsTitle}
               ${actionsButtonsHtml}
             </div>
           `;
        }
      }

      let quickQuestionsHtml = '';

      if (suggestions.length) {
        const buttonsHtml = suggestions
          .map((q) => {
            const safeQ = q.replace(/"/g, '&quot;');
            return `
              <button class="quick-question-btn"
                      data-question="${safeQ}"
                      style="display:block;width:fit-content;text-align:left;margin:4px 0;padding:8px 14px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;font-size:13px;cursor:pointer;transition:all 0.2s;color:#555;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                ${safeQ}
              </button>`;
          })
          .join('');

        quickQuestionsHtml = `
          <div id="quick-questions" style="margin-top:12px; padding: 0 4px; display:flex; flex-direction:column; align-items:flex-start;">
            <div style="font-size:12px; color:#888; margin-bottom:4px; font-weight:500; width:100%;">💡 Quick Questions</div>
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

      const channelBtnHtml = this._getChannelButtonHtml();

      container.style.display = 'block';
      container.innerHTML = `
        <div style="width: 380px; height: 600px; background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); display: flex; flex-direction: column; animation: slideUp 0.3s ease; overflow: hidden;">
          <div style="padding: 14px 16px; background: linear-gradient(135deg, ${themeColor} 0%, ${this.adjustColor(themeColor, 15)} 100%); color: white; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <img src="${avatarPath}" alt="Assistant" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.1);">
              <div>
                <div style="font-weight: 600; font-size: 15px;">${botName}</div>
                <div style="font-size: 11px; opacity: 0.9; display: flex; align-items: center; gap: 4px;">
                  <span style="width:6px;height:6px;background:#4ade80;border-radius:50%;display:inline-block;"></span> ${this.t('online')}
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center;">
              ${channelBtnHtml}
              <button id="close-chat" style="background:rgba(255,255,255,0.15);border:none;width:32px;height:32px;border-radius:50%;color:white;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">×</button>
            </div>
          </div>
          <div id="chat-messages" style="flex: 1; padding: 16px; overflow-y: auto; background: #f8f9fa;">
            <div class="message" style="animation: fadeIn 0.3s ease; display: flex; justify-content: flex-start; margin-bottom: 12px;">
              <div style="background: white; padding: 14px 16px; border-radius: 4px 16px 16px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); max-width: 85%; border: 1px solid #eee;">
                <div class="chat-msg-content">${this.formatMessage(this.config?.welcomeMessage || this.t('welcomeDefault'))}</div>
              </div>
            </div>
            ${quickActionsHtml}
            ${quickQuestionsHtml}
          </div>
          <div id="typing-placeholder" style="padding: 0 16px; background: #f8f9fa;"></div>
          <div style="padding: 12px 16px; border-top: 1px solid #eee; display: flex; gap: 10px; background: white;">
            <input id="chat-input" type="text" placeholder="${this.t('typeMessage')}" style="flex:1; padding:12px 16px; border:1px solid #e0e0e0; border-radius:24px; outline:none; font-size:14px; transition:border-color 0.2s, box-shadow 0.2s;" onfocus="this.style.borderColor='${themeColor}';this.style.boxShadow='0 0 0 3px ${themeColor}22'" onblur="this.style.borderColor='#e0e0e0';this.style.boxShadow='none'" />
            <button id="send-btn" style="padding:12px 18px; background:${themeColor}; color:white; border:none; border-radius:24px; cursor:pointer; font-weight:600; font-size:14px; transition:opacity 0.2s, transform 0.1s;" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">${this.t('send')}</button>
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
          btn.style.background = '#f9fafb';
          btn.style.borderColor = themeColor;
          btn.style.color = themeColor;
        });
        btn.addEventListener('mouseout', () => {
          btn.style.background = '#fff';
          btn.style.borderColor = '#e5e7eb';
          btn.style.color = '#555';
        });
      });

      // Attach Quick Action listeners
      const actionChips = container.querySelectorAll('.quick-action-chip');
      actionChips.forEach(chip => {
        chip.addEventListener('click', () => {
          const actionLabel = chip.getAttribute('data-action');
          this.sendQuickQuestion(actionLabel);
        });
        chip.addEventListener('mousedown', () => {
          chip.style.transform = 'scale(0.95)';
        });
        chip.addEventListener('mouseup', () => {
          chip.style.transform = 'scale(1)';
        });
        chip.addEventListener('mouseleave', () => {
          chip.style.transform = 'scale(1)';
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
            <span style="font-size:12px; color:#888;">${this.t('typing')}</span>
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

    async trackConversion(type, data = {}) {
      if (!this.sessionId) {
        console.warn('Cannot track conversion: No active session');
        return;
      }

      try {
        const response = await fetch(`${this.apiUrl}/conversion`, {
          method: 'POST',
          headers: this._buildHeaders(),
          body: JSON.stringify({
            sessionId: this.sessionId,
            type,
            value: data.value,
            metadata: data.metadata
          })
        });

        if (!response.ok) {
          console.warn('Conversion tracking failed:', response.statusText);
        }
      } catch (e) {
        console.error('Conversion tracking error:', e);
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
          // Check if handover action triggered
          if (data.data.action === 'handover') {
            this.appendMessageToUI('bot', data.data.message || "I'm connecting you to an agent.");
            this.renderHandoverOptions(data.data.handoverData);
            return; // Stop processing further
          }

          // ⭐ NEW: Check if lead_capture action triggered
          if (data.data.action === 'lead_capture') {
            this.appendMessageToUI('bot', data.data.message || "Please share your details.");
            this.renderLeadCaptureForm(data.data.leadData);
            return;
          }

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
          this.appendMessageToUI('bot', data.message || this.t('genericError'));
        }
      } catch (error) {
        console.error(error);
        this.appendMessageToUI('bot', this.t('connectionErrorMsg'));
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
    // Render Offline State
    renderOfflineState(message) {
      const container = document.getElementById('chat-window-container');
      if (!container) return;
      const themeColor = this.config?.interfaceColor || '#17876E';
      const botName = (this.config?.assistantName || 'AI Assistant').toUpperCase();
      const channelBtnHtml = this._getChannelButtonHtml();

      container.style.display = 'block';
      container.innerHTML = `
        <div style="width: 380px; height: auto; min-height: 300px; background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden; animation: slideUp 0.3s ease;">
          <!-- Header -->
          <div style="padding: 14px 16px; background: linear-gradient(135deg, ${themeColor} 0%, ${this.adjustColor(themeColor, 15)} 100%); color: white; display: flex; justify-content: space-between; align-items: center;">
             <div style="font-weight: 600; font-size: 15px;">${botName}</div>
             <button id="close-chat" style="background:rgba(255,255,255,0.15);border:none;width:32px;height:32px;border-radius:50%;color:white;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
          </div>

          <!-- Offline Content -->
          <div style="padding: 30px 20px; text-align: center; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
             <div style="font-size: 40px; margin-bottom: 15px;">😴</div>
             <div style="font-size: 16px; font-weight: 600; color: #333; margin-bottom: 8px;">We are currently offline</div>
             <div style="font-size: 14px; color: #666; margin-bottom: 20px; line-height: 1.5;">${message}</div>
             
             <!-- Alternative Channels -->
             <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
                ${this.renderSupportButtons()}
             </div>
          </div>
        </div>
      `;

      document.getElementById('close-chat').onclick = () => {
        this.isOpen = false;
        this.hideChatWindow();
      };
    }

    // Helper to render support buttons
    renderSupportButtons(allowedFlows = null) {
      const contact = this.config?.supportContact || {};
      const supportRequest = this.config?.supportRequest || {};
      let buttons = '';

      // If allowedFlows is provided, use it to filter. Otherwise render ALL available contact options (offline fallback).
      // Note: Backend 'allowedFlows' are IDs like 'email', 'whatsapp', 'phone', 'supportRequest'.

      const shouldRender = (type) => {
        if (!allowedFlows) return true; // Render all if no filter
        if (Array.isArray(allowedFlows)) return allowedFlows.includes(type);
        return allowedFlows === type;
      };

      if (shouldRender('whatsapp') && contact.whatsapp) {
        const num = (contact.whatsappCode || '') + contact.whatsapp;
        const href = `https://wa.me/${num.replace(/\+/g, '')}`;
        buttons += `<a href="${href}" target="_blank" style="display:flex; flex-direction:column; align-items:center; gap:5px; text-decoration:none; color:#333; font-size:12px;">
                <div style="width:40px; height:40px; background:#25D366; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'"><svg width="20" height="20" fill="currentColor" viewBox="0 0 448 512"><path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"></path></svg></div>
                <span>WhatsApp</span>
            </a>`;
      }

      if (shouldRender('email') && contact.email) {
        buttons += `<a href="mailto:${contact.email}" style="display:flex; flex-direction:column; align-items:center; gap:5px; text-decoration:none; color:#333; font-size:12px;">
                <div style="width:40px; height:40px; background:#EA4335; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'"><svg width="20" height="20" fill="currentColor" viewBox="0 0 512 512"><path d="M502.3 190.8c3.9-3.1 9.7-.2 9.7 4.7V400c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V195.6c0-5 5.7-7.8 9.7-4.7 22.4 17.4 52.1 39.5 154.1 113.6 21.1 15.4 56.7 47.8 92.2 47.6 35.7.3 72-32.8 92.3-47.6 102-74.1 131.6-96.3 154-113.7zM256 320c23.2.4 56.6-29.2 73.4-41.4 132.7-96.3 142.8-104.7 173.4-128.7 5.8-4.5 9.2-11.5 9.2-18.9v-19c0-26.5-21.5-48-48-48H48C21.5 64 0 85.5 0 112v19c0 7.4 3.4 14.3 9.2 18.9 30.6 23.9 40.7 32.4 173.4 128.7 16.8 12.2 50.2 41.8 73.4 41.4z"></path></svg></div>
                <span>Email</span>
            </a>`;
      }

      if (shouldRender('phone') && contact.phone) {
        const num = (contact.phoneCode || '') + contact.phone;
        buttons += `<a href="tel:${num}" style="display:flex; flex-direction:column; align-items:center; gap:5px; text-decoration:none; color:#333; font-size:12px;">
                <div style="width:40px; height:40px; background:#4285F4; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'"><svg width="20" height="20" fill="currentColor" viewBox="0 0 512 512"><path d="M493.4 24.6l-104-24c-11.3-2.6-22.9 3.3-27.5 13.9l-48 112c-4.2 9.8-1.4 21.3 6.9 27.4l50 37.4c-28.9 50.6-69.6 91.3-120.2 120.2l-37.4-50c-6.1-8.3-17.6-11.1-27.4-6.9l-112 48C6.2 307.7.3 319.3 2.9 330.6l24 104C29.6 445.8 40.9 455 54.4 455c2.3 0 4.6-.3 6.9-.7 1.1-.2 2.1-.3 3.2-.3 234.3 0 425.6-191.3 425.6-425.6 0-1.2 0-2.3 0-3.5 0-13.6-9.1-25-22.7-27.4-1.2-5.5-2.3-10.9-3.4-16.4z"></path></svg></div>
                <span>Call</span>
            </a>`;
      }

      // Add Support Request if enabled
      if (shouldRender('supportRequest') && supportRequest.email) {
        buttons += `<a href="mailto:${supportRequest.email}?subject=Support Request" style="display:flex; flex-direction:column; align-items:center; gap:5px; text-decoration:none; color:#333; font-size:12px;">
                <div style="width:40px; height:40px; background:#8e44ad; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'"><svg width="20" height="20" fill="currentColor" viewBox="0 0 512 512"><path d="M256 512c141.4 0 256-114.6 256-256S397.4 0 256 0 0 114.6 0 256s114.6 256 256 256zM216 336h24V272h-24c-13.3 0-24-10.7-24-24s10.7-24 24-24h48c13.3 0 24 10.7 24 24v88h8c13.3 0 24 10.7 24 24s-10.7 24-24 24h-80c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"></path></svg></div>
                <span>Ticket</span>
            </a>`;
      }

      return buttons || '<div style="font-size:13px; color:#999; width:100%; text-align:center;">No options available</div>';
    }

    // Render Handover Options
    renderHandoverOptions(handoverData) {
      const messagesDiv = document.getElementById('chat-messages');
      if (!messagesDiv) return;

      const div = document.createElement('div');
      div.style.cssText = `animation: fadeIn 0.3s ease; margin-bottom: 20px; display: flex; justify-content: flex-start;`;

      div.innerHTML = `
          <div style="background: white; padding: 16px; border-radius: 4px 16px 16px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border: 1px solid #eee; width: 85%;">
             <div style="font-size: 13px; font-weight: 600; color: #333; margin-bottom: 12px;">Contact us directly:</div>
             <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                ${this.renderSupportButtons(handoverData)}
             </div>
          </div>
        `;

      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // ⭐ NEW: Render Lead Capture Form
    renderLeadCaptureForm(leadData) {
      const messagesDiv = document.getElementById('chat-messages');
      if (!messagesDiv) return;

      const { type = 'email', mandatory = false } = leadData || {};
      const inputType = type === 'phone' ? 'tel' : 'email';
      const placeholder = type === 'phone' ? 'Phone Number (+1...)' : 'Email Address';
      const themeColor = this.config?.interfaceColor || '#17876E';

      const div = document.createElement('div');
      div.style.cssText = `animation: fadeIn 0.3s ease; margin-bottom: 20px; display: flex; justify-content: flex-start; width: 100%;`;

      const formId = `lead-form-${Date.now()}`;

      div.innerHTML = `
          <div style="background: white; padding: 16px; border-radius: 4px 16px 16px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border: 1px solid #eee; width: 85%;">
             <div style="font-size: 13px; font-weight: 600; color: #333; margin-bottom: 8px;">
               ${mandatory ? 'Information Required' : 'Stay Connected'}
             </div>
             <div style="font-size: 12px; color: #666; margin-bottom: 12px;">
               Please provide your ${type} to continue the conversation.
             </div>
             
             <form id="${formId}" onsubmit="event.preventDefault(); window.CameroAI.widget.submitLeadForm('${formId}', '${type}');">
               <input type="${inputType}" name="contact" placeholder="${placeholder}" required
                 style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; margin-bottom: 8px; outline: none; transition: border 0.2s;"
                 onfocus="this.style.borderColor='${themeColor}'" onblur="this.style.borderColor='#ddd'"
               />
               <button type="submit" style="width: 100%; background: ${themeColor}; color: white; border: none; padding: 8px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
                 Submit
               </button>
               ${!mandatory ? `<button type="button" onclick="this.closest('div').parentElement.remove()" style="width: 100%; background: transparent; color: #999; border: none; padding: 6px; margin-top: 4px; font-size: 11px; cursor: pointer;">Skip</button>` : ''}
             </form>
          </div>
        `;

      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    async submitLeadForm(formId, type) {
      const form = document.getElementById(formId);
      if (!form) return;
      const input = form.querySelector('input[name="contact"]');
      const value = input.value.trim();

      if (!value) return;

      const btn = form.querySelector('button[type="submit"]');
      const originalText = btn.innerText;
      btn.innerText = 'Sending...';
      btn.disabled = true;

      try {
        const body = { sessionId: this.sessionId };
        if (type === 'phone') body.phone = value;
        else body.email = value;

        const response = await fetch(`${this.apiUrl}/lead`, {
          method: 'POST',
          headers: this._buildHeaders(),
          body: JSON.stringify(body)
        });

        if (response.ok) {
          // Replace form with success message
          form.parentElement.innerHTML = `
             <div style="text-align: center; color: #22c55e; font-size: 13px; padding: 10px 0;">
               ✓ Thanks! We'll allow you to continue.
             </div>
           `;
        } else {
          btn.innerText = 'Failed. Try again.';
          btn.disabled = false;
        }
      } catch (e) {
        console.error('Lead submit error', e);
        btn.innerText = originalText;
        btn.disabled = false;
      }
    }
  }

  window.CameroAI = window.CameroAI || {};

  window.initAIChatWidget = function (config) {
    if (!config?.apiKey) return console.error('API key required');
    window.CameroAI.widget = new ChatWidget(config);
  };

  // ⭐ NEW: Expose submitLeadForm helper for inline form usage
  window.CameroAI.submitLeadForm = function (formId, type) {
    if (window.CameroAI.widget) {
      window.CameroAI.widget.submitLeadForm(formId, type);
    }
  };

  window.CameroAI.trackConversion = function (type, data) {
    if (window.CameroAI.widget) {
      window.CameroAI.widget.trackConversion(type, data);
    } else {
      console.warn('CameroAI widget not initialized');
    }
  };

  // Auto-init if config is present (Async support)
  if (window.cameroConfig) {
    window.initAIChatWidget(window.cameroConfig);
  }
})();

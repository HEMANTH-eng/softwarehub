// Public Frontend Vanilla JavaScript

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons if loaded
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // 1. Mobile Menu Toggle
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

  // 2. Download Page Loader & Ad Trigger
  const countdownEl = document.getElementById('countdown');
  const spinnerEl = document.getElementById('loading-spinner');
  const actionAreaEl = document.getElementById('action-area');
  const downloadBtn = document.getElementById('download-trigger');
  
  if (countdownEl && spinnerEl && actionAreaEl && downloadBtn) {
    const duration = parseInt(countdownEl.dataset.duration) || 5;
    let timeLeft = duration;
    
    const interval = setInterval(() => {
      timeLeft--;
      if (countdownEl) {
        countdownEl.textContent = timeLeft;
      }
      
      if (timeLeft <= 0) {
        clearInterval(interval);
        // Hide loader & spinner
        if (spinnerEl) spinnerEl.classList.add('hidden');
        
        // Show Download Actions
        actionAreaEl.classList.remove('hidden');
        
        // Hide loader header/status text or modify it
        const statusText = document.getElementById('loader-status');
        if (statusText) {
          statusText.innerHTML = 'Your download is ready! Click the button below to start.';
        }
        
        // Auto hide social bar if configured to do so
        const socialBar = document.getElementById('social-bar-slot');
        if (socialBar && socialBar.dataset.autoHide === 'true') {
          socialBar.classList.add('hidden');
        }
      }
    }, 1000);

    // Bind Download Button Click for Monetization + File Download
    downloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      
      const softwareId = downloadBtn.dataset.softwareId;
      const adsEnabled = downloadBtn.dataset.adsEnabled === 'true';
      const popunderEnabled = downloadBtn.dataset.popunderEnabled === 'true';
      const popunderZone = downloadBtn.dataset.popunderZone;
      const smartlinkEnabled = downloadBtn.dataset.smartlinkEnabled === 'true';
      const smartlinkZone = downloadBtn.dataset.smartlinkZone;
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // Handle Ads logic on download click
      if (adsEnabled) {
        if (isMobile) {
          // Mobile: Fire Smartlink if enabled and not fired in this session
          if (smartlinkEnabled && smartlinkZone) {
            const firedKey = 'smartlink_fired';
            if (!sessionStorage.getItem(firedKey)) {
              sessionStorage.setItem(firedKey, 'true');
              // Open smartlink ad redirect in new window/tab
              const adUrl = `https://www.highrevenuegate.com/${smartlinkZone}`;
              window.open(adUrl, '_blank');
            }
          }
        } else {
          // Desktop: Fire Popunder if enabled and not fired in this session
          if (popunderEnabled && popunderZone) {
            const firedKey = 'popunder_fired';
            if (!sessionStorage.getItem(firedKey)) {
              sessionStorage.setItem(firedKey, 'true');
              // Open popunder ad page
              const adUrl = `https://www.highrevenuegate.com/${popunderZone}`;
              window.open(adUrl, '_blank');
            }
          }
        }
      }
      
      // Trigger actual software file download stream
      // Setting location to the get-file route initiates the download prompt
      // without leaving the current interstitial page.
      window.location.href = `/get-file/${softwareId}`;
    });
  }

  // 3. Dismissible Social Bar
  const dismissSocialBtn = document.getElementById('dismiss-social-bar');
  const socialBar = document.getElementById('social-bar-slot');
  if (dismissSocialBtn && socialBar) {
    dismissSocialBtn.addEventListener('click', () => {
      socialBar.classList.add('hidden');
      // Store dismissal in sessionStorage so it doesn't show again this session
      sessionStorage.setItem('social_bar_dismissed', 'true');
    });
    
    // Check if previously dismissed
    if (sessionStorage.getItem('social_bar_dismissed') === 'true') {
      socialBar.classList.add('hidden');
    }
  }

  // 4. Back to Top Button
  const backToTopBtn = document.getElementById('back-to-top');
  if (backToTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 400) {
        backToTopBtn.classList.remove('hidden');
        backToTopBtn.classList.add('flex');
      } else {
        backToTopBtn.classList.add('hidden');
        backToTopBtn.classList.remove('flex');
      }
    });
    
    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // 5. Recently Viewed (localStorage-based tracking)
  // Track current page if it's a software detail page
  const detailPageMatch = window.location.pathname.match(/^\/software\/(\d+)\//);
  if (detailPageMatch) {
    const softwareId = detailPageMatch[1];
    // Get software info from the page
    const nameEl = document.querySelector('h1');
    const iconEl = document.querySelector('.w-20.h-20 img, .w-20 img');
    
    if (nameEl) {
      const recentItem = {
        id: softwareId,
        name: nameEl.textContent.trim(),
        icon: iconEl ? iconEl.getAttribute('src') : null,
        url: window.location.pathname,
        timestamp: Date.now()
      };

      let recentlyViewed = [];
      try {
        recentlyViewed = JSON.parse(localStorage.getItem('recently_viewed') || '[]');
      } catch (e) {
        recentlyViewed = [];
      }

      // Remove duplicate if exists
      recentlyViewed = recentlyViewed.filter(item => item.id !== softwareId);
      // Add to front
      recentlyViewed.unshift(recentItem);
      // Keep only last 12
      recentlyViewed = recentlyViewed.slice(0, 12);
      
      localStorage.setItem('recently_viewed', JSON.stringify(recentlyViewed));
    }
  }

  // Render recently viewed section on home page
  const recentlyViewedSection = document.getElementById('recently-viewed-section');
  const recentlyViewedGrid = document.getElementById('recently-viewed-grid');
  if (recentlyViewedSection && recentlyViewedGrid) {
    let recentlyViewed = [];
    try {
      recentlyViewed = JSON.parse(localStorage.getItem('recently_viewed') || '[]');
    } catch (e) {
      recentlyViewed = [];
    }

    if (recentlyViewed.length > 0) {
      recentlyViewedSection.classList.remove('hidden');
      
      recentlyViewed.slice(0, 6).forEach(item => {
        const card = document.createElement('a');
        card.href = item.url;
        card.className = 'bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center gap-2 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-center';
        
        const iconHtml = item.icon 
          ? `<img src="${item.icon}" alt="${item.name}" class="w-10 h-10 rounded-lg object-cover" loading="lazy">`
          : `<div class="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>`;
        
        card.innerHTML = `
          ${iconHtml}
          <span class="text-xs font-semibold text-slate-700 truncate w-full">${item.name}</span>
        `;
        
        recentlyViewedGrid.appendChild(card);
      });

      // Re-initialize lucide icons for the newly added content
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  }
});

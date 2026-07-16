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
});

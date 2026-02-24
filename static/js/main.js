const html = document.documentElement;
const body = document.body;

const clickSound = new Audio('./static/soundeffects/click.mp3');

function playClickSound() {
    clickSound.currentTime = 0;
    clickSound.play().catch(e => console.log('Audio playback prevented:', e));
}

const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');
const randomWallpaperBtn = document.getElementById('randomWallpaperBtn');
const resetWallpaperBtn = document.getElementById('resetWallpaperBtn');
const opacitySlider = document.getElementById('opacitySlider');
const opacityValue = document.getElementById('opacityValue');
const resetAllBtn = document.getElementById('resetAllBtn');
const contextMenu = document.getElementById('contextMenu');

const DEFAULT_WALLPAPER = './static/img/background.jpg';
const WALLPAPER_API = 'https://api.521567.xyz/api/img/bd.php';
const DEFAULT_OPACITY = 70;

const savedTheme = localStorage.getItem('theme') || 'pink';
const savedMode = localStorage.getItem('mode') || 'light';
const savedWallpaper = localStorage.getItem('wallpaper');
const savedOpacity = localStorage.getItem('opacity');

function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    document.querySelectorAll('.color-option').forEach(option => {
        option.classList.remove('active');
        if (option.classList.contains(theme)) {
            option.classList.add('active');
        }
    });
}

function applyMode(mode) {
    if (mode === 'dark') {
        html.setAttribute('data-mode', 'dark');
    } else {
        html.removeAttribute('data-mode');
    }
    localStorage.setItem('mode', mode);
    
    document.querySelectorAll('.mode-option').forEach(option => {
        option.classList.remove('active');
        if (option.getAttribute('data-mode') === mode) {
            option.classList.add('active');
        }
    });
}

function applyWallpaper(wallpaperUrl, skipCache = false) {
    if (wallpaperUrl) {
        const timestamp = new Date().getTime();
        const urlWithCache = wallpaperUrl.includes('?') 
            ? `${wallpaperUrl}&t=${timestamp}` 
            : `${wallpaperUrl}?t=${timestamp}`;
        
        body.style.backgroundImage = `url("${urlWithCache}")`;
        
        if (!skipCache) {
            localStorage.setItem('wallpaper', wallpaperUrl);
        }
    } else {
        body.style.backgroundImage = `url("${DEFAULT_WALLPAPER}")`;
        localStorage.removeItem('wallpaper');
    }
}

function applyOpacity(opacity) {
    const opacityDecimal = opacity / 100;
    const styleElement = document.getElementById('opacity-style');
    
    if (styleElement) {
        styleElement.remove();
    }
    
    const style = document.createElement('style');
    style.id = 'opacity-style';
    style.textContent = `
        body::before {
            opacity: ${opacityDecimal} !important;
        }
    `;
    document.head.appendChild(style);
    
    localStorage.setItem('opacity', opacity);
    
    if (opacityValue) {
        opacityValue.textContent = `${opacity}%`;
    }
}

applyTheme(savedTheme);
applyMode(savedMode);

if (savedWallpaper) {
    applyWallpaper(savedWallpaper, true);
}

if (savedOpacity) {
    applyOpacity(parseInt(savedOpacity));
    if (opacitySlider) {
        opacitySlider.value = savedOpacity;
    }
    if (opacityValue) {
        opacityValue.textContent = `${savedOpacity}%`;
    }
} else {
    applyOpacity(DEFAULT_OPACITY);
}

function openSettings() {
    settingsPanel.classList.add('open');
    settingsOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeSettings() {
    settingsPanel.classList.remove('open');
    settingsOverlay.classList.remove('open');
    document.body.style.overflow = '';
}

if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
        playClickSound();
        openSettings();
    });
}

if (settingsClose) {
    settingsClose.addEventListener('click', (e) => {
        playClickSound();
        closeSettings();
    });
}

if (settingsOverlay) {
    settingsOverlay.addEventListener('click', (e) => {
        playClickSound();
        closeSettings();
    });
}

document.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', () => {
        playClickSound();
        const theme = option.getAttribute('data-theme');
        applyTheme(theme);
    });
});

document.querySelectorAll('.mode-option').forEach(option => {
    option.addEventListener('click', () => {
        playClickSound();
        const mode = option.getAttribute('data-mode');
        applyMode(mode);
    });
});

if (randomWallpaperBtn) {
    randomWallpaperBtn.addEventListener('click', async () => {
        playClickSound();
        randomWallpaperBtn.classList.add('loading');
        
        try {
            const timestamp = new Date().getTime();
            const apiUrl = `${WALLPAPER_API}?t=${timestamp}`;
            
            const response = await fetch(apiUrl, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                if (data.url) {
                    applyWallpaper(data.url);
                } else {
                    applyWallpaper(apiUrl);
                }
            } else {
                applyWallpaper(apiUrl);
            }
        } catch (error) {
            const timestamp = new Date().getTime();
            const apiUrl = `${WALLPAPER_API}?t=${timestamp}`;
            applyWallpaper(apiUrl);
        }
        
        randomWallpaperBtn.classList.remove('loading');
    });
}

if (resetWallpaperBtn) {
    resetWallpaperBtn.addEventListener('click', () => {
        playClickSound();
        applyWallpaper(null);
    });
}

if (opacitySlider && opacityValue) {
    opacitySlider.addEventListener('input', (e) => {
        playClickSound();
        const value = parseInt(e.target.value);
        opacityValue.textContent = `${value}%`;
        applyOpacity(value);
    });
}

if (resetAllBtn) {
    resetAllBtn.addEventListener('click', () => {
        playClickSound();
        if (confirm('确定要重置所有设置为默认值吗？')) {
            localStorage.clear();
            
            applyTheme('pink');
            applyMode('light');
            applyWallpaper(null);
            applyOpacity(DEFAULT_OPACITY);
            
            if (opacitySlider) {
                opacitySlider.value = DEFAULT_OPACITY;
            }
            if (opacityValue) {
                opacityValue.textContent = `${DEFAULT_OPACITY}%`;
            }
            
            const styleElement = document.getElementById('opacity-style');
            if (styleElement) {
                styleElement.remove();
            }
            
            location.reload();
        }
    });
}

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animationPlayState = 'running';
        }
    });
}, observerOptions);

document.querySelectorAll('.fade-in').forEach(el => {
    el.style.animationPlayState = 'paused';
    observer.observe(el);
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        playClickSound();
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

document.querySelectorAll('a[href]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        if (!this.getAttribute('href').startsWith('#')) {
            playClickSound();
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsPanel.classList.contains('open')) {
        closeSettings();
    }
    if (e.key === 'Escape' && contextMenu && contextMenu.classList.contains('open')) {
        contextMenu.classList.remove('open');
    }
});

if (contextMenu) {
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        const x = e.clientX;
        const y = e.clientY;
        const menuWidth = contextMenu.offsetWidth;
        const menuHeight = contextMenu.offsetHeight;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        let menuX = x;
        let menuY = y;
        
        if (x + menuWidth > screenWidth) {
            menuX = screenWidth - menuWidth - 10;
        }
        
        if (y + menuHeight > screenHeight) {
            menuY = screenHeight - menuHeight - 10;
        }
        
        if (menuX < 10) {
            menuX = 10;
        }
        
        if (menuY < 10) {
            menuY = 10;
        }
        
        contextMenu.style.left = `${menuX}px`;
        contextMenu.style.top = `${menuY}px`;
        contextMenu.classList.add('open');
    });
    
    document.addEventListener('click', (e) => {
        if (contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.classList.remove('open');
        }
    });
    
    document.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            playClickSound();
            const action = item.getAttribute('data-action');
            
            switch (action) {
                case 'about':
                    document.querySelector('a[href="#about"]').click();
                    break;
                case 'projects':
                    document.querySelector('a[href="#projects"]').click();
                    break;
                case 'timeline':
                    document.querySelector('a[href="#timeline"]').click();
                    break;
                case 'settings':
                    if (settingsBtn) {
                        settingsBtn.click();
                    }
                    break;
            }
            
            contextMenu.classList.remove('open');
        });
    });
}

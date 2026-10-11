const html = document.documentElement;


const clickSound = new Audio('./static/soundeffects/click.mp3');

function playClickSound() {
    clickSound.currentTime = 0;
    clickSound.play().catch(e => console.log('Audio playback prevented:', e));
}

// 页面加载完成后立即隐藏加载动画，不等待外部资源（如图标）
// 最大等待时间 5 秒，防止网络不好时无限加载
const loadingScreen = document.getElementById('loadingScreen');
let loadingHidden = false;

// 隐藏加载动画的函数
const hideLoading = () => {
    if (loadingHidden || !loadingScreen) return;
    loadingHidden = true;
    loadingScreen.classList.add('hidden');
    setTimeout(() => {
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
    }, 600);
};

// 方案 1: DOM 加载完成后隐藏 (不等待图片和外部资源)
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    // DOM 已经可用，稍后隐藏加载动画
    setTimeout(() => {
        hideLoading();
    }, 500);
} else {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            hideLoading();
        }, 500);
    });
}

// 方案 2: 最大等待时间 5 秒，防止网络不好时无限加载
setTimeout(() => {
    hideLoading();
}, 5000);

window.addEventListener('load', () => {
    // 页面完全加载后也尝试隐藏（如果还没隐藏的话）
    hideLoading();
});

const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');

const resetAllBtn = document.getElementById('resetAllBtn');
const contextMenu = document.getElementById('contextMenu');
const scrollProgress = document.getElementById('scrollProgress');
const backToTop = document.getElementById('backToTop');


window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrollPercent = (scrollTop / docHeight) * 100;
    
    if (scrollProgress) {
        scrollProgress.style.width = scrollPercent + '%';
    }
    
    if (backToTop) {
        if (scrollTop > 300) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    }
});

if (backToTop) {
    backToTop.addEventListener('click', (e) => {
        playClickSound();
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}



const savedTheme = localStorage.getItem('theme') || 'pink';
const savedMode = localStorage.getItem('mode') || 'light';


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



applyTheme(savedTheme);
applyMode(savedMode);



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



if (resetAllBtn) {
    resetAllBtn.addEventListener('click', () => {
        playClickSound();
        if (confirm('确定要重置所有设置为默认值吗？')) {
            localStorage.clear();
            applyTheme('pink');
            applyMode('light');
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
            const offsetTop = target.offsetTop - 60;
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
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
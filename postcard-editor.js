/*
 * postcard-editor.js
 * Logic for the 3-step postcard creation flow (postcard-editor.html).
 *
 * Step 1 – Customize: canvas drawing (colors, brush, eraser, undo), message text, font, accent color.
 * Step 2 – Sender Info: display name / nickname / anonymous, campus location (supports QR ?loc= param).
 * Step 3 – Preview: renders front + back preview, then generates a shareable postcard-view.html link.
 *
 * State is persisted to localStorage so postcard-view.html can load it by ID.
 * A full-size JPG composite (front + back, 1200×800) is also generated and cached in localStorage.
 */

// Global state
let canvas, ctx;
let history = [];
let historyStep = -1;
let currentCategory = '';
let currentCategoryEmoji = '';
let currentAccentColor = '#E8A598';
let templateImage = null;
let selectedDecoItem = null;

// Draw mode state
let isDrawMode = false;
let isPainting = false;
let drawColor = '#000000';
let drawBrushSize = 6;
let isEraser = false;
let lastDrawX = 0, lastDrawY = 0;

// Two-layer system:
//   bgCanvas   = template / background color only
//   drawLayer  = user drawings only (transparent bg)
//   main canvas = composite of both
let bgCanvas = document.createElement('canvas');
let bgCtx = bgCanvas.getContext('2d');
let drawLayer = document.createElement('canvas');
let drawLayerCtx = drawLayer.getContext('2d');

function syncBgCanvas() {
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    bgCtx.fillStyle = currentBgColor || '#FFF8F0';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    if (templateImage && templateImage.src) {
        bgCtx.drawImage(templateImage, 0, 0, bgCanvas.width, bgCanvas.height);
    }
}

function syncDrawLayer() {
    const prev = drawLayerCtx.getImageData(0, 0, drawLayer.width, drawLayer.height);
    drawLayer.width = canvas.width;
    drawLayer.height = canvas.height;
    drawLayerCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
    if (prev.width === canvas.width && prev.height === canvas.height) {
        drawLayerCtx.putImageData(prev, 0, 0);
    }
}

function compositeAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgCanvas, 0, 0);
    ctx.drawImage(drawLayer, 0, 0);
}

const drawColors = [
    '#000000', '#2C3E50', '#E8A598', '#A8B5A0',
    '#D4AF37', '#87CEEB', '#E74C3C', '#FFFFFF'
];

const templates = [
    { src: 'postcard_draft/greetings-large-letter.png',   label: 'Greetings AA' },
    { src: 'postcard_draft/ann-arbor-travel-poster.png',  label: 'Travel Poster' },
    { src: 'postcard_draft/engineered-in-ann-arbor.png',  label: 'Blueprint' },
    { src: 'postcard_draft/greetings-burton-tower.png',   label: 'Burton Tower' },
    { src: 'postcard_draft/snail-mail-co.png',            label: 'Snail Mail' },
    { src: 'postcard_draft/greetings-fountain.png',       label: 'Fountain' },
    { src: 'postcard_draft/little-moment-my-day.png',     label: 'My Moment' },
    { src: 'postcard_draft/greetings-michigan-union.png', label: 'Michigan Union' },
    { src: 'postcard_draft/cozy-cat-library.png',         label: 'Cozy Cat' },
];

const accentColors = [
    { hex: '#A8B5A0', name: 'Sage' },
    { hex: '#E8A598', name: 'Rose' },
    { hex: '#2C3E50', name: 'Navy' },
    { hex: '#D4AF37', name: 'Gold' },
    { hex: '#87CEEB', name: 'Sky' },
    { hex: '#E6E6FA', name: 'Lavender' }
];

const stamps = [
    { text: 'Miss You 💌', color: '#E8A598' },
    { text: 'Wish You Were Here ✈️', color: '#87CEEB' },
    { text: 'Thinking of You 💭', color: '#9370DB' },
    { text: 'Sending Love ❤️', color: '#FF6B6B' },
    { text: 'From Ann Arbor 🏛️', color: '#D4AF37' },
    { text: 'Go Blue! 〽️', color: '#00274C' },
    { text: 'With Love 💝', color: '#FF69B4' },
    { text: "You've Got This! 💪", color: '#A8B5A0' },
    { text: 'Congratulations! 🎉', color: '#FFA500' },
    { text: 'Thank You! 🙏', color: '#8B6914' },
    { text: 'Always in My Heart ♥', color: '#C44569' },
    { text: 'Wishing You Well 🌟', color: '#8B4513' },
];

const stickers = [
    '🌸', '🌺', '🌻', '🌹', '🌷', '🦋', '🐝',
    '⭐', '💫', '✨', '🌙', '☀️', '🌈',
    '❤️', '💕', '💛', '💚', '💙', '💜',
    '🍂', '🍁', '🍀', '🌿', '🍃',
    '☕', '📮', '✉️', '🎀', '🎊', '🎈',
    '〽️', '🏛️', '🌊', '⛵', '🏠',
];

const stampColorOptions = [
    '#E8A598', '#FF6B6B', '#FF69B4', '#C44569',
    '#FFA500', '#D4AF37', '#A8B5A0', '#4CAF50',
    '#87CEEB', '#4169E1', '#00274C', '#9370DB',
    '#000000', '#8B4513', '#2C3E50', '#FFFFFF',
];

let currentStampColor = '#E8A598';
let currentBorder = 'none';

const locationMap = {
    'pierpont_commons_01': 'Pierpont Commons, North Campus',
    'duderstadt_center_01': 'Duderstadt Center, North Campus',
    'ugli_main_01': 'Shapiro Library (UGLi), Central Campus',
    'union_main_01': 'Michigan Union, Central Campus'
};

const categoryTitles = {
    'umich-pride': 'Go Blue!',
    'miss-you': 'Miss You',
    'love': 'With Love',
    'game-day': 'Game Day',
    'graduation': 'Graduation',
    'welcome-wolverine': 'Welcome Wolverine',
    'thank-you': 'Thank You',
    'congrats': 'Congratulations',
    'encouragement': 'Words of Encouragement',
    'birthday': 'Happy Birthday',
    'checking-in': 'Checking In',
    'apology': 'Heartfelt Apology',
};

// ── Canvas ratio ─────────────────────────────────────────────
const canvasRatios = [
    { label: '2:3', w: 600, h: 900 },
    { label: '3:2', w: 900, h: 600 },
    { label: '1:1', w: 700, h: 700 },
    { label: '4:3', w: 800, h: 600 },
    { label: '9:16', w: 600, h: 1067 },
];

function initRatioButtons() {
    const container = document.getElementById('ratioButtons');
    canvasRatios.forEach((r, i) => {
        const btn = document.createElement('button');
        btn.textContent = r.label;
        btn.dataset.idx = i;
        btn.style.cssText = 'padding:3px 10px; border:2px solid var(--sage); border-radius:12px; background:white; font-family:Georgia,serif; font-size:0.78rem; cursor:pointer; transition:all 0.15s;';
        if (i === 0) { btn.style.background = 'var(--sage)'; btn.style.color = 'white'; }
        btn.onclick = () => setCanvasRatio(r, btn);
        container.appendChild(btn);
    });
}

function setCanvasRatio(ratio, clickedBtn) {
    if (!confirm('Changing the canvas ratio will clear your current drawing. Continue?')) return;

    canvas.width = ratio.w;
    canvas.height = ratio.h;

    // Reset draw layer to new size
    drawLayer.width = ratio.w;
    drawLayer.height = ratio.h;
    drawLayerCtx.clearRect(0, 0, ratio.w, ratio.h);

    syncBgCanvas();
    compositeAll();
    saveHistory();

    // Update button styles
    document.querySelectorAll('#ratioButtons button').forEach(b => {
        b.style.background = 'white';
        b.style.color = '';
    });
    clickedBtn.style.background = 'var(--sage)';
    clickedBtn.style.color = 'white';
}
// ─────────────────────────────────────────────────────────────

// ── Canvas background color ───────────────────────────────────
let currentBgColor = '#FFF8F0';

const bgColors = ['#FFF8F0', '#FFFFFF', '#FFF9C4', '#E8F5E9', '#E3F2FD', '#FCE4EC', '#2C3E50'];

function initBgColorPalette() {
    const palette = document.getElementById('bgColorPalette');
    bgColors.forEach(hex => {
        const s = document.createElement('div');
        s.style.cssText = `width:22px; height:22px; border-radius:50%; background:${hex}; cursor:pointer; border:2px solid ${hex === currentBgColor ? 'var(--navy)' : '#ccc'}; flex-shrink:0; transition:transform 0.15s;`;
        s.title = hex;
        s.onclick = () => setCanvasBackground(hex);
        palette.appendChild(s);
    });
}

function setCanvasBackground(hex) {
    currentBgColor = hex;
    syncBgCanvas();
    compositeAll();
    saveHistory();
    // Update swatch borders
    document.querySelectorAll('#bgColorPalette div').forEach(s => {
        s.style.border = s.title === hex ? '2px solid var(--navy)' : '2px solid #ccc';
    });
    document.getElementById('bgColorCustom').value = hex;
}
// ─────────────────────────────────────────────────────────────

// ── Draw mode ────────────────────────────────────────────────
function initDrawMode() {
    // Color swatches
    const palette = document.getElementById('drawColorPalette');
    drawColors.forEach(hex => {
        const s = document.createElement('div');
        s.style.cssText = `width:22px; height:22px; border-radius:50%; background:${hex}; cursor:pointer; border:2px solid ${hex === '#FFFFFF' ? '#ccc' : 'transparent'}; flex-shrink:0; transition:transform 0.15s;`;
        s.title = hex;
        s.onclick = () => setDrawColor(hex);
        palette.appendChild(s);
    });

    // Touch events
    canvas.addEventListener('touchstart', e => {
        if (!isDrawMode) return;
        e.preventDefault();
        const pos = getCanvasPos(e.touches[0].clientX, e.touches[0].clientY);
        startPaint(pos.x, pos.y);
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        if (!isDrawMode || !isPainting) return;
        e.preventDefault();
        const pos = getCanvasPos(e.touches[0].clientX, e.touches[0].clientY);
        paint(pos.x, pos.y);
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
        if (!isDrawMode) return;
        e.preventDefault();
        stopPaint();
    }, { passive: false });

    // Mouse events
    canvas.addEventListener('mousedown', e => {
        if (!isDrawMode) return;
        const pos = getCanvasPos(e.clientX, e.clientY);
        startPaint(pos.x, pos.y);
    });
    canvas.addEventListener('mousemove', e => {
        if (!isDrawMode || !isPainting) return;
        const pos = getCanvasPos(e.clientX, e.clientY);
        paint(pos.x, pos.y);
    });
    canvas.addEventListener('mouseup', () => { if (isDrawMode) stopPaint(); });
    canvas.addEventListener('mouseleave', () => { if (isDrawMode && isPainting) stopPaint(); });
}

function getCanvasPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

function startPaint(x, y) {
    isPainting = true;
    lastDrawX = x;
    lastDrawY = y;
    if (isEraser) {
        eraseAt(x, y, drawBrushSize * 1.5);
    } else {
        drawLayerCtx.save();
        drawLayerCtx.beginPath();
        drawLayerCtx.arc(x, y, drawBrushSize / 2, 0, Math.PI * 2);
        drawLayerCtx.fillStyle = drawColor;
        drawLayerCtx.fill();
        drawLayerCtx.restore();
        compositeAll();
    }
}

function paint(x, y) {
    if (!isPainting) return;
    if (isEraser) {
        const dist = Math.hypot(x - lastDrawX, y - lastDrawY);
        const steps = Math.max(1, Math.floor(dist / 2));
        for (let i = 0; i <= steps; i++) {
            const ix = lastDrawX + (x - lastDrawX) * (i / steps);
            const iy = lastDrawY + (y - lastDrawY) * (i / steps);
            eraseAt(ix, iy, drawBrushSize * 1.5);
        }
    } else {
        drawLayerCtx.save();
        drawLayerCtx.lineCap = 'round';
        drawLayerCtx.lineJoin = 'round';
        drawLayerCtx.lineWidth = drawBrushSize;
        drawLayerCtx.strokeStyle = drawColor;
        drawLayerCtx.beginPath();
        drawLayerCtx.moveTo(lastDrawX, lastDrawY);
        drawLayerCtx.lineTo(x, y);
        drawLayerCtx.stroke();
        drawLayerCtx.restore();
        compositeAll();
    }
    lastDrawX = x;
    lastDrawY = y;
}

function eraseAt(x, y, radius) {
    drawLayerCtx.save();
    drawLayerCtx.globalCompositeOperation = 'destination-out';
    drawLayerCtx.beginPath();
    drawLayerCtx.arc(x, y, radius, 0, Math.PI * 2);
    drawLayerCtx.fillStyle = 'rgba(0,0,0,1)';
    drawLayerCtx.fill();
    drawLayerCtx.restore();
    compositeAll();
}

function stopPaint() {
    if (isPainting) {
        isPainting = false;
        saveHistory();
    }
}

function toggleDrawMode() {
    isDrawMode = !isDrawMode;
    const btn = document.getElementById('drawModeBtn');
    const controls = document.getElementById('drawControls');
    const overlay = document.getElementById('decorationsOverlay');

    if (isDrawMode) {
        btn.style.background = 'var(--sage)';
        btn.style.color = 'white';
        controls.style.display = 'flex';
        canvas.style.cursor = 'crosshair';
        overlay.style.pointerEvents = 'none'; // disable deco interaction while drawing
    } else {
        btn.style.background = 'white';
        btn.style.color = '';
        controls.style.display = 'none';
        canvas.style.cursor = 'default';
        overlay.style.pointerEvents = '';
        isEraser = false;
        document.getElementById('eraserBtn').style.background = 'white';
        document.getElementById('eraserBtn').style.color = '';
    }
}

function setDrawColor(hex) {
    drawColor = hex;
    isEraser = false;
    document.getElementById('eraserBtn').style.background = 'white';
    document.getElementById('eraserBtn').style.color = '';
    document.getElementById('drawColorCustom').value = hex;
    // Highlight active swatch
    document.querySelectorAll('#drawColorPalette div').forEach(s => {
        s.style.border = s.title === hex ? '2px solid var(--navy)' : (s.title === '#FFFFFF' ? '2px solid #ccc' : '2px solid transparent');
        s.style.transform = s.title === hex ? 'scale(1.2)' : 'scale(1)';
    });
}

function setBrushSize(val) {
    drawBrushSize = parseInt(val);
}

function clearDrawing() {
    drawLayerCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
    compositeAll();
    saveHistory();
}

function toggleEraser() {
    isEraser = !isEraser;
    const btn = document.getElementById('eraserBtn');
    btn.style.background = isEraser ? 'var(--navy)' : 'white';
    btn.style.color = isEraser ? 'white' : '';
}
// ─────────────────────────────────────────────────────────────

window.onload = function() {
    initFromParams();
    initCanvas();
    initAccentColors();
    initTemplatePicker();
    initDecorations();
    initEventListeners();
    initDrawMode();
    initRatioButtons();
    initBgColorPalette();
    // Auto-select blank template
    const blankThumb = document.querySelector('.template-thumb');
    if (blankThumb) selectBlankTemplate(blankThumb);
};

function initFromParams() {
    const params = new URLSearchParams(window.location.search);
    currentCategory = params.get('category') || 'custom';
    currentCategoryEmoji = params.get('emoji') || '✨';

    const title = categoryTitles[currentCategory] || 'Custom';
    document.getElementById('editorTitle').textContent = title + ' ' + currentCategoryEmoji;

    const sel = document.getElementById('occasionSelect');
    if (sel) sel.value = currentCategory;

    updateWatermark(title, currentCategoryEmoji);

    const loc = params.get('loc');
    if (loc && locationMap[loc]) {
        document.getElementById('location').value = locationMap[loc];
        document.getElementById('previewLocation').textContent = locationMap[loc];
    }
}

function updateWatermark(title, emoji) {
    const wm = document.getElementById('occasionWatermark');
    if (wm) wm.textContent = emoji + ' ' + title;
}

function onLocationChange(value) {
    const customInput = document.getElementById('locationCustom');
    if (value === '__custom__') {
        customInput.style.display = 'block';
        customInput.focus();
        document.getElementById('previewLocation').textContent = customInput.value || '';
    } else {
        customInput.style.display = 'none';
        document.getElementById('previewLocation').textContent = value || '';
    }
}

function getLocation() {
    const sel = document.getElementById('location');
    if (sel.value === '__custom__') {
        return document.getElementById('locationCustom').value;
    }
    return sel.value;
}

function changeOccasion(category) {
    const sel = document.getElementById('occasionSelect');
    const opt = sel.options[sel.selectedIndex];
    currentCategory = category;
    currentCategoryEmoji = opt.getAttribute('data-emoji') || '✨';
    const title = categoryTitles[currentCategory] || 'Custom';
    document.getElementById('editorTitle').textContent = title + ' ' + currentCategoryEmoji;
    updateWatermark(title, currentCategoryEmoji);
}

function initCanvas() {
    canvas = document.getElementById('drawingCanvas');
    ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawTemplate();
    saveHistory();
}

function drawTemplate() {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * 100;
        const y = centerY + Math.sin(angle) * 100;

        ctx.beginPath();
        ctx.arc(x, y, 70, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, 50, 0, Math.PI * 2);
    ctx.stroke();

    if (currentCategoryEmoji) {
        ctx.font = '60px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#00000020';
        ctx.fillText(currentCategoryEmoji, centerX, centerY);
    }
}

function initTemplatePicker() {
    const grid = document.getElementById('templateGrid');

    // Blank template (first)
    const blankThumb = document.createElement('div');
    blankThumb.className = 'template-thumb';
    blankThumb.title = 'Blank';
    blankThumb.style.cssText = 'background:#FFF8F0; border:2px dashed #A8B5A0; display:inline-flex; align-items:center; justify-content:center; font-size:1.4rem; color:#A8B5A0; cursor:pointer; flex-shrink:0;';
    blankThumb.textContent = '✏️';
    blankThumb.onclick = () => selectBlankTemplate(blankThumb);
    grid.appendChild(blankThumb);

    templates.forEach(t => {
        const thumb = document.createElement('img');
        thumb.src = t.src;
        thumb.className = 'template-thumb';
        thumb.title = t.label;
        thumb.alt = t.label;
        thumb.onclick = () => selectTemplate(t.src, thumb);
        grid.appendChild(thumb);
    });
}

function selectBlankTemplate(thumb) {
    document.querySelectorAll('.template-thumb').forEach(t => t.classList.remove('active'));
    thumb.classList.add('active');

    canvas.width = 600;
    canvas.height = 800;
    const blankImg = new Image();
    blankImg.width = 600;
    blankImg.height = 800;
    templateImage = blankImg;

    syncBgCanvas();
    drawLayer.width = canvas.width;
    drawLayer.height = canvas.height;
    drawLayerCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
    compositeAll();
    saveHistory();
    document.getElementById('blankCanvasControls').style.display = 'block';
}

function selectTemplate(src, thumb) {
    document.querySelectorAll('.template-thumb').forEach(t => t.classList.remove('active'));
    thumb.classList.add('active');
    document.getElementById('blankCanvasControls').style.display = 'none';

    const img = new Image();
    img.onload = () => {
        templateImage = img;
        // Use native image resolution (capped at 1800px wide) for sharp export
        const maxW = Math.min(img.naturalWidth, 1800);
        canvas.width = maxW;
        canvas.height = Math.round(maxW * (img.naturalHeight / img.naturalWidth));
        applyTemplateToCanvas();
        saveHistory();
    };
    img.src = src;
}

function applyTemplateToCanvas() {
    syncBgCanvas();
    drawLayer.width = canvas.width;
    drawLayer.height = canvas.height;
    drawLayerCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
    compositeAll();
}

function initAccentColors() {
    const accentPalette = document.getElementById('accentColors');
    if (!accentPalette) return;
    accentColors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color.hex;
        if (color.hex === currentAccentColor) swatch.classList.add('active');
        swatch.onclick = () => selectAccentColor(color.hex, swatch);
        swatch.title = color.name;
        accentPalette.appendChild(swatch);
    });
}

function initEventListeners() {
    document.getElementById('messageText').addEventListener('input', (e) => {
        document.getElementById('charCount').textContent = e.target.value.length;
    });

    document.getElementById('fontSelect').addEventListener('change', (e) => {
        document.getElementById('messageText').style.fontFamily = e.target.value;
    });

    document.getElementById('stampText').addEventListener('input', updateSelectedStamp);
    document.getElementById('stampOpacity').addEventListener('input', updateSelectedStamp);
    document.getElementById('stampText').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustomStamp(); } });

    document.addEventListener('mousedown', e => {
        if (!e.target.closest('.deco-item') && !e.target.closest('.decoration-panel')) {
            document.querySelectorAll('.deco-item').forEach(i => i.classList.remove('selected'));
            selectedDecoItem = null;
        }
    });
}

function selectAccentColor(color, swatch) {
    currentAccentColor = color;
    document.querySelectorAll('#accentColors .color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
}

function initDecorations() {
    // Preset chips → add stamp immediately
    const presetsContainer = document.getElementById('stampPresets');

    // Custom text button (first)
    const customBtn = document.createElement('button');
    customBtn.className = 'stamp-preset-btn';
    customBtn.textContent = '✏️ Custom Text';
    customBtn.onclick = () => {
        document.getElementById('stampCustomArea').style.display = 'block';
        // Deselect any existing stamp so typing creates a new one
        document.querySelectorAll('.deco-item').forEach(i => i.classList.remove('selected'));
        selectedDecoItem = null;
        const input = document.getElementById('stampText');
        input.value = '';
        // Delay focus until after the element is visible
        requestAnimationFrame(() => input.focus());
    };
    presetsContainer.appendChild(customBtn);

    stamps.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'stamp-preset-btn';
        btn.textContent = s.text;
        btn.onclick = () => {
            document.getElementById('stampCustomArea').style.display = 'block';
            // Deselect so the preset stamp is added fresh, not editing an existing one
            document.querySelectorAll('.deco-item').forEach(i => i.classList.remove('selected'));
            selectedDecoItem = null;
            document.getElementById('stampText').value = s.text;
            addStamp(s.text, s.color);
        };
        presetsContainer.appendChild(btn);
    });

    // Color swatches
    const palette = document.getElementById('stampColorPalette');
    stampColorOptions.forEach(hex => {
        const swatch = document.createElement('div');
        swatch.className = 'stamp-color-swatch' + (hex === currentStampColor ? ' active' : '');
        swatch.style.backgroundColor = hex;
        if (hex === '#FFFFFF') swatch.style.border = '2px solid #ccc';
        swatch.onclick = () => selectStampColor(hex);
        palette.appendChild(swatch);
    });

    // Custom color picker
    document.getElementById('stampColorCustom').addEventListener('input', e => selectStampColor(e.target.value));

    // Emoji picker grid
    const emojiPicker = document.getElementById('emojiPicker');
    stickers.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'sticker-btn';
        btn.textContent = emoji;
        btn.onclick = () => appendEmoji(emoji);
        emojiPicker.appendChild(btn);
    });
}

function toggleEmojiPicker(btn) {
    const picker = document.getElementById('emojiPicker');
    const visible = picker.style.display !== 'none';
    picker.style.display = visible ? 'none' : 'flex';
    btn.style.opacity = visible ? '1' : '0.5';
}

function appendEmoji(emoji) {
    if (selectedDecoItem && selectedDecoItem.dataset.type === 'stamp') {
        const newText = selectedDecoItem.dataset.text + emoji;
        selectedDecoItem.dataset.text = newText;
        selectedDecoItem.querySelector('.stamp-text-content').textContent = newText;
        document.getElementById('stampText').value = newText;
    } else {
        document.getElementById('stampText').value += emoji;
    }
}

function selectStampColor(hex) {
    currentStampColor = hex;
    document.querySelectorAll('.stamp-color-swatch').forEach(s => {
        s.classList.toggle('active', s.style.backgroundColor === hexToRgb(hex));
    });
    if (selectedDecoItem && selectedDecoItem.dataset.type === 'stamp') {
        selectedDecoItem.dataset.color = hex;
        selectedDecoItem.style.color = hex;
    }
}

function selectDecoItem(el) {
    document.querySelectorAll('.deco-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    selectedDecoItem = el;

    if (el.dataset.type === 'stamp') {
        document.getElementById('stampText').value = el.dataset.text;
        const opacity = Math.round(parseFloat(el.dataset.opacity || 0.88) * 100);
        const slider = document.getElementById('stampOpacity');
        slider.value = opacity;
        slider.style.setProperty('--fill', opacity + '%');
        document.getElementById('opacityVal').textContent = opacity;
        selectStampColor(el.dataset.color);
    }
}

function updateSelectedStamp() {
    if (!selectedDecoItem || selectedDecoItem.dataset.type !== 'stamp') return;
    const text = document.getElementById('stampText').value;
    const opacity = parseFloat(document.getElementById('stampOpacity').value) / 100;
    if (text.trim()) {
        selectedDecoItem.dataset.text = text;
        selectedDecoItem.querySelector('.stamp-text-content').textContent = text;
    }
    selectedDecoItem.dataset.opacity = opacity;
    selectedDecoItem.style.opacity = opacity;
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgb(${r}, ${g}, ${b})`;
}

function addCustomStamp() {
    const text = document.getElementById('stampText').value.trim();
    if (!text) { document.getElementById('stampText').focus(); document.getElementById('stampText').style.borderColor='#e74c3c'; return; }
    document.getElementById('stampText').style.borderColor = 'var(--sage)';
    const opacity = parseFloat(document.getElementById('stampOpacity').value) / 100;
    addStamp(text, currentStampColor, opacity);
}

function showDecoTab(tab, clickedBtn) {
    document.querySelectorAll('.deco-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.deco-tab').forEach(btn => btn.classList.remove('active'));
    document.getElementById('decoTab-' + tab).style.display = 'flex';
    if (clickedBtn) clickedBtn.classList.add('active');
}

function storeItemRatios(el) {
    const overlay = document.getElementById('decorationsOverlay');
    const oRect = overlay.getBoundingClientRect();
    if (oRect.width === 0 || oRect.height === 0) return;
    const iRect = el.getBoundingClientRect();
    el.dataset.cxRatio = (iRect.left - oRect.left + iRect.width  / 2) / oRect.width;
    el.dataset.cyRatio = (iRect.top  - oRect.top  + iRect.height / 2) / oRect.height;
    el.dataset.sizeRatio = parseFloat(el.dataset.size) / oRect.width;
}

function addStamp(text, color, opacity = 0.88) {
    if (!templateImage) { alert('Please choose a template first!'); return; }
    const overlay = document.getElementById('decorationsOverlay');
    const rect = overlay.getBoundingClientRect();

    const el = document.createElement('div');
    el.className = 'deco-item deco-stamp';
    el.dataset.type = 'stamp';
    el.dataset.text = text;
    el.dataset.color = color;
    el.dataset.opacity = opacity;

    const initSize = Math.max(rect.width * 0.05, 13);
    el.dataset.size = initSize;
    el.style.cssText = `left:${rect.width*0.35}px; top:${rect.height*0.42}px; font-size:${initSize}px; color:${color}; opacity:${opacity};`;
    el.innerHTML = `<span class="stamp-text-content">${text}</span><button class="deco-delete" onclick="this.parentElement.remove()">×</button><div class="resize-handle"></div>`;

    overlay.appendChild(el);
    requestAnimationFrame(() => storeItemRatios(el));
    makeDraggable(el);
    makeResizable(el, false);
    selectDecoItem(el);
}

function addSticker(emoji) {
    if (!templateImage) { alert('Please choose a template first!'); return; }
    const overlay = document.getElementById('decorationsOverlay');
    const rect = overlay.getBoundingClientRect();

    const el = document.createElement('div');
    el.className = 'deco-item deco-sticker';
    el.dataset.type = 'sticker';
    el.dataset.text = emoji;

    const initSize = Math.max(rect.width * 0.12, 36);
    el.dataset.size = initSize;
    el.style.cssText = `left:${rect.width*0.4}px; top:${rect.height*0.4}px; font-size:${initSize}px; width:${initSize*1.3}px; height:${initSize*1.3}px;`;
    el.innerHTML = `${emoji}<button class="deco-delete" onclick="this.parentElement.remove()">×</button><div class="resize-handle"></div>`;

    overlay.appendChild(el);
    requestAnimationFrame(() => storeItemRatios(el));
    makeDraggable(el);
    makeResizable(el, true);
}

function makeDraggable(el) {
    const onStart = (clientX, clientY) => {
        const startX = clientX, startY = clientY;
        const startL = parseFloat(el.style.left) || 0;
        const startT = parseFloat(el.style.top) || 0;

        const onMove = (cx, cy) => {
            el.style.left = (startL + cx - startX) + 'px';
            el.style.top  = (startT + cy - startY) + 'px';
        };
        const onMouseMove = e => onMove(e.clientX, e.clientY);
        const onTouchMove = e => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); };
        const cleanup = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', cleanup);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', cleanup);
            storeItemRatios(el);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', cleanup);
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', cleanup);
    };
    el.addEventListener('mousedown', e => {
        if (e.target.classList.contains('resize-handle') || e.target.classList.contains('deco-delete')) return;
        e.preventDefault();
        selectDecoItem(el);
        onStart(e.clientX, e.clientY);
    });
    el.addEventListener('touchstart', e => {
        if (e.target.classList.contains('resize-handle') || e.target.classList.contains('deco-delete')) return;
        e.preventDefault();
        selectDecoItem(el);
        onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
}

function makeResizable(el, isSticker) {
    const handle = el.querySelector('.resize-handle');
    const onStart = (clientX, clientY) => {
        const startX = clientX, startY = clientY;
        const startSize = parseFloat(el.dataset.size);
        const onMove = (cx, cy) => {
            const delta = (cx - startX + cy - startY) * 0.15;
            const minSize = isSticker ? 18 : 9;
            const newSize = Math.max(minSize, startSize + delta);
            el.dataset.size = newSize;
            el.style.fontSize = newSize + 'px';
            if (isSticker) { el.style.width = newSize * 1.3 + 'px'; el.style.height = newSize * 1.3 + 'px'; }
        };
        const onMouseMove = e => onMove(e.clientX, e.clientY);
        const onTouchMove = e => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); };
        const cleanup = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', cleanup);
            handle.removeEventListener('touchmove', onTouchMove);
            handle.removeEventListener('touchend', cleanup);
            storeItemRatios(el);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', cleanup);
        handle.addEventListener('touchmove', onTouchMove, { passive: false });
        handle.addEventListener('touchend', cleanup);
    };
    handle.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); onStart(e.clientX, e.clientY); });
    handle.addEventListener('touchstart', e => { e.stopPropagation(); e.preventDefault(); onStart(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
}

function compositeDecorations(targetCtx, targetW, targetH) {
    const overlay = document.getElementById('decorationsOverlay');

    // Try to update ratios if overlay is currently visible
    const oRect = overlay.getBoundingClientRect();
    if (oRect.width > 0 && oRect.height > 0) {
        overlay.querySelectorAll('.deco-item').forEach(item => storeItemRatios(item));
    }

    overlay.querySelectorAll('.deco-item').forEach(item => {
        const cxRatio   = parseFloat(item.dataset.cxRatio);
        const cyRatio   = parseFloat(item.dataset.cyRatio);
        const sizeRatio = parseFloat(item.dataset.sizeRatio);
        if (isNaN(cxRatio) || isNaN(cyRatio) || isNaN(sizeRatio)) return;

        const cx   = cxRatio   * targetW;
        const cy   = cyRatio   * targetH;
        const size = sizeRatio * targetW;
        const text = item.dataset.text;

        targetCtx.save();
        targetCtx.textAlign    = 'center';
        targetCtx.textBaseline = 'middle';

        if (item.dataset.type === 'sticker') {
            targetCtx.font = `${size}px Arial`;
            targetCtx.fillText(text, cx, cy);
        } else {
            const color   = item.dataset.color;
            const opacity = parseFloat(item.dataset.opacity || 0.88);
            targetCtx.globalAlpha = opacity;
            targetCtx.font        = `bold ${size}px Georgia, serif`;
            targetCtx.fillStyle   = color;
            targetCtx.fillText(text, cx, cy);
        }
        targetCtx.restore();
    });
}

function drawRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function selectBorder(borderId, btn) {
    currentBorder = borderId;
    document.querySelectorAll('.border-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function drawBorder(targetCtx, w, h, style) {
    if (style === 'none') return;
    const m = Math.min(w, h) * 0.025;

    targetCtx.save();
    switch (style) {
        case 'classic':
            targetCtx.strokeStyle = 'rgba(0,0,0,0.55)';
            targetCtx.lineWidth = Math.max(w * 0.009, 3);
            targetCtx.strokeRect(m, m, w - m * 2, h - m * 2);
            break;

        case 'vintage':
            targetCtx.strokeStyle = 'rgba(139,90,43,0.75)';
            targetCtx.lineWidth = Math.max(w * 0.009, 3);
            targetCtx.strokeRect(m, m, w - m * 2, h - m * 2);
            targetCtx.lineWidth = Math.max(w * 0.003, 1);
            targetCtx.setLineDash([w * 0.012, w * 0.012]);
            targetCtx.strokeRect(m * 2.2, m * 2.2, w - m * 4.4, h - m * 4.4);
            targetCtx.setLineDash([]);
            break;

        case 'double':
            targetCtx.strokeStyle = 'rgba(0,0,0,0.5)';
            targetCtx.lineWidth = Math.max(w * 0.007, 2);
            targetCtx.strokeRect(m, m, w - m * 2, h - m * 2);
            targetCtx.lineWidth = Math.max(w * 0.003, 1);
            targetCtx.strokeRect(m * 2.5, m * 2.5, w - m * 5, h - m * 5);
            break;

        case 'floral':
            targetCtx.strokeStyle = 'rgba(232,165,152,0.8)';
            targetCtx.lineWidth = Math.max(w * 0.005, 2);
            targetCtx.strokeRect(m, m, w - m * 2, h - m * 2);
            const flowerSize = Math.max(w * 0.08, 32);
            targetCtx.font = `${flowerSize}px Arial`;
            targetCtx.textAlign = 'center';
            targetCtx.textBaseline = 'middle';
            const offset = flowerSize * 0.65;
            targetCtx.fillText('🌸', offset, offset);
            targetCtx.fillText('🌸', w - offset, offset);
            targetCtx.fillText('🌸', offset, h - offset);
            targetCtx.fillText('🌸', w - offset, h - offset);
            break;

        case 'polaroid':
            const bW = m * 2.5;
            const bBot = m * 6;
            targetCtx.fillStyle = 'rgba(255,255,255,0.92)';
            targetCtx.fillRect(0, 0, w, bW);
            targetCtx.fillRect(0, 0, bW, h);
            targetCtx.fillRect(w - bW, 0, bW, h);
            targetCtx.fillRect(0, h - bBot, w, bBot);
            break;
    }
    targetCtx.restore();
}

function clearCanvas() {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (templateImage) {
        ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);
    } else {
        drawTemplate();
    }
    saveHistory();
}

function undo() {
    const overlay = document.getElementById('decorationsOverlay');
    const items = overlay.querySelectorAll('.deco-item');
    if (items.length > 0) items[items.length - 1].remove();
}

function saveHistory() {
    historyStep++;
    history = history.slice(0, historyStep);
    history.push(canvas.toDataURL('image/jpeg', 0.85));
    // Keep max 20 undo steps to avoid memory issues with high-res canvas
    if (history.length > 20) {
        history.shift();
        historyStep = history.length - 1;
    }
}


function generatePostcard() {
    const id = 'pc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext('2d');
    exportCtx.drawImage(canvas, 0, 0);
    compositeDecorations(exportCtx, exportCanvas.width, exportCanvas.height);
    if (currentBorder !== 'none') {
        drawBorder(exportCtx, exportCanvas.width, exportCanvas.height, currentBorder);
    }
    const canvasData = exportCanvas.toDataURL('image/jpeg', 0.85);

    const postcardData = {
        id: id,
        category: currentCategory,
        emoji: currentCategoryEmoji,
        canvasData: canvasData,
        message: document.getElementById('messageText').value,
        font: document.getElementById('fontSelect').value,
        accentColor: currentAccentColor,
        senderName: document.getElementById('senderName').value,
        location: getLocation(),
        createdAt: new Date().toISOString(),
        occasion: document.getElementById('occasionWatermark').textContent || ''
    };

    // Store canvas separately in localStorage for same-device viewing
    try {
        localStorage.setItem('canvas_' + id, canvasData);
    } catch (e) {
        try {
            Object.keys(localStorage).filter(k => k.startsWith('canvas_')).forEach(k => localStorage.removeItem(k));
            localStorage.setItem('canvas_' + id, canvasData);
        } catch (e2) {
            // localStorage full even after cleanup — skip canvas caching, link will still work
        }
    }

    generatePostcardImage(postcardData, id);

    // Encode only text metadata in URL (no canvasData — keeps URL short)
    const urlMeta = {
        id: id,
        category: currentCategory,
        emoji: currentCategoryEmoji,
        message: postcardData.message,
        font: postcardData.font,
        accentColor: postcardData.accentColor,
        senderName: postcardData.senderName,
        location: postcardData.location,
        createdAt: postcardData.createdAt
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(urlMeta)).replace(/%([0-9A-F]{2})/gi, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
    const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    const url = baseUrl + 'postcard-view.html?data=' + encodeURIComponent(encoded);
    document.getElementById('shareUrl').textContent = url;
    document.getElementById('shareModal').classList.add('active');
}

function generatePostcardImage(postcardData, id) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Canvas is already at native template resolution — no upscaling needed
    const scale = 1;
    const frontW = canvas.width * scale;
    const frontH = canvas.height * scale;
    const pad = 10 * scale;
    const gap = 20 * scale;

    tempCanvas.width = frontW * 2 + gap + pad * 2;
    tempCanvas.height = frontH + pad * 2;

    tempCtx.fillStyle = '#FFFFFF';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Front panel
    tempCtx.fillStyle = '#FFF8F0';
    tempCtx.fillRect(pad, pad, frontW, frontH);

    const img = new Image();
    img.onload = () => {
        tempCtx.drawImage(img, pad, pad, frontW, frontH);

        tempCtx.strokeStyle = postcardData.accentColor;
        tempCtx.lineWidth = 3 * scale;
        tempCtx.strokeRect(pad, pad, frontW, frontH);

        // Back panel
        const backX = pad + frontW + gap;
        tempCtx.fillStyle = '#FFF8F0';
        tempCtx.fillRect(backX, pad, frontW, frontH);

        tempCtx.strokeStyle = postcardData.accentColor;
        tempCtx.lineWidth = 3 * scale;
        tempCtx.strokeRect(backX, pad, frontW, frontH);

        // Back panel text — all coords relative to backX, scaled up
        const tx = backX + 40 * scale;
        let ty = 60 * scale;

        // Message text (navy, matching preview)
        tempCtx.fillStyle = '#2C3E50';
        tempCtx.font = `${24 * scale}px ${postcardData.font}`;
        tempCtx.textAlign = 'left';

        const maxWidth = (frontW - 80 * scale);
        const lineHeight = 36 * scale;

        const words = postcardData.message.split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            if (tempCtx.measureText(testLine).width > maxWidth && n > 0) {
                tempCtx.fillText(line, tx, ty);
                line = words[n] + ' ';
                ty += lineHeight;
            } else {
                line = testLine;
            }
        }
        tempCtx.fillText(line, tx, ty);

        // Dashed divider line (matching preview)
        const dividerY = frontH - 140 * scale + pad;
        tempCtx.save();
        tempCtx.setLineDash([8 * scale, 6 * scale]);
        tempCtx.strokeStyle = 'rgba(0,0,0,0.15)';
        tempCtx.lineWidth = 2 * scale;
        tempCtx.beginPath();
        tempCtx.moveTo(backX + 20 * scale, dividerY);
        tempCtx.lineTo(backX + frontW - 20 * scale, dividerY);
        tempCtx.stroke();
        tempCtx.restore();

        // From
        ty = dividerY + 28 * scale;
        tempCtx.font = `bold ${18 * scale}px Georgia`;
        tempCtx.fillStyle = '#2C3E50';
        const senderText = postcardData.senderName || 'Anonymous';
        tempCtx.fillText('From:  ' + senderText, tx, ty);

        // Sent from
        if (postcardData.location) {
            ty += 28 * scale;
            tempCtx.font = `bold ${16 * scale}px Georgia`;
            tempCtx.fillStyle = 'rgba(44,62,80,0.7)';
            tempCtx.fillText('Sent from:  ' + postcardData.location, tx, ty);
        }

        // Occasion watermark
        if (postcardData.occasion) {
            ty += 26 * scale;
            tempCtx.font = `${15 * scale}px Georgia`;
            tempCtx.fillStyle = '#2C3E50';
            tempCtx.fillText(postcardData.occasion, tx, ty);
        }

        const jpgDataUrl = tempCanvas.toDataURL('image/jpeg', 0.85);
        try {
            localStorage.setItem('postcard_jpg_' + id, jpgDataUrl);
        } catch (e) {
            // localStorage full — download will generate on the fly
        }

        updateShareModal(id, jpgDataUrl);
    };
    img.src = postcardData.canvasData;
}

function updateShareModal(id, jpgDataUrl) {
    const existingBtn = document.getElementById('downloadJpgBtn');
    const btn = existingBtn || document.createElement('button');
    btn.id = 'downloadJpgBtn';
    btn.className = 'cta-button';
    btn.style.width = '100%';
    btn.style.marginBottom = '10px';
    btn.innerHTML = '📥 Download as JPG';
    btn.onclick = () => downloadPostcardJpg(id, jpgDataUrl);

    if (!existingBtn) {
        const gmailBtn = document.querySelector('#shareModal .cta-button');
        gmailBtn.after(btn);
    }
}

function downloadPostcardJpg(id, jpgDataUrl) {
    const jpgData = jpgDataUrl || localStorage.getItem('postcard_jpg_' + id);
    if (!jpgData) {
        alert('Image not ready yet. Please wait a moment and try again.');
        return;
    }
    const link = document.createElement('a');
    link.download = `postcard_${id}.jpg`;
    link.href = jpgData;
    link.click();
}

function closeModal() {
    document.getElementById('shareModal').classList.remove('active');
}

function copyLink() {
    const url = document.getElementById('shareUrl').textContent;
    navigator.clipboard.writeText(url).then(() => {
        alert('Link copied to clipboard! 📋');
    });
}

function shareViaGmail() {
    const recipient = document.getElementById('recipientEmail').value.trim();
    if (!recipient) {
        document.getElementById('recipientEmail').focus();
        document.getElementById('recipientEmail').style.borderColor = '#e74c3c';
        return;
    }
    document.getElementById('recipientEmail').style.borderColor = 'var(--sage)';

    const url = document.getElementById('shareUrl').textContent;
    const sender = document.getElementById('senderName').value.trim() || 'Someone Special';
    const subject = encodeURIComponent('✉️ You\'ve got a postcard from ' + sender + '!');
    const body = encodeURIComponent(
        `💌  A postcard is waiting for you!\n` +
        `${'─'.repeat(40)}\n\n` +
        `  From:   ${sender}\n` +
        `  To:     You\n\n` +
        `${'─'.repeat(40)}\n\n` +
        `  Tap the link below to open your postcard:\n\n` +
        `  → ${url}\n\n` +
        `${'─'.repeat(40)}\n` +
        `  Sent with PostCard · University of Michigan`
    );
    const webUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(recipient)}&su=${subject}&body=${body}`;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isIOS) {
        // When Gmail app opens, the browser page becomes hidden (visibilitychange fires).
        // Only fall back to web if the page never went hidden after 2s (= app not installed).
        const gmailAppUrl = `googlegmail://co?to=${encodeURIComponent(recipient)}&subject=${subject}&body=${body}`;
        let appOpened = false;

        const onHide = () => { if (document.hidden) appOpened = true; };
        document.addEventListener('visibilitychange', onHide);

        window.location.href = gmailAppUrl;

        setTimeout(() => {
            document.removeEventListener('visibilitychange', onHide);
            if (!appOpened) window.open(webUrl, '_blank');
        }, 2000);
    } else if (isAndroid) {
        window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${subject}&body=${body}`;
    } else {
        window.open(webUrl, '_blank');
    }
}

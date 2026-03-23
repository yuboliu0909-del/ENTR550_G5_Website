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
let isDrawing = false;
let currentColor = '#000000';
let currentTool = 'draw';
let brushSize = 3;
let history = [];
let historyStep = -1;
let currentCategory = '';
let currentCategoryEmoji = '';
let currentAccentColor = '#E8A598';
let templateImage = null;

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

const colors = [
    '#000000', '#E8A598', '#A8B5A0', '#2C3E50', '#D4AF37',
    '#87CEEB', '#E6E6FA', '#FF6B6B', '#FFA500', '#FFD700',
    '#90EE90', '#4169E1', '#9370DB', '#FF69B4', '#8B4513'
];

const accentColors = [
    { hex: '#A8B5A0', name: 'Sage' },
    { hex: '#E8A598', name: 'Rose' },
    { hex: '#2C3E50', name: 'Navy' },
    { hex: '#D4AF37', name: 'Gold' },
    { hex: '#87CEEB', name: 'Sky' },
    { hex: '#E6E6FA', name: 'Lavender' }
];

const locationMap = {
    'pierpont_commons_01': 'Pierpont Commons, North Campus',
    'duderstadt_center_01': 'Duderstadt Center, North Campus',
    'ugli_main_01': 'Shapiro Library (UGLi), Central Campus',
    'union_main_01': 'Michigan Union, Central Campus'
};

const categoryTitles = {
    'thank-you': 'Thank You',
    'miss-you': 'Miss You',
    'congrats': 'Congratulations',
    'encouragement': 'Words of Encouragement',
    'apology': 'Heartfelt Apology',
    'love': 'With Love',
    'checking-in': 'Checking In',
    'birthday': 'Happy Birthday',
    'get-well': 'Get Well Soon',
    'umich-pride': 'Go Blue!'
};

window.onload = function() {
    initFromParams();
    initCanvas();
    initColorPalettes();
    initTemplatePicker();
    initEventListeners();
};

function initFromParams() {
    const params = new URLSearchParams(window.location.search);
    currentCategory = params.get('category') || 'custom';
    currentCategoryEmoji = params.get('emoji') || '✨';

    const title = categoryTitles[currentCategory] || 'Custom';
    document.getElementById('editorTitle').textContent = title + ' ' + currentCategoryEmoji;

    const loc = params.get('loc');
    if (loc && locationMap[loc]) {
        document.getElementById('location').value = locationMap[loc];
    }
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

function selectTemplate(src, thumb) {
    document.querySelectorAll('.template-thumb').forEach(t => t.classList.remove('active'));
    thumb.classList.add('active');

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
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (templateImage) {
        ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);
    }
}

function initColorPalettes() {
    const palette = document.getElementById('colorPalette');
    colors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        if (color === currentColor) swatch.classList.add('active');
        swatch.onclick = () => selectColor(color, swatch);
        palette.appendChild(swatch);
    });

    const accentPalette = document.getElementById('accentColors');
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
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    canvas.addEventListener('touchstart', handleTouch);
    canvas.addEventListener('touchmove', handleTouch);
    canvas.addEventListener('touchend', stopDrawing);

    document.getElementById('brushSize').addEventListener('input', (e) => {
        brushSize = e.target.value;
    });

    document.getElementById('messageText').addEventListener('input', (e) => {
        document.getElementById('charCount').textContent = e.target.value.length;
    });

    document.getElementById('fontSelect').addEventListener('change', (e) => {
        document.getElementById('messageText').style.fontFamily = e.target.value;
    });

}

function selectColor(color, swatch) {
    currentColor = color;
    currentTool = 'draw';
    document.querySelectorAll('#colorPalette .color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
}

function selectAccentColor(color, swatch) {
    currentAccentColor = color;
    document.querySelectorAll('#accentColors .color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
}

function setTool(tool, btn) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

function startDrawing(e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    ctx.beginPath();
    ctx.moveTo(x, y);
}

function draw(e) {
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (currentTool === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = currentColor;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
}

function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        saveHistory();
    }
}

function handleTouch(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : 'mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
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
    if (historyStep > 0) {
        historyStep--;
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = history[historyStep];
    }
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

function goToStep(step) {
    if (step === 2) {
        const message = document.getElementById('messageText').value.trim();
        if (!message) {
            alert('Please write a message for your postcard!');
            return;
        }
    }

    document.querySelectorAll('.editor-step').forEach(s => s.style.display = 'none');
    document.getElementById('editor-step' + step).style.display = 'block';

    if (step === 3) {
        // Call after step is visible so clientWidth is correct
        requestAnimationFrame(updatePreview);
    }

    for (let i = 1; i <= 3; i++) {
        const circle = document.getElementById('step' + i);
        if (i <= step) {
            circle.classList.add('active');
        } else {
            circle.classList.remove('active');
        }
    }

    window.scrollTo(0, 0);
}

function updatePreview() {
    const previewCanvas = document.getElementById('previewCanvas');
    // Match drawing canvas resolution exactly — CSS width:100% handles display scaling
    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.drawImage(canvas, 0, 0);

    const message = document.getElementById('messageText').value;
    const font = document.getElementById('fontSelect').value;
    const previewMessage = document.getElementById('previewMessage');
    previewMessage.textContent = message;
    previewMessage.style.fontFamily = font;
    previewMessage.style.color = currentAccentColor;

    const senderName = document.getElementById('senderName').value;
    const senderSpan = document.querySelector('#previewSender span');
    senderSpan.textContent = senderName || 'Anonymous';

    const location = document.getElementById('location').value;
    document.querySelector('#previewLocation span').textContent = location || 'Ann Arbor, MI';
}

function generatePostcard() {
    const id = 'pc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);

    const canvasData = canvas.toDataURL('image/jpeg', 0.85);

    const postcardData = {
        id: id,
        category: currentCategory,
        emoji: currentCategoryEmoji,
        canvasData: canvasData,
        message: document.getElementById('messageText').value,
        font: document.getElementById('fontSelect').value,
        accentColor: currentAccentColor,
        senderName: document.getElementById('senderName').value,
        location: document.getElementById('location').value,
        createdAt: new Date().toISOString()
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

        tempCtx.fillStyle = postcardData.accentColor;
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

        ty = frontH - 120 * scale;
        tempCtx.font = `${20 * scale}px Georgia`;
        tempCtx.fillStyle = '#2C3E50';
        const senderText = postcardData.senderName || 'Anonymous';
        tempCtx.fillText('From: ' + senderText, tx, ty);

        if (postcardData.location) {
            ty += 30 * scale;
            tempCtx.font = `${16 * scale}px Georgia`;
            tempCtx.fillStyle = '#2C3E5080';
            tempCtx.fillText('Sent from: ' + postcardData.location, tx, ty);
        }

        // Stamp
        const stampSize = 80 * scale;
        const stampX = backX + frontW - stampSize - 20 * scale;
        const stampY = frontH - stampSize - 20 * scale + pad;
        tempCtx.strokeStyle = postcardData.accentColor;
        tempCtx.lineWidth = 4 * scale;
        tempCtx.strokeRect(stampX, stampY, stampSize, stampSize);
        tempCtx.font = `${40 * scale}px Arial`;
        tempCtx.textAlign = 'center';
        tempCtx.fillStyle = '#000';
        tempCtx.fillText('💌', stampX + stampSize / 2, stampY + stampSize * 0.7);

        // Date
        tempCtx.font = `${12 * scale}px Georgia`;
        tempCtx.fillStyle = '#2C3E5060';
        tempCtx.textAlign = 'right';
        const date = new Date(postcardData.createdAt).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric'
        });
        tempCtx.fillText(date, backX + frontW - 10 * scale, frontH + pad - 10 * scale);

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
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
        window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${subject}&body=${body}`;
    } else {
        window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(recipient)}&su=${subject}&body=${body}`, '_blank');
    }
}

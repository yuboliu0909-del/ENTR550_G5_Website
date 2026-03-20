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

    document.querySelectorAll('input[name="senderMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const nameInput = document.getElementById('senderName');
            if (e.target.value === 'anonymous') {
                nameInput.disabled = true;
                nameInput.value = '';
            } else {
                nameInput.disabled = false;
            }
        });
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

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
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
    drawTemplate();
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
    history.push(canvas.toDataURL());
}

function goToStep(step) {
    if (step === 2) {
        const message = document.getElementById('messageText').value.trim();
        if (!message) {
            alert('Please write a message for your postcard!');
            return;
        }
    }

    if (step === 3) {
        updatePreview();
    }

    document.querySelectorAll('.editor-step').forEach(s => s.style.display = 'none');
    document.getElementById('editor-step' + step).style.display = 'block';

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
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);

    const message = document.getElementById('messageText').value;
    const font = document.getElementById('fontSelect').value;
    const previewMessage = document.getElementById('previewMessage');
    previewMessage.textContent = message;
    previewMessage.style.fontFamily = font;
    previewMessage.style.color = currentAccentColor;

    const senderMode = document.querySelector('input[name="senderMode"]:checked').value;
    const senderName = document.getElementById('senderName').value;
    const senderSpan = document.querySelector('#previewSender span');

    if (senderMode === 'anonymous') {
        senderSpan.textContent = 'A Friend ✨';
    } else {
        senderSpan.textContent = senderName || 'Anonymous';
    }

    const location = document.getElementById('location').value;
    document.querySelector('#previewLocation span').textContent = location || 'Ann Arbor, MI';
}

function generatePostcard() {
    const id = 'pc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const postcardData = {
        id: id,
        category: currentCategory,
        emoji: currentCategoryEmoji,
        canvasData: canvas.toDataURL(),
        message: document.getElementById('messageText').value,
        font: document.getElementById('fontSelect').value,
        accentColor: currentAccentColor,
        senderMode: document.querySelector('input[name="senderMode"]:checked').value,
        senderName: document.getElementById('senderName').value,
        location: document.getElementById('location').value,
        createdAt: new Date().toISOString()
    };

    localStorage.setItem('postcard_' + id, JSON.stringify(postcardData));

    generatePostcardImage(postcardData, id);

    const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    const url = baseUrl + 'postcard-view.html?view=' + id;
    document.getElementById('shareUrl').textContent = url;
    document.getElementById('shareModal').classList.add('active');
}

function generatePostcardImage(postcardData, id) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    tempCanvas.width = 1200;
    tempCanvas.height = 800;

    tempCtx.fillStyle = '#FFFFFF';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tempCtx.fillStyle = '#FFF8F0';
    tempCtx.fillRect(10, 10, 580, 780);

    const img = new Image();
    img.onload = () => {
        tempCtx.drawImage(img, 20, 20, 560, 747);

        tempCtx.strokeStyle = postcardData.accentColor;
        tempCtx.lineWidth = 3;
        tempCtx.strokeRect(10, 10, 580, 780);

        tempCtx.fillStyle = '#FFF8F0';
        tempCtx.fillRect(610, 10, 580, 780);

        tempCtx.strokeStyle = postcardData.accentColor;
        tempCtx.lineWidth = 3;
        tempCtx.strokeRect(610, 10, 580, 780);

        tempCtx.fillStyle = postcardData.accentColor;
        tempCtx.font = `24px ${postcardData.font}`;
        tempCtx.textAlign = 'left';

        const maxWidth = 520;
        const lineHeight = 36;
        const x = 650;
        let y = 60;

        const words = postcardData.message.split(' ');
        let line = '';

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const testWidth = tempCtx.measureText(testLine).width;

            if (testWidth > maxWidth && n > 0) {
                tempCtx.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        tempCtx.fillText(line, x, y);

        y = 680;
        tempCtx.font = '20px Georgia';
        tempCtx.fillStyle = '#2C3E50';

        tempCtx.fillText('From:', x, y);
        const senderText = postcardData.senderMode === 'anonymous'
            ? 'A Friend ✨'
            : postcardData.senderName || 'Anonymous';
        tempCtx.fillText(senderText, x + 70, y);

        if (postcardData.location) {
            y += 30;
            tempCtx.font = '16px Georgia';
            tempCtx.fillStyle = '#2C3E5080';
            tempCtx.fillText('Sent from: ' + postcardData.location, x, y);
        }

        tempCtx.strokeStyle = postcardData.accentColor;
        tempCtx.lineWidth = 4;
        tempCtx.strokeRect(1090, 650, 80, 80);
        tempCtx.font = '40px Arial';
        tempCtx.textAlign = 'center';
        tempCtx.fillText('💌', 1130, 705);

        tempCtx.font = '12px Georgia';
        tempCtx.fillStyle = '#2C3E5060';
        tempCtx.textAlign = 'right';
        const date = new Date(postcardData.createdAt).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        tempCtx.fillText(date, 1160, 750);

        const jpgDataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
        localStorage.setItem('postcard_jpg_' + id, jpgDataUrl);

        updateShareModal(id);
    };
    img.src = postcardData.canvasData;
}

function updateShareModal(id) {
    const existingBtn = document.getElementById('downloadJpgBtn');
    if (!existingBtn) {
        const downloadBtn = document.createElement('button');
        downloadBtn.id = 'downloadJpgBtn';
        downloadBtn.className = 'cta-button';
        downloadBtn.style.width = '100%';
        downloadBtn.style.marginBottom = '10px';
        downloadBtn.innerHTML = '📥 Download as JPG';
        downloadBtn.onclick = () => downloadPostcardJpg(id);

        const shareBtn = document.querySelector('#shareModal .cta-button');
        shareBtn.parentNode.insertBefore(downloadBtn, shareBtn);
    }
}

function downloadPostcardJpg(id) {
    const jpgData = localStorage.getItem('postcard_jpg_' + id);
    if (!jpgData) {
        alert('Image not ready yet. Please wait a moment and try again.');
        return;
    }

    const link = document.createElement('a');
    link.download = `postcard_${id}.jpg`;
    link.href = jpgData;
    link.click();

    alert('Your postcard has been downloaded! 🎉');
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

function shareViaEmail() {
    const url = document.getElementById('shareUrl').textContent;
    const subject = encodeURIComponent('You received a postcard! 💌');
    const body = encodeURIComponent(
        `Someone sent you a virtual postcard!\n\n` +
        `View it here: ${url}\n\n` +
        `Created with love from campus.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

/*
 * postcard-view.js
 * Logic for the received-postcard page (postcard-view.html).
 *
 * On load: reads the ?view=<id> URL parameter, fetches the postcard data
 * from localStorage, and renders the front canvas and back message/sender/location.
 *
 * Also handles JPG download: uses a pre-generated image if available,
 * otherwise regenerates the full 1200×800 composite on the fly.
 */

window.onload = function() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('view');
    if (id) {
        loadPostcard(id);
    } else {
        document.getElementById('view').innerHTML =
            '<p style="text-align:center; font-size:1.5rem; padding:60px 20px;">No postcard found. <a href="Postcard.html">Create one!</a></p>';
    }
};

function loadPostcard(id) {
    const data = localStorage.getItem('postcard_' + id);

    if (!data) {
        alert('Postcard not found!');
        window.location.href = 'Postcard.html';
        return;
    }

    const postcard = JSON.parse(data);

    const img = new Image();
    img.onload = () => {
        const viewCanvas = document.createElement('canvas');
        viewCanvas.width = 300;
        viewCanvas.height = 400;
        viewCanvas.style.maxWidth = '100%';
        viewCanvas.style.borderRadius = '10px';
        const viewCtx = viewCanvas.getContext('2d');
        viewCtx.drawImage(img, 0, 0, viewCanvas.width, viewCanvas.height);

        document.getElementById('viewFront').innerHTML = '';
        document.getElementById('viewFront').appendChild(viewCanvas);
    };
    img.src = postcard.canvasData;

    const viewMessage = document.getElementById('viewMessage');
    viewMessage.textContent = postcard.message;
    viewMessage.style.fontFamily = postcard.font;
    viewMessage.style.color = postcard.accentColor;

    const senderSpan = document.querySelector('#viewSender span');
    if (postcard.senderMode === 'anonymous') {
        senderSpan.textContent = 'A Friend ✨';
    } else {
        senderSpan.textContent = postcard.senderName || 'Someone Special';
    }

    document.querySelector('#viewLocation span').textContent = postcard.location || 'Ann Arbor, MI';
}

function downloadViewedPostcard() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('view');
    if (!id) return;

    const jpgData = localStorage.getItem('postcard_jpg_' + id);
    if (jpgData) {
        const link = document.createElement('a');
        link.download = `postcard_${id}.jpg`;
        link.href = jpgData;
        link.click();
        alert('Postcard downloaded! 🎉');
    } else {
        const postcardData = JSON.parse(localStorage.getItem('postcard_' + id));
        if (!postcardData) return;
        generatePostcardImageForDownload(postcardData, id);
    }
}

function generatePostcardImageForDownload(postcardData, id) {
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

        const link = document.createElement('a');
        link.download = `postcard_${id}.jpg`;
        link.href = jpgDataUrl;
        link.click();

        alert('Postcard downloaded! 🎉');
    };
    img.src = postcardData.canvasData;
}

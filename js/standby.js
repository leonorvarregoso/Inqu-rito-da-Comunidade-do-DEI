// resolução da grelha de píxeis
const SB_COLS = 324;
const SB_ROWS = 64;

const standbyOverlay = document.getElementById('standbyOverlay');
const standbyCanvas  = document.getElementById('standbyCanvas');
const sbCtx          = standbyCanvas.getContext('2d');
const standbyBtn     = document.getElementById('standbyBtn');
const standbyProg    = document.getElementById('standbyProg');
const standbyVariableText = document.getElementById('standbyVariableText');

// estado
let sbActive   = true;
let sbTime     = 0;
let sbMaskData = null;
let sbProximity = { x: 0.5, y: 0.5, active: false };
let sbLetters = [];

const SB_FROM_WEIGHT = 200;
const SB_TO_WEIGHT = 900;

// canvas interno para suavizar a máscara com blur e fade entre frames
const maskBlurCanvas = document.createElement('canvas');
const mbCtx          = maskBlurCanvas.getContext('2d', { willReadFrequently: true });
maskBlurCanvas.width  = SB_COLS;
maskBlurCanvas.height = SB_ROWS;

// noise com três harmónicas  movimento quadrados
function sbNoise(x, y, t) {
    return Math.sin(x * 0.04 + t) +
        Math.cos(y * 0.04 - t * 0.7) +
        Math.sin((x + y) * 0.02 + t * 0.5);
}

// forma de fundo — padrão sinusoidal que cobre o ecrã inteiro
function sbShape(x, y) {
    const cx = SB_COLS / 2;
    const cy = SB_ROWS / 2;
    const dx = (x - cx) / SB_COLS;
    const dy = (y - cy) / SB_ROWS;
    return Math.sin(dx * 5.5) + Math.cos(dy * 5.5);
}

function sbUpdateMask(maskSource) {
    if (!maskSource) { sbMaskData = null; return; }

    mbCtx.save();

    // fade do frame anterior
    mbCtx.globalCompositeOperation = 'source-over';
    mbCtx.fillStyle = 'black';
    mbCtx.globalAlpha = 0.4;
    mbCtx.fillRect(0, 0, SB_COLS, SB_ROWS);

    // nova máscara com blur para suavizar os contornos
    mbCtx.globalCompositeOperation = 'lighter';
    mbCtx.globalAlpha = 1.0;
    mbCtx.filter = 'blur(6px)';
    mbCtx.drawImage(maskSource, 0, 0, SB_COLS, SB_ROWS);

    mbCtx.restore();

    sbMaskData = mbCtx.getImageData(0, 0, SB_COLS, SB_ROWS).data;
}

// lê a intensidade da silhueta numa célula da grelha
function sbSilhouette(col, row) {
    if (!sbMaskData) return 0;
    const mi = (row * SB_COLS + col) * 4;
    return sbMaskData[mi] / 255.0;
}

function sbInitVariableText() {
    if (!standbyVariableText || standbyVariableText.dataset.ready === '1') return;
    const label = standbyVariableText.textContent.trim();
    standbyVariableText.textContent = '';
    sbLetters = [];

    label.split(' ').forEach((word, wi, words) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'standby-word';

        word.split('').forEach(ch => {
            const span = document.createElement('span');
            span.className = 'standby-letter';
            span.textContent = ch;
            span.style.fontWeight = SB_FROM_WEIGHT;
            span.setAttribute('aria-hidden', 'true');
            wordSpan.appendChild(span);
            sbLetters.push(span);
        });

        standbyVariableText.appendChild(wordSpan);

        if (wi < words.length - 1) {
            const space = document.createElement('span');
            space.style.display = 'inline-block';
            space.innerHTML = '&nbsp;';
            standbyVariableText.appendChild(space);
        }
    });

    standbyVariableText.dataset.ready = '1';
}

function sbSetProximityPosition(x, y, active = true) {
    sbProximity = {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
        active
    };
}

function sbUpdateVariableText() {
    if (!standbyVariableText || !sbLetters.length) return;

    const overlayRect = standbyOverlay.getBoundingClientRect();
    const targetX = overlayRect.left + sbProximity.x * overlayRect.width;
    const targetY = overlayRect.top + sbProximity.y * overlayRect.height;
    const radiusBase = Math.min(overlayRect.width, overlayRect.height) * 0.2;
    const radius = Math.min(260, Math.max(160, radiusBase));

    sbLetters.forEach(letter => {
        const rect = letter.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const distance = Math.hypot(targetX - cx, targetY - cy);

        if (!sbProximity.active || distance >= radius) {
            letter.style.fontWeight = SB_FROM_WEIGHT;
            return;
        }

        const t = 1 - distance / radius;
        const smooth = t * t * (3 - 2 * t);
        const weight = SB_FROM_WEIGHT + (SB_TO_WEIGHT - SB_FROM_WEIGHT) * smooth;

        letter.style.fontWeight = Math.round(weight);
    });
}

// renderiza um frame com fundo creme e manchas animadas
function sbRender() {
    sbTime += 0.0035;

    standbyCanvas.width  = CANVAS_W;
    standbyCanvas.height = CANVAS_H;

    sbCtx.fillStyle = '#f8eee5';
    sbCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const cellW = CANVAS_W / SB_COLS;
    const cellH = CANVAS_H / SB_ROWS;
    const t     = sbTime;

    for (let y = 0; y < SB_ROWS; y++) {
        for (let x = 0; x < SB_COLS; x++) {
            const sil = sbSilhouette(x, y);
            const n   = sbNoise(x, y, t);
            const s   = sbShape(x, y);

            // silhueta da pessoa
            let v = (n * 0.5 + s * 0.7) + (sil * 2.8) + Math.sin(t + x * 0.01) * 0.3;
            v = Math.tanh(v);

            if (v < -0.15) continue;

            const breathe = 0.7 + Math.sin(t * 2 + x * 0.02 + y * 0.02) * 0.3;
            const size    = (0.5 + Math.abs(v)) * breathe;
            const offsetX = Math.sin(t + y * 0.02) * 0.5;
            const offsetY = Math.cos(t + x * 0.02) * 0.5;

            // gradiente de cor baseado na posição e no tempo
            const gradColors = ['#ffb7b8', '#fa450e', '#d9c667', '#ffb7b8'];
            const gradStops = [0, 0.33, 0.66, 1.0];
            // valor normalizado [0,1] combinando posição e noise para percorrer o gradiente
            const tCol = ((x / SB_COLS + y / SB_ROWS) * 0.5 + n * 0.15 + t * 0.08) % 1;
            const tColAbs = tCol < 0 ? tCol + 1 : tCol;
            // interpolar entre as cores do gradiente
            let cellColor = gradColors[0];
            for (let gi = 0; gi < gradStops.length - 1; gi++) {
                if (tColAbs >= gradStops[gi] && tColAbs <= gradStops[gi + 1]) {
                    const localT = (tColAbs - gradStops[gi]) / (gradStops[gi + 1] - gradStops[gi]);
                    const c1 = gradColors[gi], c2 = gradColors[gi + 1];
                    const r1 = parseInt(c1.slice(1,3),16), g1 = parseInt(c1.slice(3,5),16), b1 = parseInt(c1.slice(5,7),16);
                    const r2 = parseInt(c2.slice(1,3),16), g2 = parseInt(c2.slice(3,5),16), b2 = parseInt(c2.slice(5,7),16);
                    const ri = Math.round(r1 + (r2-r1)*localT);
                    const gi2 = Math.round(g1 + (g2-g1)*localT);
                    const bi = Math.round(b1 + (b2-b1)*localT);
                    cellColor = `rgb(${ri},${gi2},${bi})`;
                    break;
                }
            }
            sbCtx.fillStyle = cellColor;
            sbCtx.fillRect(
                x * cellW + offsetX,
                y * cellH + offsetY,
                cellW * size,
                cellH * size
            );
        }
    }

    sbUpdateVariableText();
}

// loop de animação
function sbAnimLoop() {
    if (!sbActive) return;
    sbRender();
    requestAnimationFrame(sbAnimLoop);
}

// saída do standby — fade out e chama o callback onStandbyExit
function sbExit() {
    if (!sbActive) return;
    sbActive = false;
    standbyOverlay.classList.add('leaving');

    let didExit = false;
    const finishExit = () => {
        if (didExit) return;
        didExit = true;
        standbyOverlay.style.display = 'none';
        if (typeof onStandbyExit === 'function') onStandbyExit();
    };

    standbyOverlay.addEventListener('transitionend', finishExit, { once: true });
    setTimeout(finishExit, 1400);
}

// reentrada no standby reset e volta ao inicio
function sbEnter() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    curScreen = 0;

    // parar o loop anterior antes de reiniciar
    sbActive = false;

    // pequeno delay para garantir que o frame anterior do RAF terminou
    setTimeout(() => {
        sbMaskData = null;
        sbTime     = 0;
        mbCtx.clearRect(0, 0, SB_COLS, SB_ROWS);

        standbyOverlay.style.display = 'block';
        standbyOverlay.classList.remove('leaving');
        standbyOverlay.style.opacity = '1';

        // resetar o timer de presença
        if (typeof sbResetPresence === 'function') sbResetPresence();
        sbUpdatePresenceProgress(0);

        sbActive = true;
        sbAnimLoop();

        if (typeof sbResumePresenceIfCentered === 'function') {
            setTimeout(sbResumePresenceIfCentered, 120);
        }
    }, 50);
}

// atualiza o anel de progresso SVG do botão central
function sbUpdatePresenceProgress(fraction) {
    const offset = CIRC_BEGIN * (1 - fraction);
    if (standbyProg) standbyProg.style.strokeDashoffset = offset;
    if (standbyBtn)  standbyBtn.classList.toggle('hovering', fraction > 0.01);
}

// inicializar
sbInitVariableText();
sbAnimLoop();

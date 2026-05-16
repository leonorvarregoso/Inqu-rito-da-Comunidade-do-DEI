// Criar um canvas novo diretamente no #stage para cobrir os 9720×1920 todos
const silCanvas = document.createElement('canvas');
silCanvas.id    = 'formsEffectCanvas';
silCanvas.style.cssText = `
    position: absolute;
    top: 0; left: 0;
    width: ${CANVAS_W}px; height: ${CANVAS_H}px;
    pointer-events: none;
    z-index: 1;
    display: block;
`;
document.getElementById('stage').appendChild(silCanvas);
const silCtx = silCanvas.getContext('2d');

// resolução da grelha de células (igual ao standby: 324×64 mas escalada para LEFT_W)
const SIL_COLS = 324;
const SIL_ROWS = 64;

// canvas interno para suavizar a máscara com blur e fade entre frames
const silMaskBlur = document.createElement('canvas');
const silMbCtx    = silMaskBlur.getContext('2d', { willReadFrequently: true });
silMaskBlur.width  = SIL_COLS;
silMaskBlur.height = SIL_ROWS;

let silMaskData = null;
let silTime     = 0;

// ── noise e forma
function silNoise(x, y, t) {
    return Math.sin(x * 0.04 + t) +
        Math.cos(y * 0.04 - t * 0.7) +
        Math.sin((x + y) * 0.02 + t * 0.5);
}

function silShapeBg(x, y) {
    const cx = SIL_COLS / 2;
    const cy = SIL_ROWS / 2;
    const dx = (x - cx) / SIL_COLS;
    const dy = (y - cy) / SIL_ROWS;
    return Math.sin(dx * 5.5) + Math.cos(dy * 5.5);
}

// atualiza a máscara da silhueta suavizada (idêntico ao sbUpdateMask do standby)
function silUpdateMask(maskSource) {
    if (!maskSource) { silMaskData = null; return; }

    silMbCtx.save();

    // fade do frame anterior
    silMbCtx.globalCompositeOperation = 'source-over';
    silMbCtx.fillStyle = 'black';
    silMbCtx.globalAlpha = 0.4;
    silMbCtx.fillRect(0, 0, SIL_COLS, SIL_ROWS);

    // nova máscara espelhada com blur para contornos suaves
    silMbCtx.globalCompositeOperation = 'lighter';
    silMbCtx.globalAlpha = 1.0;
    silMbCtx.filter = 'blur(6px)';
    silMbCtx.save();
    silMbCtx.translate(SIL_COLS, 0);
    silMbCtx.scale(-1, 1);
    silMbCtx.drawImage(maskSource, 0, 0, SIL_COLS, SIL_ROWS);
    silMbCtx.restore();

    silMbCtx.restore();
    silMaskData = silMbCtx.getImageData(0, 0, SIL_COLS, SIL_ROWS).data;
}

// lê a intensidade da silhueta numa célula
function silSample(col, row) {
    if (!silMaskData || col < 0 || row < 0 || col >= SIL_COLS || row >= SIL_ROWS) return 0;
    return silMaskData[(row * SIL_COLS + col) * 4] / 255.0;
}

// gradiente de cores do standby
const SIL_GRAD_COLORS = ['#ffb7b8', '#fa450e', '#d9c667', '#ffb7b8'];
const SIL_GRAD_STOPS  = [0, 0.33, 0.66, 1.0];

function gradColor(t, timeBoost) {
    const tAbs = ((t + timeBoost) % 1 + 1) % 1;
    for (let i = 0; i < SIL_GRAD_STOPS.length - 1; i++) {
        if (tAbs >= SIL_GRAD_STOPS[i] && tAbs <= SIL_GRAD_STOPS[i + 1]) {
            const lt = (tAbs - SIL_GRAD_STOPS[i]) / (SIL_GRAD_STOPS[i + 1] - SIL_GRAD_STOPS[i]);
            const c1 = SIL_GRAD_COLORS[i], c2 = SIL_GRAD_COLORS[i + 1];
            const r1=parseInt(c1.slice(1,3),16), g1=parseInt(c1.slice(3,5),16), b1=parseInt(c1.slice(5,7),16);
            const r2=parseInt(c2.slice(1,3),16), g2=parseInt(c2.slice(3,5),16), b2=parseInt(c2.slice(5,7),16);
            return `rgb(${Math.round(r1+(r2-r1)*lt)},${Math.round(g1+(g2-g1)*lt)},${Math.round(b1+(b2-b1)*lt)})`;
        }
    }
    return SIL_GRAD_COLORS[0];
}

// renderiza um frame:
//manchas de gradiente (efeito standby) a 50% de opacidade
//silhueta da pessoa a 100% de opacidade
function renderSilhouette() {
    silTime += 0.0035;

    silCanvas.width  = CANVAS_W;
    silCanvas.height = CANVAS_H;
    silCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const cellW = CANVAS_W / SIL_COLS;
    const cellH = CANVAS_H / SIL_ROWS;
    const t     = silTime;

    for (let y = 0; y < SIL_ROWS; y++) {
        for (let x = 0; x < SIL_COLS; x++) {
            const sil = silSample(x, y);
            const n   = silNoise(x, y, t);
            const s   = silShapeBg(x, y);

            //fundo: manchas de gradiente a 50% (sem silhueta)
            const vBg = Math.tanh((n * 0.5 + s * 0.7) + Math.sin(t + x * 0.01) * 0.3);
            if (vBg >= -0.15 && sil < 0.15) {
                const breathe = 0.7 + Math.sin(t * 2 + x * 0.02 + y * 0.02) * 0.3;
                const size    = (0.5 + Math.abs(vBg)) * breathe;
                const ox = Math.sin(t + y * 0.02) * 0.5;
                const oy = Math.cos(t + x * 0.02) * 0.5;
                const tCol = ((x / SIL_COLS + y / SIL_ROWS) * 0.5 + n * 0.15 + t * 0.08) % 1;
                silCtx.globalAlpha = 0.5;  // metade da opacidade
                silCtx.fillStyle   = gradColor(tCol, 0);
                silCtx.fillRect(x * cellW + ox, y * cellH + oy, cellW * size, cellH * size);
            }

            //silhueta: mesmo efeito mas a 100% de opacidade
            if (sil >= 0.15) {
                const vSil = Math.tanh((n * 0.5 + s * 0.7) + (sil * 2.8) + Math.sin(t + x * 0.01) * 0.3);
                if (vSil >= -0.15) {
                    const breathe = 0.7 + Math.sin(t * 2 + x * 0.02 + y * 0.02) * 0.3;
                    const size    = (0.5 + Math.abs(vSil)) * breathe;
                    const ox = Math.sin(t + y * 0.02) * 0.5;
                    const oy = Math.cos(t + x * 0.02) * 0.5;
                    const tCol = ((x / SIL_COLS + y / SIL_ROWS) * 0.5 + n * 0.15 + t * 0.08) % 1;
                    silCtx.globalAlpha = 1.0;  // opacidade total
                    silCtx.fillStyle   = gradColor(tCol, 0);
                    silCtx.fillRect(x * cellW + ox, y * cellH + oy, cellW * size, cellH * size);
                }
            }
        }
    }
    silCtx.globalAlpha = 1;
}

//loop de animação do efeito de fundo
function silLoop() {
    requestAnimationFrame(silLoop);
    renderSilhouette();
}

//seleção de curso
const CURSO_ORDER = ['dm', 'ei', 'cd', 'ext'];

let cursoZone      = null;
let cursoInterval  = null;
let cursoHoldStart = null;

function updateCursoCd(progress = 0) {
    const clamped = Math.min(1, Math.max(0, progress));
    const remaining = Math.max(0, Math.ceil(CARD_SEC * (1 - clamped)));
    const num = document.getElementById('cursoCdNum');
    if (num) num.textContent = remaining;
}

function resetCursoHold() {
    clearInterval(cursoInterval);
    cursoInterval  = null;
    cursoHoldStart = null;
    updateCursoCd(0);
    if (cursoZone) {
        document.querySelector(`.curso-card[data-c="${cursoZone}"]`)?.classList.remove('hovered');
        cursoZone = null;
    }
}

function resetAllCards() {
    CURSO_ORDER.forEach(c => {
        document.querySelector(`.curso-card[data-c="${c}"]`)?.classList.remove('hovered');
    });
    clearInterval(cursoInterval);
    cursoInterval  = null;
    cursoHoldStart = null;
    cursoZone      = null;
    updateCursoCd(0);
}

function setCursoZone(c) {
    if (!c) { resetCursoHold(); return; }
    if (cursoZone === c && cursoInterval) return;

    if (cursoZone && cursoZone !== c) {
        document.querySelector(`.curso-card[data-c="${cursoZone}"]`)?.classList.remove('hovered');
        clearInterval(cursoInterval);
        cursoInterval = null;
        updateCursoCd(0);
    }

    cursoZone      = c;
    cursoHoldStart = performance.now();
    document.querySelector(`.curso-card[data-c="${c}"]`)?.classList.add('hovered');

    cursoInterval = setInterval(() => {
        const progress  = (performance.now() - cursoHoldStart) / (CARD_SEC * 1000);
        updateCursoCd(progress);
        if (progress >= 1) {
            clearInterval(cursoInterval);
            cursoInterval = null;
            selectCurso(c);
        }
    }, 50);
}

function selectCurso(c) {
    curso = c;
    resetAllCards();
    document.querySelectorAll('.curso-card').forEach(el => el.classList.remove('sel'));
    document.querySelector(`.curso-card[data-c="${c}"]`)?.classList.add('sel');
    document.documentElement.style.setProperty('--user-color', COLORS[c]);
    setTimeout(() => {
        answers = []; qi = 0;
        goTo(2);
        showQ();
    }, 350);
}

//perguntas
function showQ() {
    if (qi >= QUESTIONS.length) { finish(); return; }
    const q = QUESTIONS[qi];
    document.getElementById('qStep').textContent     = `Pergunta ${qi+1} de ${QUESTIONS.length}`;
    document.getElementById('qText').textContent     = q.text;
    document.getElementById('zLblLeft').textContent  = q.opts[0];
    document.getElementById('zLblMid').textContent   = q.opts[1];
    document.getElementById('zLblRight').textContent = q.opts[2];
    document.getElementById('progFill').style.width  = `${(qi / QUESTIONS.length) * 100}%`;
    clearZone();
    zone   = null;
    cdLeft = CD_SEC;
    clearInterval(cdInt);
    updateCd(0);
}

function updateCd(progress = null) {
    const p       = progress ?? ((CD_SEC - cdLeft) / CD_SEC);
    const clamped = Math.min(1, Math.max(0, p));
    const remaining = Math.max(0, Math.ceil(CD_SEC * (1 - clamped)));
    document.getElementById('cdNum').textContent = remaining;
    document.getElementById('cdArc').style.strokeDashoffset = CIRC_CD * clamped;
}

function clearZone() {
    ['zLeft','zMid','zRight'].forEach(id =>
        document.getElementById(id).classList.remove('zone-hover','zone-chosen')
    );
}

function resetZoneHold() {
    clearInterval(cdInt);
    cdInt  = null;
    zone   = null;
    cdLeft = CD_SEC;
    clearZone();
    updateCd(0);
}

function setZone(z) {
    if (!z) { resetZoneHold(); return; }
    if (zone === z && cdInt) return;

    clearInterval(cdInt);
    zone   = z;
    cdLeft = CD_SEC;
    clearZone();

    const map = { left:'zLeft', mid:'zMid', right:'zRight' };
    if (map[z]) document.getElementById(map[z]).classList.add('zone-hover');

    const holdStart = performance.now();
    updateCd(0);

    cdInt = setInterval(() => {
        const progress = (performance.now() - holdStart) / (CD_SEC * 1000);
        cdLeft = Math.max(0, CD_SEC * (1 - progress));
        updateCd(progress);
        if (progress >= 1) {
            clearInterval(cdInt);
            cdInt = null;
            lockAnswer();
        }
    }, 50);
}

function lockAnswer() {
    const z = zone || 'mid';
    answers.push({ left:0, mid:1, right:2 }[z]);
    clearZone();
    document.getElementById({ left:'zLeft', mid:'zMid', right:'zRight' }[z]).classList.add('zone-chosen');
    zone   = null;
    cdLeft = 0;
    updateCd(1);
    setTimeout(() => { qi++; showQ(); }, 700);
}

//guardar e mostrar gráfico
function finish() {
    clearInterval(cdInt);
    const savedCurso   = curso;
    const savedAnswers = [...answers];
    dbSave({ curso: savedCurso, answers: savedAnswers });
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    curScreen = 3;
    showGraph();
    setGraphFullscreen(true);
    flashNeon(savedCurso, savedAnswers);
    startStatsCountdown();
}

function startStatsCountdown() {
    clearInterval(statsInt);
    let t = STATS_SEC;
    statsInt = setInterval(() => {
        t--;
        if (t <= 0) {
            clearInterval(statsInt);
            statsInt = null;

            clearTimeout(neonTimer);
            neonTimer = null;
            document.getElementById('neonToast')?.classList.remove('show');
            setGraphFullscreen(false);
            hideGraph();

            curso = null; answers = []; qi = 0; zone = null;
            resetAllCards();
            clearInterval(cdInt); cdInt = null;

            if (typeof sbEnter === 'function') sbEnter();
            else goTo(1);
        }
    }, 1000);
}

//MediaPipe — frames da câmara partilhada
async function formsOnFrame(video) {
    if (_formsPose)   await _formsPose.send({ image: video });
    if (_formsSelfie) await _formsSelfie.send({ image: video });
}

function setupForms() {
    // selfie segmentation — alimenta a silhueta de manchas
    _formsSelfie = new SelfieSegmentation({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    _formsSelfie.setOptions({ modelSelection: 1 });
    _formsSelfie.onResults(r => {
        silUpdateMask(r.segmentationMask);
    });

    // pose — posição horizontal para S1, S2 e S3
    _formsPose = new Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
    _formsPose.setOptions({
        modelComplexity: 1, smoothLandmarks: true,
        minDetectionConfidence: .4, minTrackingConfidence: .4
    });
    _formsPose.onResults(r => {
        if (curScreen !== 1 && curScreen !== 2 && curScreen !== 3) return;
        if (!r.poseLandmarks) {
            if (curScreen === 1) setCursoZone(null);
            else if (curScreen === 2) setZone(null);
            else if (curScreen === 3 && window.graphHideStat) window.graphHideStat(1200);
            return;
        }
        const lm = r.poseLandmarks;
        const lS = lm[11], rS = lm[12];
        const lV = lS.visibility ?? 1, rV = rS.visibility ?? 1;

        let mx;
        if (lV > 0.3 && rV > 0.3) mx = 1 - ((lS.x + rS.x) / 2);
        else if (lV > 0.3)         mx = 1 - lS.x;
        else if (rV > 0.3)         mx = 1 - rS.x;
        else                        mx = 1 - lm[0].x;

        if (curScreen === 1) {
            const idx = mx < .25 ? 0 : mx < .50 ? 1 : mx < .75 ? 2 : 3;
            setCursoZone(CURSO_ORDER[idx]);
        } else if (curScreen === 2) {
            setZone(mx < (2/6) ? 'left' : mx < (4/6) ? 'mid' : 'right');
        } else if (curScreen === 3) {
            const nQ      = QUESTIONS.length;
            const axisIdx = Math.round(mx * (nQ - 1));
            const clamped = Math.max(0, Math.min(nQ - 1, axisIdx));
            if (window.graphShowStat) window.graphShowStat(clamped);
        }
    });
}

//atalhos de teclado para testes sem câmara
document.addEventListener('keydown', e => {
    if (curScreen === 1) {
        if (e.code === 'Digit1') setCursoZone('dm');
        if (e.code === 'Digit2') setCursoZone('ei');
        if (e.code === 'Digit3') setCursoZone('cd');
        if (e.code === 'Digit4') setCursoZone('ext');
        if (e.code === 'Enter' && cursoZone) selectCurso(cursoZone);
    }
    if (curScreen === 2) {
        if (e.code === 'ArrowLeft')  setZone('left');
        if (e.code === 'ArrowUp')    setZone('mid');
        if (e.code === 'ArrowRight') setZone('right');
    }
});

// arrancar depois das fontes estarem prontas
document.fonts.ready.then(() => {
    silLoop();
    setupForms();
});

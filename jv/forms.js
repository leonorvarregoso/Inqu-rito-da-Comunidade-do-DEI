/* ═══════════════════════════════════════════════════════════
   forms.js — Quiz + silhueta ASCII branca no fundo
   A câmara já não é mostrada — em vez disso a selfie
   segmentation pinta pixeis ASCII brancos onde está a pessoa.
   Depende de: config.js, graph.js, standby_mp.js (câmara já init)
═══════════════════════════════════════════════════════════ */

// ── Referências DOM ──────────────────────────────────────
const videoEl   = document.getElementById('videoEl');
const bgCanvas  = document.getElementById('bgCanvas');
const bgCtx     = bgCanvas.getContext('2d');
const handDot   = document.getElementById('handDot');
const panelLeft = document.getElementById('panelLeft');

// ════════════════════════════════════════════════════════════
//   Efeito de quadrados — aura contida à volta da pessoa
// ════════════════════════════════════════════════════════════

const silCanvas = document.getElementById('leftAsciiCanvas');
const silCtx    = silCanvas.getContext('2d');

// Grelha de células de 20px — mais fina que o standby (30px)
const SIL_CELL = 20;
const SIL_COLS = Math.ceil(LEFT_W   / SIL_CELL);
const SIL_ROWS = Math.ceil(CANVAS_H / SIL_CELL);

// Canvas interno: máscara com blur suave
const silMaskBlur = document.createElement('canvas');
const silMbCtx    = silMaskBlur.getContext('2d', { willReadFrequently: true });
silMaskBlur.width  = SIL_COLS;
silMaskBlur.height = SIL_ROWS;

let silMaskData = null;
let silTime     = 0;

// Noise leve só para animar os quadrados no anel
function silNoise(x, y, t) {
    return Math.sin(x * 0.10 + t * 1.2) * 0.5 +
        Math.cos(y * 0.10 - t * 0.9) * 0.5;
}

// Actualiza máscara — blur pequeno para bordo mais definido
function silUpdateMask(maskSource) {
    if (!maskSource) { silMaskData = null; return; }
    silMbCtx.save();
    // Fade lento do frame anterior
    silMbCtx.globalCompositeOperation = 'source-over';
    silMbCtx.fillStyle = 'black';
    silMbCtx.globalAlpha = 0.45;
    silMbCtx.fillRect(0, 0, SIL_COLS, SIL_ROWS);
    // Desenha máscara espelhada com blur moderado
    silMbCtx.globalCompositeOperation = 'lighter';
    silMbCtx.globalAlpha = 1.0;
    silMbCtx.filter = 'blur(2px)';
    silMbCtx.save();
    silMbCtx.translate(SIL_COLS, 0);
    silMbCtx.scale(-1, 1);
    silMbCtx.drawImage(maskSource, 0, 0, SIL_COLS, SIL_ROWS);
    silMbCtx.restore();
    silMbCtx.restore();
    silMaskData = silMbCtx.getImageData(0, 0, SIL_COLS, SIL_ROWS).data;
}

// Lê valor da máscara [0..1] com clamp de bordas
function silSample(col, row) {
    if (!silMaskData || col < 0 || row < 0 || col >= SIL_COLS || row >= SIL_ROWS) return 0;
    return silMaskData[(row * SIL_COLS + col) * 4] / 255.0;
}

// Render — quadrados apenas no anel de contorno da silhueta
function renderSilhouette() {
    silTime += 0.004;
    silCanvas.width  = LEFT_W;
    silCanvas.height = CANVAS_H;
    silCtx.clearRect(0, 0, LEFT_W, CANVAS_H);
    if (!silMaskData) return;

    const cellW = LEFT_W   / SIL_COLS;
    const cellH = CANVAS_H / SIL_ROWS;
    const t     = silTime;

    // Espessura do anel exterior (células além do bordo da pessoa)
    const OUTER = 4;
    // Células de margem interior a suprimir (não pintar o centro)
    const INNER = 2;

    for (let y = 0; y < SIL_ROWS; y++) {
        for (let x = 0; x < SIL_COLS; x++) {
            const here = silSample(x, y);

            // Calcula min e max na vizinhança OUTER
            let minVal = here, maxVal = here;
            for (let dy = -OUTER; dy <= OUTER; dy++) {
                for (let dx = -OUTER; dx <= OUTER; dx++) {
                    const v = silSample(x + dx, y + dy);
                    if (v < minVal) minVal = v;
                    if (v > maxVal) maxVal = v;
                }
            }

            // Zona exterior próxima: pixel fora (here ≈ 0) mas perto da pessoa (max alto)
            const outerHalo = (here < 0.15) ? maxVal : 0;

            // Zona interior rasa: pixel dentro mas perto do bordo (min baixo)
            const innerEdge = (here > 0.2) ? Math.max(0, 1 - minVal / 0.2) : 0;

            // Força combinada do anel — suprimir interior profundo
            const innerMin2 = (() => {
                let m = here;
                for (let dy = -INNER; dy <= INNER; dy++)
                    for (let dx = -INNER; dx <= INNER; dx++)
                        m = Math.min(m, silSample(x + dx, y + dy));
                return m;
            })();
            const notDeepInside = 1 - Math.min(1, innerMin2 / 0.25);

            const ring = Math.max(outerHalo, innerEdge * notDeepInside);
            if (ring < 0.08) continue;

            // Animação subtil
            const n     = silNoise(x, y, t);
            const pulse = 0.72 + Math.sin(t * 2.5 + x * 0.18 + y * 0.14) * 0.28;
            const size  = Math.min(0.95, ring * (0.55 + n * 0.3) * pulse);

            // Offset orgânico pequeno
            const ox = Math.sin(t * 1.8 + y * 0.1) * 1.2;
            const oy = Math.cos(t * 1.8 + x * 0.1) * 1.2;

            silCtx.globalAlpha = Math.min(0.95, ring * (0.65 + n * 0.3));
            silCtx.fillStyle = 'yellow';
            silCtx.fillRect(
                x * cellW + ox,
                y * cellH + oy,
                cellW * size,
                cellH * size
            );
        }
    }
    silCtx.globalAlpha = 1;
}

function silLoop() {
    requestAnimationFrame(silLoop);
    renderSilhouette();
}

function initSilGrid() { /* procedural */ }

// ════════════════════════════════════════════════════════════
//   S1 — Seleção de curso (lógica igual ao S2 mas com 4 zonas)
// ════════════════════════════════════════════════════════════

// Mapeamento: índice 0-3 → curso
const CURSO_ORDER = ['dm', 'ei', 'cd', 'ext'];
const CIRC_CARD_NEW = 2 * Math.PI * 30; // r=30 do novo SVG

let cursoZone      = null;   // curso activo ('dm','ei','cd','ext' ou null)
let cursoInterval  = null;
let cursoHoldStart = null;

function resetCursoHold() {
    clearInterval(cursoInterval);
    cursoInterval  = null;
    cursoHoldStart = null;
    if (cursoZone) {
        document.querySelector(`.curso-card[data-c="${cursoZone}"]`)?.classList.remove('hovered');
        const arc = document.getElementById(`cr-${cursoZone}`);
        if (arc) arc.style.strokeDashoffset = CIRC_CARD_NEW;
        const num = document.getElementById(`crn-${cursoZone}`);
        if (num) num.textContent = CARD_SEC;
        cursoZone = null;
    }
}

function resetAllCards() {
    CURSO_ORDER.forEach(c => {
        document.querySelector(`.curso-card[data-c="${c}"]`)?.classList.remove('hovered');
        const arc = document.getElementById(`cr-${c}`);
        if (arc) arc.style.strokeDashoffset = CIRC_CARD_NEW;
        const num = document.getElementById(`crn-${c}`);
        if (num) num.textContent = CARD_SEC;
    });
    clearInterval(cursoInterval);
    cursoInterval  = null;
    cursoHoldStart = null;
    cursoZone      = null;
}

function setCursoZone(c) {
    if (!c) { resetCursoHold(); return; }
    if (cursoZone === c && cursoInterval) return;

    // Mudou de zona — reinicia
    if (cursoZone && cursoZone !== c) {
        document.querySelector(`.curso-card[data-c="${cursoZone}"]`)?.classList.remove('hovered');
        const oldArc = document.getElementById(`cr-${cursoZone}`);
        if (oldArc) oldArc.style.strokeDashoffset = CIRC_CARD_NEW;
        const oldNum = document.getElementById(`crn-${cursoZone}`);
        if (oldNum) oldNum.textContent = CARD_SEC;
        clearInterval(cursoInterval);
        cursoInterval = null;
    }

    cursoZone      = c;
    cursoHoldStart = performance.now();
    document.querySelector(`.curso-card[data-c="${c}"]`)?.classList.add('hovered');

    const arc = document.getElementById(`cr-${c}`);
    const num = document.getElementById(`crn-${c}`);

    cursoInterval = setInterval(() => {
        const progress = (performance.now() - cursoHoldStart) / (CARD_SEC * 1000);
        const remaining = Math.max(0, Math.ceil(CARD_SEC * (1 - progress)));
        if (arc) arc.style.strokeDashoffset = CIRC_CARD_NEW * (1 - Math.min(1, progress));
        if (num) num.textContent = remaining;
        if (progress >= 1) {
            clearInterval(cursoInterval);
            cursoInterval = null;
            selectCurso(c);
        }
    }, 50);
}

function selectCurso(c) {
    resetAllCards();
    curso = c;
    document.querySelectorAll('.curso-card').forEach(el => el.classList.remove('sel'));
    document.querySelector(`.curso-card[data-c="${c}"]`)?.classList.add('sel');
    document.documentElement.style.setProperty('--user-color', COLORS[c]);
    setTimeout(() => {
        answers = []; qi = 0;
        if (handDot) handDot.style.display = 'none';
        goTo(2);
        showQ();
    }, 350);
}

// ════════════════════════════════════════════════════════════
//   S2 — Perguntas
// ════════════════════════════════════════════════════════════

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
    zone = null;
    cdLeft = CD_SEC;
    clearInterval(cdInt);
    updateCd(0);
}

function updateCd(progress = null) {
    const p = progress ?? ((CD_SEC - cdLeft) / CD_SEC);
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
    cdInt = null;
    zone = null;
    cdLeft = CD_SEC;
    clearZone();
    updateCd(0);
}

function setZone(z) {
    if (!z) {
        resetZoneHold();
        return;
    }
    if (zone === z && cdInt) return;
    clearInterval(cdInt);
    zone = z;
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
    zone = null;
    cdLeft = 0;
    updateCd(1);
    setTimeout(() => { qi++; showQ(); }, 700);
}

// ════════════════════════════════════════════════════════════
//   Finish + S3 — Resultados
// ════════════════════════════════════════════════════════════

function finish() {
    clearInterval(cdInt);
    if (typeof window.statsStop === 'function') window.statsStop();
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
    const countEl = document.getElementById('statsCountNum');
    if (countEl) countEl.textContent = t;
    statsInt = setInterval(() => {
        t--;
        if (countEl) countEl.textContent = Math.max(0, t);
        if (t <= 0) {
            clearInterval(statsInt);
            statsInt = null;

            // Limpar estado do gráfico
            clearTimeout(neonTimer);
            neonTimer = null;
            document.getElementById('neonToast')?.classList.remove('show');
            setGraphFullscreen(false);
            hideGraph();

            // Limpar estado do quiz
            curso = null; answers = []; qi = 0; zone = null;
            resetAllCards();
            clearInterval(cdInt); cdInt = null;

            // Parar stats laterais
            if (typeof window.statsStop === 'function') window.statsStop();

            // Voltar ao standby
            if (typeof sbEnter === 'function') sbEnter();
            else goTo(1);
        }
    }, 1000);
}

async function formsOnFrame(video) {
    if (_formsPose)   await _formsPose.send({ image: video });
    if (_formsSelfie) await _formsSelfie.send({ image: video });
}

function setupForms() {
    // ── Selfie segmentation — silhueta ASCII ─────────────
    _formsSelfie = new SelfieSegmentation({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    _formsSelfie.setOptions({ modelSelection: 1 });
    _formsSelfie.onResults(r => {
        silUpdateMask(r.segmentationMask);
    });

    // ── Pose — seleção de curso (S1, 4 zonas) + respostas (S2, 3 zonas) ──
    _formsPose = new Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
    _formsPose.setOptions({
        modelComplexity: 1, smoothLandmarks: true,
        minDetectionConfidence: .4, minTrackingConfidence: .4
    });
    _formsPose.onResults(r => {
        if (curScreen !== 1 && curScreen !== 2) return;
        if (!r.poseLandmarks) {
            if (curScreen === 1) setCursoZone(null);
            else setZone(null);
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
            // 4 zonas: DM | EI | CD | EXT
            const idx = mx < .25 ? 0 : mx < .50 ? 1 : mx < .75 ? 2 : 3;
            setCursoZone(CURSO_ORDER[idx]);
        } else {
            setZone(mx < .33 ? 'left' : mx < .67 ? 'mid' : 'right');
        }
    });
}

// ════════════════════════════════════════════════════════════
//   Teclado
// ════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
    if (curScreen === 1) {
        if (e.code === 'Digit1') setCursoZone('dm');
        if (e.code === 'Digit2') setCursoZone('ei');
        if (e.code === 'Digit3') setCursoZone('cd');
        if (e.code === 'Digit4') setCursoZone('ext');
        // Selecção imediata com Enter
        if (e.code === 'Enter' && cursoZone) selectCurso(cursoZone);
    }
    if (curScreen === 2) {
        if (e.code === 'ArrowLeft')  setZone('left');
        if (e.code === 'ArrowUp')    setZone('mid');
        if (e.code === 'ArrowRight') setZone('right');
    }
});

// ════════════════════════════════════════════════════════════
//   Init
// ════════════════════════════════════════════════════════════
document.fonts.ready.then(() => {
    initSilGrid();
    silLoop();
    setupForms();
});

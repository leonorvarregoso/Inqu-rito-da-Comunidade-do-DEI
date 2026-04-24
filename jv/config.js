/* ═══════════════════════════════════════════════════════════
   config.js — Constantes, dados e estado global
   Ecrãs: 0=standby | 1=curso | 2=perguntas | 3=resultados
═══════════════════════════════════════════════════════════ */

const CANVAS_W = 9720;
const CANVAS_H = 1920;
const STATS_W  = 2160;
const LEFT_W   = 3240;
const RIGHT_W  = 4320;

const CD_SEC    = 5;
const HB_SEC    = 3;
const CARD_SEC  = 2;
const STATS_SEC = 15;
const NEON_SEC  = 8;

const COLORS     = { dm:'#F037A5', ei:'#CDF564', cd:'#FF4632', ext:'#ffb800' };
const NAMES_FULL = { dm:'Design e Multimédia', ei:'Eng. Informática', cd:'Ciência de Dados', ext:'Estudante Externo' };

const CIRC_BEGIN = 2 * Math.PI * 98;
const CIRC_CARD  = 2 * Math.PI * 16;
const CIRC_CD    = 2 * Math.PI * 32;

const QUESTIONS = [
    { text:'Qual é o teu dia favorito para sair?', opts:['Terças Académicas','Nem saio, só estudo','Quintas Académicas'], label:'Saídas'},
    { text:'O que preferes à noite?', opts:['Convívio','Pré','Discoteca'], label:'Noite'},
    { text:'Qual é a tua IA favorita?', opts:['Chat GPT','Gemini','Claude'], label:'IA'},
    { text:'Quando costumas estudar?', opts:['Estudo de noite','Quando entro em pânico','Estudo de dia'], label:'Estudo'},
    { text:'Qual é a tua estratégia para passar?', opts:['Ir trabalhando','Depende da cadeira','O curso faz-se no recurso'], label:'Cadeiras'},
    { text:'Qual é o teu bar favorito?', opts:['AAC','24 Club','Moelas'], label:'Spot'},
    { text:'Qual é a tua área preferida em programação?', opts:['Frontend','Data Science','Backend'],                                        label:'Código'   },
    { text:'Onde costumas almoçar?', opts:['Bar do DEI','Trago o lanche de casa','Bar do DEEC'], label:'Almoço'},
    { text:'Onde costumas estudar?', opts:['Biblioteca','Casa','Polo 2'], label:'Local'},
    { text:'Qual é o teu programa favorito?', opts:['Figma','VS Code','Jupyter Notebook'], label:'Tool'},
    { text:'O que mais valorizas num projeto de software?', opts:['README bem escrito','Comentários no código','Código que "funciona e não se toca"'], label:'Projeto' },
    { text:'Qual é a área mais temida do DEI?', opts:['Estatística','Algoritmos','UX/UI'],                                          label:'Cadeira'  },
];

const STAT_FACTS = [
    { pct:68,  label:'dos estudantes preferem\nestudar à noite' },
    { pct:42,  label:'escolhe o Chat GPT\ncomo assistente de IA' },
    { pct:55,  label:'da comunidade DEI\ncostuma ir às Quintas Académicas' },
    { pct:37,  label:'prefere o Frontend\ncomo área de programação' },
    { pct:61,  label:'almoça no Bar do DEI\nquase todos os dias' },
    { pct:73,  label:'usa o VS Code\ncomo ferramenta principal' },
    { pct:49,  label:'considera Estatística\na cadeira mais temida' },
    { pct:82,  label:'da comunidade\nestuda na Biblioteca' },
    { pct:33,  label:'responde igual à maioria\ndos estudantes de EI' },
    { pct:58,  label:'prefere Convívio\nnuma noite fora' },
    { pct:44,  label:'vai trabalhando\nas cadeiras ao longo do semestre' },
    { pct:76,  label:'acha a AAC\no melhor spot de Coimbra' },
    { pct:29,  label:'do DEI escolhe\nCiência de Dados' },
    { pct:91,  label:'concorda que\no Figma é essencial em DM' },
    { pct:52,  label:'prefere um\nREADME bem escrito no projeto' },
    { pct:64,  label:'de EI prefere\no Backend à programação' },
    { pct:38,  label:'troca de resposta\nentre a pergunta do spot' },
    { pct:47,  label:'usa Claude\ncomo assistente de IA' },
];

let curScreen = 0;
let curso     = null;
let answers   = [];
let qi        = 0;
let zone      = null;

let bInt = null;
const cardIntervals = { dm:null, ei:null, cd:null, ext:null };
let cdInt     = null;
let cdLeft    = CD_SEC;
let statsInt  = null;
let neonTimer = null;

const LS     = 'fnp_wide_v1';
const dbLoad = () => { try { return JSON.parse(localStorage.getItem(LS)||'[]'); } catch { return []; } };
const dbSave = e  => { const a=dbLoad(); a.push(e); localStorage.setItem(LS,JSON.stringify(a)); };

function seed() {
    if (dbLoad().length) return;
    const cs = ['dm','ei','cd','ext'];
    const rows = [];
    for (let i = 0; i < 60; i++) {
        const c = cs[Math.floor(Math.random()*4)];
        rows.push({ curso:c, answers:QUESTIONS.map(()=>Math.floor(Math.random()*3)) });
    }
    localStorage.setItem(LS, JSON.stringify(rows));
}

function scaleStage() {
    const stage  = document.getElementById('stage');
    const scaleX = window.innerWidth  / CANVAS_W;
    const scaleY = window.innerHeight / CANVAS_H;
    const s = Math.min(scaleX, scaleY);
    stage.style.transform       = `scale(${s})`;
    stage.style.transformOrigin = 'top left';
    const offX = (window.innerWidth  - CANVAS_W * s) / 2;
    const offY = (window.innerHeight - CANVAS_H * s) / 2;
    stage.style.left = Math.max(0, offX) + 'px';
    stage.style.top  = Math.max(0, offY) + 'px';
}
window.addEventListener('resize', scaleStage);
scaleStage();

function screenToVirtual(clientX, clientY) {
    const stage = document.getElementById('stage');
    const s = parseFloat(stage.style.transform.replace('scale(','')) || 1;
    return {
        vx: (clientX - (parseFloat(stage.style.left)||0)) / s,
        vy: (clientY - (parseFloat(stage.style.top) ||0)) / s
    };
}
function elemVirtualRect(el) {
    const br  = el.getBoundingClientRect();
    const tl  = screenToVirtual(br.left,  br.top);
    const br2 = screenToVirtual(br.right, br.bottom);
    return { left:tl.vx, top:tl.vy, right:br2.vx, bottom:br2.vy };
}

// ── goTo ─────────────────────────────────────────────────
function goTo(n) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('s' + n)?.classList.add('active');
    curScreen = n;

    // Stats: só activo em S1 (curso) e S2 (perguntas)
    if (n === 1 || n === 2) {
        if (typeof window.statsStart === 'function') window.statsStart();
    } else {
        if (typeof window.statsStop === 'function') window.statsStop();
    }

    if (n === 1) {
        startWave();
    } else {
        stopWave();
        if (n === 3) drawMainChart();
    }
    updateParticipantCount();
}

// ── Hook standby → quiz ───────────────────────────────────
let onStandbyExit = function() {};
onStandbyExit = function() {
    curScreen = 1;
    seed();

    // Limpar quaisquer intervalos de quiz pendentes
    clearInterval(cdInt); cdInt = null;
    clearInterval(statsInt); statsInt = null;
    curso = null; answers = []; qi = 0; zone = null;

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('s1')?.classList.add('active');

    if (typeof window.statsStart === 'function') window.statsStart();

    // Parar onda anterior antes de reiniciar
    if (typeof stopWave === 'function') stopWave();
    if (typeof startWave === 'function') setTimeout(startWave, 100);

    if (typeof drawMainChart === 'function') drawMainChart();
    updateParticipantCount();
};

seed();
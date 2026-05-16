// dimensões virtuais do stage
const CANVAS_W = 9720;
const CANVAS_H = 1920;
const STATS_W  = 2430;  
const LEFT_W   = 4860;  
const RIGHT_W  = 2430; 

// tempos em segundos
const CD_SEC    = 5;   // contagem decrescente para resposta
const CARD_SEC  = 5;   // tempo de hover para selecionar curso
const STATS_SEC = 15;  // duração do ecrã de resultados
const NEON_SEC  = 8;   // duração do toast neon no gráfico

// cores e nomes dos cursos
const COLORS     = { dm:'#F037A5', ei:'#CDF564', cd:'#FF4632', ext:'#ffb800' };
const NAMES_FULL = { dm:'Design e Multimédia', ei:'Eng. Informática', cd:'Ciência de Dados', ext:'Estudante Externo' };

// comprimentos dos arcos dos circulos
const CIRC_BEGIN = 2 * Math.PI * 98;  // circulo do standby
const CIRC_CD    = 2 * Math.PI * 32;  //  do countdown

// perguntas do quiz
const QUESTIONS = [
    { text:'Qual é o teu dia favorito para sair?',              opts:['Terças Académicas','Nem saio, só estudo','Quintas Académicas'],                    label:'Saídas'   },
    { text:'O que preferes à noite?',                           opts:['Convívio','Pré','Discoteca'],                                                       label:'Noite'    },
    { text:'Qual é a tua IA favorita?',                         opts:['Chat GPT','Gemini','Claude'],                                                       label:'IA'       },
    { text:'Quando costumas estudar?',                          opts:['Estudo de noite','Quando entro em pânico','Estudo de dia'],                         label:'Estudo'   },
    { text:'Qual é a tua estratégia para passar?',              opts:['Ir trabalhando','Depende da cadeira','O curso faz-se no recurso'],                  label:'Cadeiras' },
    { text:'Qual é o teu bar favorito?',                        opts:['AAC','24 Club','Moelas'],                                                           label:'Spot'     },
    { text:'Qual é a tua área preferida em programação?',       opts:['Frontend','Data Science','Backend'],                                                label:'Código'   },
    { text:'Onde costumas almoçar?',                            opts:['Bar do DEI','Trago de casa','Bar do DEEC'],                               label:'Almoço'   },
    { text:'Onde costumas estudar?',                            opts:['Biblioteca','Casa','Polo 2'],                                                       label:'Local'    },
    { text:'Qual é o teu programa favorito?',                   opts:['Figma','VS Code','Jupyter Notebook'],                                              label:'Tool'     },
    { text:'O que mais valorizas num projeto de software?',     opts:['README bem escrito','Comentários no código','Código que "funciona e não se toca"'], label:'Projeto'  },
    { text:'Qual a área que mais preferes?',                 opts:['Estatística','Algoritmos','UX/UI'],                                                 label:'Cadeira'  },
];

// estado global do quiz
let curScreen = 0;    // ecrã atual
let curso     = null; // curso selecionado
let answers   = [];   // respostas dadas até agora
let qi        = 0;    // índice da pergunta atual
let zone      = null; // zona ativa

// timers e intervalos
let bInt = null;
const cardIntervals = { dm:null, ei:null, cd:null, ext:null };
let cdInt     = null;
let cdLeft    = CD_SEC;
let statsInt  = null;
let neonTimer = null;

// base de dados local guarda as respostas no localStorage
const LS     = 'fnp_wide_real_v1';
const dbLoad = () => { try { return JSON.parse(localStorage.getItem(LS)||'[]'); } catch { return []; } };
const dbSave = e  => { const a=dbLoad(); a.push({ ...e, createdAt: Date.now() }); localStorage.setItem(LS,JSON.stringify(a)); };

function getQuestionStat(axisIdx) {
    const q = QUESTIONS[axisIdx];
    if (!q) return { pct:0, label:'sem dados\nneste eixo', total:0 };

    const counts = [0, 0, 0];
    const rows = dbLoad().filter(r => r.answers && Number.isInteger(r.answers[axisIdx]));

    rows.forEach(r => {
        const ans = r.answers[axisIdx];
        if (ans >= 0 && ans < counts.length) counts[ans]++;
    });

    const total = counts.reduce((sum, n) => sum + n, 0);
    if (!total) return { pct:0, label:'ainda sem respostas\nem ' + q.label, total:0 };

    let topIdx = 0;
    counts.forEach((n, i) => { if (n > counts[topIdx]) topIdx = i; });

    const pct = Math.round((counts[topIdx] / total) * 100);
    return {
        pct,
        label: q.opts[topIdx] + '\nresposta mais escolhida\nem ' + q.label,
        total,
        axisIdx,
        optionIdx: topIdx,
        counts
    };
}

function getQuestionStats() {
    return QUESTIONS.map((_, i) => getQuestionStat(i));
}

// escala o stage para caber em qualquer resolução de ecrã
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

// converte coordenadas do ecrã real para coordenadas virtuais do stage
function screenToVirtual(clientX, clientY) {
    const stage = document.getElementById('stage');
    const s = parseFloat(stage.style.transform.replace('scale(','')) || 1;
    return {
        vx: (clientX - (parseFloat(stage.style.left)||0)) / s,
        vy: (clientY - (parseFloat(stage.style.top) ||0)) / s
    };
}

// retorna o bounding rect de um elemento em coordenadas virtuais
function elemVirtualRect(el) {
    const br  = el.getBoundingClientRect();
    const tl  = screenToVirtual(br.left,  br.top);
    const br2 = screenToVirtual(br.right, br.bottom);
    return { left:tl.vx, top:tl.vy, right:br2.vx, bottom:br2.vy };
}

// muda de ecrã  ativa o elemento correto e trata os side-effects
function goTo(n) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('s' + n)?.classList.add('active');
    curScreen = n;


    if (n === 1) {
        startWave();
    } else {
        stopWave();
        if (n === 3) drawMainChart();
    }
    updateParticipantCount();
}

// callback chamada quando o standby sai  reinicia o quiz do zero
let onStandbyExit = function() {};
onStandbyExit = function() {
    curScreen = 1;

    // limpar qualquer estado de quiz anterior
    clearInterval(cdInt); cdInt = null;
    clearInterval(statsInt); statsInt = null;
    curso = null; answers = []; qi = 0; zone = null;

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('s1')?.classList.add('active');


    // reiniciar a onda (parar primeiro para não acumular loops)
    if (typeof stopWave === 'function') stopWave();
    if (typeof startWave === 'function') setTimeout(startWave, 100);

    if (typeof drawMainChart === 'function') drawMainChart();
    updateParticipantCount();
};

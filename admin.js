/* admin.js — Lógica completa do painel de administração */

let MEDICOS = [];
let NOTIFICACOES = [];
let currentPage = 'dashboard';

// ── Bootstrap ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  requireAuth('admin');
  document.getElementById('tb-sub').textContent = new Date().toLocaleDateString('pt-PT', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  await carregarMedicos();
  showPage('dashboard');
  setInterval(carregarNotificacoes, 30000);
  carregarNotificacoes();
});

async function carregarMedicos() {
  try {
    MEDICOS = await API.get('/medicos');
    renderNavMedicos();
    renderSelectMedicos();
  } catch { MEDICOS = DEMO_MEDICOS; renderNavMedicos(); renderSelectMedicos(); }
}

function renderNavMedicos() {
  const el = document.getElementById('nav-medicos');
  el.innerHTML = MEDICOS.map(m => `
    <div class="nav-item" onclick="showMedicoPage('${m.id}',this)" id="nav-${m.id}">
      <div class="avatar" style="background:${m.cor?.bg||'#E6F1FB'};color:${m.cor?.text||'#0C447C'};width:22px;height:22px;font-size:9px">${m.iniciais||'MD'}</div>
      <span style="font-size:12px">${m.nome.split(' ').slice(0,2).join(' ')}</span>
    </div>`).join('');
}

function renderSelectMedicos() {
  const sel = document.getElementById('camp-medico');
  if (!sel) return;
  sel.innerHTML = '<option value="">Todos os médicos</option>' +
    MEDICOS.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
}

// ── Navegação ────────────────────────────────────────────────────────────────
function showPage(name, el) {
  currentPage = name;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');

  const titles = { dashboard:'Dashboard', chamadas:'Chamadas IA', campanhas:'Campanhas', sms:'SMS automáticos', folgas:'Gestão de folgas', notificacoes:'Notificações', config:'Configuração' };
  document.getElementById('tb-title').textContent = titles[name] || name;
  document.getElementById('tb-avatar').textContent = 'AD';
  document.getElementById('tb-avatar').style.background = 'var(--bg-secondary)';
  document.getElementById('tb-avatar').style.color = 'var(--text-secondary)';

  const content = document.getElementById('main-content');
  content.innerHTML = '';

  switch(name) {
    case 'dashboard':    renderDashboard(content); break;
    case 'chamadas':     renderChamadas(content); break;
    case 'campanhas':    renderCampanhas(content); break;
    case 'sms':          renderSMS(content); break;
    case 'folgas':       renderFolgas(content); break;
    case 'notificacoes': renderNotificacoes(content); break;
    case 'config':       renderConfig(content); break;
  }
}

function showMedicoPage(id, el) {
  const m = MEDICOS.find(x => x.id === id);
  if (!m) return;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');

  document.getElementById('tb-avatar').textContent = m.iniciais;
  document.getElementById('tb-avatar').style.background = m.cor?.bg || '#E6F1FB';
  document.getElementById('tb-avatar').style.color = m.cor?.text || '#0C447C';
  document.getElementById('tb-title').textContent = m.nome;
  document.getElementById('tb-sub').textContent = m.especialidade + ' · Vista da administração';

  const content = document.getElementById('main-content');
  content.innerHTML = '';
  renderMedicoDashboard(content, m);
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────
function renderDashboard(el) {
  el.innerHTML = `
  <div class="grid-4" style="margin-bottom:1.25rem" id="dash-stats">
    ${statCard('Chamadas hoje','—','','◎')}
    ${statCard('Marcações IA','—','','◈')}
    ${statCard('Taxa conversão','—%','','')}
    ${statCard('Médicos ativos','${MEDICOS.length}','','')}
  </div>
  <div class="grid-2" style="margin-bottom:1rem">
    <div class="card">
      <div class="card-hd"><span class="card-title">Resumo por médico hoje</span></div>
      <div id="admin-resumo-medicos"></div>
    </div>
    <div class="card">
      <div class="card-hd"><span class="card-title">Alertas e notificações</span><span class="badge badge-danger" id="dash-notif-badge">0</span></div>
      <div id="dash-alertas"></div>
    </div>
  </div>
  <div class="grid-2">
    <div class="card">
      <div class="card-hd"><span class="card-title">Últimas chamadas IA</span></div>
      <div id="dash-chamadas"></div>
    </div>
    <div class="card">
      <div class="card-hd"><span class="card-title">Folgas esta semana</span></div>
      <div id="dash-folgas"></div>
    </div>
  </div>`;
  carregarDashboardData();
}

async function carregarDashboardData() {
  try {
    const stats = await API.get('/stats');
    document.getElementById('dash-stats').innerHTML =
      statCard('Chamadas hoje', stats.chamadasHoje, '↑ vs ontem', '◎') +
      statCard('Marcações IA', stats.marcacoesHoje, '', '◈') +
      statCard('Taxa conversão', stats.taxaConversao+'%', '', '') +
      statCard('Médicos ativos', stats.medicosAtivos, '', '');
  } catch {}

  // Resumo médicos
  const resumoEl = document.getElementById('admin-resumo-medicos');
  if (resumoEl) {
    resumoEl.innerHTML = `<table class="data-table">
      <thead><tr><th>Médico</th><th>Consultas</th><th>Livres</th><th>Ocupação</th><th>Estado</th></tr></thead>
      <tbody>${MEDICOS.map(m => `
        <tr onclick="showMedicoPage('${m.id}', document.getElementById('nav-${m.id}'))">
          <td><div style="display:flex;align-items:center;gap:8px">
            <div class="avatar" style="background:${m.cor?.bg||'#E6F1FB'};color:${m.cor?.text||'#0C447C'}">${m.iniciais||'MD'}</div>
            <div><div style="font-weight:500">${m.nome}</div><div style="font-size:11px;color:var(--text-secondary)">${m.especialidade||''}</div></div>
          </div></td>
          <td style="font-weight:600">${m.stats?.consultasHoje||'—'}</td>
          <td style="color:#22c55e;font-weight:600">${m.stats?.slotsLivres||'—'}</td>
          <td><div style="display:flex;align-items:center;gap:6px">
            <div style="width:60px;height:4px;background:var(--bg-secondary);border-radius:2px;overflow:hidden">
              <div style="width:${m.stats?.ocupacao||50}%;height:100%;background:var(--accent);border-radius:2px"></div>
            </div>
            <span style="font-size:11px;color:var(--text-secondary)">${m.stats?.ocupacao||50}%</span>
          </div></td>
          <td>${(m.stats?.ocupacao||50)>=85?'<span class="badge badge-success">Excelente</span>':(m.stats?.ocupacao||50)>=60?'<span class="badge badge-info">Bom</span>':'<span class="badge badge-warning">Atenção</span>'}</td>
        </tr>`).join('')}
      </tbody></table>`;
  }

  renderAlertasDash();
  renderChamadasDash();
  renderFolgasDash();
}

function renderAlertasDash() {
  const el = document.getElementById('dash-alertas');
  if (!el) return;
  const alertas = [
    ...NOTIFICACOES.slice(0,5),
    { tipo:'info', msg:'Sofia marcou 3 consultas via IA nas últimas 2h', tempo:'há 5 min' },
  ];
  if (!alertas.length) { el.innerHTML = '<div style="font-size:13px;color:var(--text-secondary);padding:1rem 0">Sem alertas de momento.</div>'; return; }
  el.innerHTML = alertas.map(n => `
    <div style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:0.5px solid var(--border);font-size:12px">
      <span class="badge badge-${n.tipo==='falta'?'danger':n.tipo==='atraso'?'warning':'info'}">${n.tipo==='falta'?'Falta':n.tipo==='atraso'?'Atraso':'IA'}</span>
      <div style="flex:1;color:var(--text-primary)">${n.msg}</div>
      <div style="font-size:11px;color:var(--text-secondary);white-space:nowrap">${n.tempo||''}</div>
    </div>`).join('');
}

function renderChamadasDash() {
  const el = document.getElementById('dash-chamadas');
  if (!el) return;
  const demo = [
    {nome:'Maria Silva',tel:'+351912345678',resultado:'Marcação confirmada',badge:'success',time:'há 5m'},
    {nome:'Pedro Gomes',tel:'+351963456789',resultado:'Pediu para ligar amanhã',badge:'warning',time:'há 18m'},
    {nome:'Luísa F.',tel:'+351934567890',resultado:'Não atendeu',badge:'danger',time:'há 32m'},
    {nome:'Tiago N.',tel:'+351911222333',resultado:'Reagendou para sexta',badge:'info',time:'há 1h'},
  ];
  el.innerHTML = demo.map(c => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--border)">
      <div class="avatar" style="background:var(--bg-info);color:var(--text-info);width:30px;height:30px;font-size:10px">${c.nome.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
      <div style="flex:1"><div style="font-weight:500;font-size:13px">${c.nome}</div><div style="font-size:11px;color:var(--text-secondary)">${c.resultado}</div></div>
      <div style="text-align:right"><span class="badge badge-${c.badge}" style="font-size:10px">${c.resultado.split(' ')[0]}</span><div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${c.time}</div></div>
    </div>`).join('');
}

function renderFolgasDash() {
  const el = document.getElementById('dash-folgas');
  if (!el) return;
  el.innerHTML = `
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Esta semana</div>
    <div style="padding:7px 0;border-bottom:0.5px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px;color:var(--text-primary)">Dr. Pedro Ramos</span>
        <span class="folga-badge">Quarta · Formação</span>
      </div>
    </div>
    <div style="padding:7px 0;font-size:13px;color:var(--text-secondary)">Sem outras folgas esta semana.</div>`;
}

function statCard(label, value, change, icon) {
  return `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    ${change ? `<div class="stat-change up">${change}</div>` : ''}
  </div>`;
}

// ── MÉDICO individual (vista admin) ─────────────────────────────────────────
function renderMedicoDashboard(el, m) {
  el.innerHTML = `
  <div class="grid-4" style="margin-bottom:1.25rem">
    ${statCard('Consultas hoje', m.stats?.consultasHoje||'—','','')}
    ${statCard('Slots livres', m.stats?.slotsLivres||'—','','')}
    ${statCard('Pacientes', m.stats?.pacientesTotal||'—','','')}
    ${statCard('Ocupação', (m.stats?.ocupacao||50)+'%','','')}
  </div>
  <div class="grid-3-1" style="margin-bottom:1rem">
    <div class="card">
      <div class="card-hd"><span class="card-title">Agenda de hoje</span><span class="badge badge-info" id="med-livre-ct">a carregar...</span></div>
      <div id="med-agenda-admin"></div>
    </div>
    <div class="card">
      <div class="card-hd"><span class="card-title">Próximos dias</span></div>
      <div id="med-proximos-admin"></div>
    </div>
  </div>
  <div class="grid-2">
    <div class="card">
      <div class="card-hd"><span class="card-title">Pacientes</span></div>
      <div id="med-pacs-admin"></div>
    </div>
    <div class="card">
      <div class="card-hd"><span class="card-title">Stats do mês</span></div>
      <div id="med-mes-admin"></div>
    </div>
  </div>`;
  carregarMedicoData(m);
}

async function carregarMedicoData(m) {
  try {
    const agenda = await API.get(`/medicos/${m.id}/agenda?data=${today()}`);
    const slots = agenda.slots || [];
    const livres = slots.filter(s => s.estado === 'livre').length;
    document.getElementById('med-livre-ct').textContent = `${livres} livres`;

    document.getElementById('med-agenda-admin').innerHTML = slots.map(s => {
      const isFree = s.estado === 'livre';
      const dotClass = s.marcacao?.status === 'realizada' ? 'dot-done' : s.marcacao?.status === 'em_curso' ? 'dot-active' : isFree ? 'dot-free' : 'dot-pending';
      return `<div class="slot-row">
        <span class="slot-hora">${s.hora}</span>
        <div class="slot-dot ${dotClass}"></div>
        <div style="flex:1">
          <div class="slot-name" style="${isFree?'color:var(--text-secondary)':''}">${isFree?'— Disponível —':(s.marcacao?.pacienteNome||'Marcação')}</div>
          ${s.marcacao ? `<div class="slot-type">${s.marcacao.servico}</div>` : ''}
        </div>
        <div class="slot-actions">
          ${s.marcacao ? `<span class="badge badge-${s.marcacao.status==='realizada'?'success':s.marcacao.status==='em_curso'?'info':'warning'}">${s.marcacao.status||'pendente'}</span>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch {
    document.getElementById('med-agenda-admin').innerHTML = `<div style="font-size:13px;color:var(--text-secondary);padding:1rem 0">Sem dados (modo demo)</div>`;
  }

  try {
    const pacs = await API.get(`/medicos/${m.id}/pacientes`);
    document.getElementById('med-pacs-admin').innerHTML = (pacs.slice(0,6)).map(p => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--border)">
        <div class="avatar" style="background:${m.cor?.bg||'#E6F1FB'};color:${m.cor?.text||'#0C447C'};width:28px;height:28px;font-size:10px">${p.nome.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
        <div style="flex:1"><div style="font-size:13px;font-weight:500">${p.nome}</div><div style="font-size:11px;color:var(--text-secondary)">${p.telefone}</div></div>
        <span class="badge badge-gray">${{pt:'PT',en:'EN',es:'ES',fr:'FR',it:'IT'}[p.idioma]||'PT'}</span>
      </div>`).join('');
  } catch {}

  document.getElementById('med-mes-admin').innerHTML = `
    <div style="font-size:13px;line-height:2.2">
      <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Consultas realizadas</span><span style="font-weight:600">${m.stats?.consultasHoje||0} hoje</span></div>
      <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Marcadas por IA</span><span style="font-weight:600;color:var(--accent)">34</span></div>
      <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Taxa de comparência</span><span style="font-weight:600">87%</span></div>
      <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Cancelamentos</span><span style="font-weight:600;color:var(--text-danger)">5</span></div>
    </div>`;
  document.getElementById('med-proximos-admin').innerHTML = `
    <div style="font-size:12px">
      <div style="margin-bottom:8px"><div style="font-weight:500;color:var(--text-secondary);font-size:11px;margin-bottom:4px">AMANHÃ</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${['09:00','10:30','14:00','15:30'].map(h=>`<span class="badge badge-info">${h}</span>`).join('')}
      </div></div>
      <div><div style="font-weight:500;color:var(--text-secondary);font-size:11px;margin-bottom:4px">DEPOIS DE AMANHÃ</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${['09:30','11:00','14:30'].map(h=>`<span class="badge badge-info">${h}</span>`).join('')}
      </div></div>
    </div>`;
}

// ── SMS AUTOMÁTICOS ───────────────────────────────────────────────────────────
function renderSMS(el) {
  el.innerHTML = `
  <div class="card" style="margin-bottom:1rem">
    <div class="card-hd"><span class="card-title">Lembretes automáticos de consulta</span><span class="badge badge-success">Ativo</span></div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:1rem">
      O sistema envia SMS automaticamente para confirmar, cancelar ou remarcar consultas. O paciente responde e a IA processa a resposta.
    </div>
    <div class="grid-2">
      <div class="card" style="border:none;background:var(--bg-secondary)">
        <div style="font-weight:600;font-size:13px;margin-bottom:.75rem">SMS 1 semana antes</div>
        <div class="sms-preview">DentalStar: Olá [Nome]! Lembramos que tem consulta de [Serviço] marcada para [Data] às [Hora] com [Médico].
Para CONFIRMAR responda SIM
Para CANCELAR responda NÃO
Para REMARCAR responda REMARCAR</div>
        <div style="margin-top:.75rem;display:flex;gap:6px">
          <input type="number" class="form-input" value="7" min="1" max="30" style="width:70px"> <span style="line-height:36px;font-size:13px;color:var(--text-secondary)">dias antes</span>
        </div>
      </div>
      <div class="card" style="border:none;background:var(--bg-secondary)">
        <div style="font-weight:600;font-size:13px;margin-bottom:.75rem">SMS 4 dias antes</div>
        <div class="sms-preview">DentalStar: Olá [Nome]! A sua consulta de [Serviço] é em 4 dias — [Data] às [Hora].
Confirma presença? Responda SIM, NÃO ou REMARCAR.</div>
        <div style="margin-top:.75rem;display:flex;gap:6px">
          <input type="number" class="form-input" value="4" min="1" max="14" style="width:70px"> <span style="line-height:36px;font-size:13px;color:var(--text-secondary)">dias antes</span>
        </div>
      </div>
    </div>
  </div>
  <div class="card" style="margin-bottom:1rem">
    <div class="card-hd"><span class="card-title">Fluxo de resposta do paciente via SMS</span></div>
    <div style="font-size:13px;line-height:1.9;color:var(--text-secondary)">
      <b style="color:var(--text-primary)">Paciente responde SIM</b> → Marcação confirmada + SMS de confirmação enviado → Médico e admin notificados.<br>
      <b style="color:var(--text-primary)">Paciente responde NÃO</b> → A IA pergunta se quer remarcar ou cancelar definitivamente → Slot libertado.<br>
      <b style="color:var(--text-primary)">Paciente responde REMARCAR</b> → A IA envia as próximas vagas disponíveis → Paciente escolhe → Remarcação automática.<br>
      <b style="color:var(--text-primary)">Sem resposta em 24h</b> → SMS de follow-up automático + alerta para admin.
    </div>
  </div>
  <div class="card">
    <div class="card-hd"><span class="card-title">SMS enviados hoje</span></div>
    <table class="data-table">
      <thead><tr><th>Paciente</th><th>Tipo</th><th>Hora</th><th>Estado</th><th>Resposta</th></tr></thead>
      <tbody>
        <tr><td>Maria Silva</td><td>7 dias antes</td><td>09:00</td><td><span class="badge badge-success">Entregue</span></td><td><span class="badge badge-success">SIM — confirmou</span></td></tr>
        <tr><td>Pedro G.</td><td>4 dias antes</td><td>09:01</td><td><span class="badge badge-success">Entregue</span></td><td><span class="badge badge-warning">Sem resposta</span></td></tr>
        <tr><td>Ana F.</td><td>7 dias antes</td><td>09:02</td><td><span class="badge badge-success">Entregue</span></td><td><span class="badge badge-info">REMARCAR — IA em negociação</span></td></tr>
        <tr><td>Carlos R.</td><td>4 dias antes</td><td>09:03</td><td><span class="badge badge-success">Entregue</span></td><td><span class="badge badge-danger">NÃO — cancelou</span></td></tr>
      </tbody>
    </table>
  </div>`;
}

// ── FOLGAS ────────────────────────────────────────────────────────────────────
function renderFolgas(el) {
  el.innerHTML = `
  <div class="card" style="margin-bottom:1rem">
    <div class="card-hd"><span class="card-title">Folgas registadas</span></div>
    <table class="data-table">
      <thead><tr><th>Médico</th><th>Início</th><th>Fim</th><th>Motivo</th><th>Estado</th></tr></thead>
      <tbody id="folgas-tbody">
        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="avatar" style="background:#E1F5EE;color:#085041;width:26px;height:26px;font-size:9px">PR</div>Dr. Pedro Ramos</div></td><td>26/03/2026</td><td>26/03/2026</td><td>Formação</td><td><span class="badge badge-info">Esta semana</span></td></tr>
        <tr><td><div style="display:flex;align-items:center;gap:8px"><div class="avatar" style="background:#FAEEDA;color:#633806;width:26px;height:26px;font-size:9px">MC</div>Dra. Marta Costa</div></td><td>06/04/2026</td><td>11/04/2026</td><td>Férias</td><td><span class="badge badge-warning">Em breve</span></td></tr>
      </tbody>
    </table>
  </div>
  <div class="card">
    <div class="card-hd"><span class="card-title">Como a IA gere folgas</span></div>
    <div style="font-size:13px;color:var(--text-secondary);line-height:1.8">
      Quando um médico regista folga, o sistema bloqueia automaticamente a sua agenda. 
      A IA não irá oferecer esses dias ao marcar consultas. 
      Se um paciente pedir especificamente esse médico, a IA informa que não está disponível e sugere o próximo slot após a folga ou outro médico com a mesma especialidade.
    </div>
  </div>`;
}

// ── NOTIFICAÇÕES ──────────────────────────────────────────────────────────────
async function carregarNotificacoes() {
  try {
    NOTIFICACOES = await API.get('/notificacoes');
    const count = NOTIFICACOES.filter(n => !n.lida).length;
    const badge = document.getElementById('notif-count');
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline-block' : 'none'; }
    const dashBadge = document.getElementById('dash-notif-badge');
    if (dashBadge) { dashBadge.textContent = count; dashBadge.style.display = count > 0 ? 'inline-block' : 'none'; }
    if (currentPage === 'notificacoes') renderNotificacoes(document.getElementById('main-content'));
  } catch {}
}

function renderNotificacoes(el) {
  const demo = [
    { id:1, tipo:'falta', msg:'Dr. Ramos — Carlos Sousa não compareceu à consulta das 10:00.', medico:'Dr. Ramos', tempo:'há 5 min', lida:false },
    { id:2, tipo:'atraso', msg:'Dra. Fonseca — Maria Silva chegou com 20 minutos de atraso.', medico:'Dra. Fonseca', tempo:'há 15 min', lida:false },
    { id:3, tipo:'cancelamento', msg:'SMS: Ana Ferreira cancelou a consulta de quinta (Dr. Silva). Slot libertado.', medico:'Dr. Silva', tempo:'há 1h', lida:false },
    { id:4, tipo:'ia', msg:'IA marcou 3 consultas novas via chamada nas últimas 2h.', medico:'Vários', tempo:'há 2h', lida:true },
    { id:5, tipo:'remarcacao', msg:'SMS: Pedro Gomes remarcou de amanhã para sexta 14:00 (Dra. Costa).', medico:'Dra. Costa', tempo:'há 3h', lida:true },
  ];
  const notifs = NOTIFICACOES.length ? NOTIFICACOES : demo;

  el.innerHTML = `
  <div class="card">
    <div class="card-hd"><span class="card-title">Todas as notificações</span><button class="btn btn-sm" onclick="marcarTodasLidas()">Marcar todas como lidas</button></div>
    ${notifs.map(n => `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:0.5px solid var(--border);${n.lida?'opacity:.6':''}">
      <span class="badge badge-${n.tipo==='falta'?'danger':n.tipo==='atraso'?'warning':n.tipo==='ia'?'info':'success'}">${n.tipo}</span>
      <div style="flex:1">
        <div style="font-size:13px;color:var(--text-primary)">${n.msg}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:3px">${n.medico} · ${n.tempo}</div>
      </div>
      ${!n.lida ? `<span style="width:8px;height:8px;background:var(--accent);border-radius:50%;margin-top:4px;flex-shrink:0"></span>` : ''}
    </div>`).join('')}
  </div>`;
}

// ── CHAMADAS ─────────────────────────────────────────────────────────────────
function renderChamadas(el) {
  el.innerHTML = `
  <div class="grid-4" style="margin-bottom:1rem">
    ${statCard('Total hoje','24','↑8','')}${statCard('Atendidas','21','','')}${statCard('Marcações','11','','')}${statCard('Taxa','46%','','')}
  </div>
  <div class="card">
    <div class="card-hd"><span class="card-title">Histórico de chamadas</span></div>
    <table class="data-table">
      <thead><tr><th>Contacto</th><th>Hora</th><th>Duração</th><th>Idioma</th><th>Resultado</th></tr></thead>
      <tbody>
        <tr><td>Maria Silva · +351912345678</td><td>09:12</td><td>3:24</td><td><span class="badge badge-gray">PT</span></td><td><span class="badge badge-success">Marcou — Dra. Fonseca</span></td></tr>
        <tr><td>Pedro Gomes · +351963456789</td><td>09:45</td><td>1:12</td><td><span class="badge badge-gray">PT</span></td><td><span class="badge badge-warning">Ligará amanhã</span></td></tr>
        <tr><td>Sarah Connor · +447700900000</td><td>10:02</td><td>4:05</td><td><span class="badge badge-info">EN</span></td><td><span class="badge badge-success">Marcou — Dra. Fonseca</span></td></tr>
        <tr><td>Sophie Laurent · +33612345678</td><td>10:30</td><td>2:48</td><td><span class="badge badge-info">FR</span></td><td><span class="badge badge-success">Marcou — Dra. Costa</span></td></tr>
        <tr><td>Marco Rossi · +393331234567</td><td>11:15</td><td>0:00</td><td><span class="badge badge-gray">IT</span></td><td><span class="badge badge-danger">Não atendeu</span></td></tr>
      </tbody>
    </table>
  </div>`;
}

function renderCampanhas(el) {
  el.innerHTML = `
  <div class="card" style="margin-bottom:1rem">
    <div class="card-hd"><span class="card-title">Campanhas ativas</span><button class="btn btn-sm btn-primary" onclick="openModal('modal-campanha')">+ Nova campanha</button></div>
    <div style="margin-bottom:12px;padding:12px;background:var(--bg-secondary);border-radius:var(--radius-md)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div><div style="font-size:13px;font-weight:600">Higiene oral — 30% desc.</div><div style="font-size:11px;color:var(--text-secondary)">48 contactos · Dra. Fonseca</div></div>
        <span class="badge badge-success">Em curso</span>
      </div>
      <div style="background:var(--bg-primary);border-radius:4px;height:6px;overflow:hidden"><div style="width:58%;height:100%;background:var(--accent)"></div></div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">28 de 48 contactos · 11 marcações · 39% conversão</div>
    </div>
  </div>`;
}

function renderConfig(el) {
  el.innerHTML = `
  <div class="grid-2">
    <div class="card">
      <div class="card-hd"><span class="card-title">Voz da IA</span></div>
      <div class="form-group"><label class="form-label">Nome da secretária</label><input class="form-input" value="Sofia"></div>
      <div class="form-group"><label class="form-label">Motor de voz</label>
        <select class="form-select"><option>ElevenLabs (Recomendado)</option><option>Azure Neural TTS</option><option>Google Cloud TTS</option></select>
      </div>
      <div class="form-group"><label class="form-label">Idiomas ativos</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${['PT-PT','EN','ES','FR'].map(l=>`<label style="display:flex;align-items:center;gap:5px;font-size:13px"><input type="checkbox" checked> ${l}</label>`).join('')}
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="toast('Configurações guardadas!','success')">Guardar</button>
    </div>
    <div class="card">
      <div class="card-hd"><span class="card-title">Integrações</span></div>
      <div style="font-size:13px;line-height:2;color:var(--text-secondary)">
        Twilio: <span style="color:#22c55e;font-weight:500">● Ligado</span><br>
        ElevenLabs: <span style="color:#22c55e;font-weight:500">● Ligado</span><br>
        Anthropic API: <span style="color:#22c55e;font-weight:500">● Ligado</span><br>
        Google Calendar: <span style="color:var(--text-warning);font-weight:500">● Não configurado</span>
      </div>
    </div>
  </div>`;
}

// ── Ações ─────────────────────────────────────────────────────────────────────
async function criarMedico() {
  const dados = {
    nome: document.getElementById('nm-nome').value,
    especialidade: document.getElementById('nm-esp').value,
    email: document.getElementById('nm-email').value,
    senha: document.getElementById('nm-senha').value,
    iniciais: document.getElementById('nm-iniciais').value.toUpperCase(),
    corNome: document.getElementById('nm-cor').value,
  };
  if (!dados.nome || !dados.email || !dados.senha) return toast('Preenche todos os campos obrigatórios.','warning');
  if (dados.senha.length < 8) return toast('A palavra-passe precisa de pelo menos 8 caracteres.','warning');
  try {
    await API.post('/medicos', dados);
    toast(`${dados.nome} adicionado com sucesso!`,'success');
    closeModal('modal-novo-medico');
    await carregarMedicos();
  } catch(e) { toast(e.message,'error'); }
}

async function iniciarCampanha() {
  const dados = { promocao: document.getElementById('camp-promo').value, idioma: document.getElementById('camp-idioma').value, medicoId: document.getElementById('camp-medico').value, tipo: document.getElementById('camp-tipo').value };
  if (!dados.promocao) return toast('Introduz a mensagem da promoção.','warning');
  try {
    toast('Campanha lançada! A IA vai começar a ligar.','success');
    closeModal('modal-campanha');
  } catch(e) { toast(e.message,'error'); }
}

function marcarTodasLidas() { NOTIFICACOES.forEach(n => n.lida = true); toast('Todas as notificações marcadas como lidas.','success'); renderNotificacoes(document.getElementById('main-content')); }

// ── Demo data ─────────────────────────────────────────────────────────────────
const DEMO_MEDICOS = [
  { id:'med_fonseca', nome:'Dra. Ana Fonseca', especialidade:'Ortodontia & Geral', iniciais:'AF', cor:{bg:'#E6F1FB',text:'#0C447C'}, stats:{consultasHoje:8,slotsLivres:2,ocupacao:75,pacientesTotal:5} },
  { id:'med_ramos',   nome:'Dr. Pedro Ramos',  especialidade:'Implantologia',       iniciais:'PR', cor:{bg:'#E1F5EE',text:'#085041'}, stats:{consultasHoje:6,slotsLivres:3,ocupacao:62,pacientesTotal:3} },
  { id:'med_costa',   nome:'Dra. Marta Costa', especialidade:'Estética',            iniciais:'MC', cor:{bg:'#FAEEDA',text:'#633806'}, stats:{consultasHoje:7,slotsLivres:4,ocupacao:55,pacientesTotal:2} },
  { id:'med_silva',   nome:'Dr. Rui Silva',    especialidade:'Pediatria',           iniciais:'RS', cor:{bg:'#FBEAF0',text:'#72243E'}, stats:{consultasHoje:7,slotsLivres:1,ocupacao:87,pacientesTotal:3} },
];

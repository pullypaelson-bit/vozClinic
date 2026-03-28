/* medico.js — Lógica do painel do médico */

let MEU_MEDICO = null;
let DATA_ATUAL = today();
let ESTADO_ATUAL = null;
let MARCACAO_ATUAL = null;

window.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth('medico');
  if (!user) return;
  MEU_MEDICO = user;

  // Preenche UI com dados do médico
  const av = document.getElementById('med-avatar');
  if (av) { av.textContent = user.iniciais || user.nome?.slice(0,2) || 'DR'; av.style.background = user.cor?.bg || '#E6F1FB'; av.style.color = user.cor?.text || '#0C447C'; }
  const tbAv = document.getElementById('tb-med-av');
  if (tbAv) { tbAv.textContent = user.iniciais || 'DR'; tbAv.style.background = user.cor?.bg || '#E6F1FB'; tbAv.style.color = user.cor?.text || '#0C447C'; }
  if (document.getElementById('med-nome-sidebar')) document.getElementById('med-nome-sidebar').textContent = user.nome;
  if (document.getElementById('med-esp-sidebar')) document.getElementById('med-esp-sidebar').textContent = user.especialidade || '';

  // Data hoje
  const ds = document.getElementById('data-selector');
  if (ds) { ds.value = DATA_ATUAL; ds.min = today(); }

  atualizarTopbar('Agenda de hoje');
  await showMedPage('agenda');
});

function atualizarTopbar(titulo) {
  document.getElementById('tb-med-title').textContent = titulo;
  document.getElementById('tb-med-sub').textContent = new Date(DATA_ATUAL + 'T00:00:00').toLocaleDateString('pt-PT', { weekday:'long', day:'numeric', month:'long' });
}

async function showMedPage(name, el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  const content = document.getElementById('med-content');
  content.innerHTML = '';
  switch(name) {
    case 'agenda':    await renderAgenda(content); break;
    case 'pacientes': await renderPacientes(content); break;
    case 'historico': await renderHistorico(content); break;
    case 'folgas':    renderMinhasFolgas(content); break;
  }
}

function mudarData(val) { DATA_ATUAL = val; atualizarTopbar('Agenda de ' + new Date(val+'T00:00:00').toLocaleDateString('pt-PT',{day:'numeric',month:'long'})); renderAgenda(document.getElementById('med-content')); }

// ── AGENDA ────────────────────────────────────────────────────────────────────
async function renderAgenda(el) {
  el.innerHTML = `
  <div class="grid-4" style="margin-bottom:1.25rem" id="ag-stats">
    <div class="stat-card"><div class="stat-label">Consultas hoje</div><div class="stat-value" id="ag-st-total">—</div></div>
    <div class="stat-card"><div class="stat-label">Realizadas</div><div class="stat-value" id="ag-st-feitas">—</div></div>
    <div class="stat-card"><div class="stat-label">Pendentes</div><div class="stat-value" id="ag-st-pend">—</div></div>
    <div class="stat-card"><div class="stat-label">Slots livres</div><div class="stat-value" id="ag-st-livres">—</div></div>
  </div>
  <div class="grid-3-1">
    <div class="card">
      <div class="card-hd"><span class="card-title">Agenda</span><span class="badge badge-info" id="ag-livre-badge"></span></div>
      <div id="ag-slots"></div>
    </div>
    <div>
      <div class="card" style="margin-bottom:1rem">
        <div class="card-hd"><span class="card-title">Próximos slots livres</span></div>
        <div id="ag-proximos"></div>
      </div>
      <div class="card">
        <div class="card-hd"><span class="card-title">Notas do dia</span></div>
        <textarea class="form-textarea" id="notas-dia" placeholder="Notas clínicas, lembretes..." oninput="autoSaveNotas()"></textarea>
      </div>
    </div>
  </div>`;

  carregarAgendaData();
}

async function carregarAgendaData() {
  try {
    const agenda = await API.get(`/medicos/${MEU_MEDICO.id}/agenda?data=${DATA_ATUAL}`);
    renderSlots(agenda.slots || []);
  } catch {
    renderSlotsDemo();
  }

  try {
    const nota = await API.get(`/medicos/${MEU_MEDICO.id}/notas?data=${DATA_ATUAL}`);
    document.getElementById('notas-dia').value = nota || '';
  } catch {}

  renderProximosSlots();
}

function renderSlots(slots) {
  const total = slots.length;
  const livres = slots.filter(s => s.estado === 'livre').length;
  const feitas = slots.filter(s => s.marcacao?.status === 'realizada').length;
  const pendentes = slots.filter(s => s.estado !== 'livre' && s.marcacao?.status !== 'realizada').length;

  document.getElementById('ag-st-total').textContent = total - livres;
  document.getElementById('ag-st-feitas').textContent = feitas;
  document.getElementById('ag-st-pend').textContent = pendentes;
  document.getElementById('ag-st-livres').textContent = livres;
  document.getElementById('ag-livre-badge').textContent = `${livres} livres`;

  const el = document.getElementById('ag-slots');
  el.innerHTML = slots.map(s => {
    const isFree = s.estado === 'livre';
    const st = s.marcacao?.status || 'pendente';
    const dotClass = st === 'realizada' ? 'dot-done' : isFree ? 'dot-free' : st === 'falta' ? 'dot-pending' : 'dot-pending';
    const ini = s.marcacao?.pacienteNome?.split(' ').map(x=>x[0]).join('').slice(0,2) || '—';
    return `<div class="slot-row" id="slot-${s.hora.replace(':','')}">
      <span class="slot-hora">${s.hora}</span>
      <div class="slot-dot ${dotClass}"></div>
      <div style="flex:1;min-width:0">
        <div class="slot-name" style="${isFree?'color:var(--text-secondary)':''}">${isFree?'— Disponível —':(s.marcacao?.pacienteNome||'Marcação')}</div>
        ${s.marcacao ? `<div class="slot-type">${s.marcacao.servico}${s.marcacao.idioma&&s.marcacao.idioma!=='pt'?' · <b>'+s.marcacao.idioma.toUpperCase()+'</b>':''}</div>` : ''}
      </div>
      <div class="slot-actions">
        ${s.marcacao ? `
          <span class="badge badge-${st==='realizada'?'success':st==='falta'?'danger':st==='atrasado'?'warning':'gray'}">${st}</span>
          <button class="btn btn-sm" onclick="abrirEstadoConsulta(${JSON.stringify(s).replace(/"/g,'&quot;')})">Atualizar</button>
          <button class="btn btn-sm" onclick="abrirFichaPaciente('${s.marcacao.pacienteId||''}','${s.marcacao.pacienteNome}')">Ficha</button>
        ` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderSlotsDemo() {
  const demo = [
    {hora:'09:00',estado:'ocupado',marcacao:{pacienteNome:'Maria Silva',servico:'Higiene oral',status:'realizada',idioma:'pt'}},
    {hora:'09:30',estado:'ocupado',marcacao:{pacienteNome:'João Matos',servico:'Consulta rotina',status:'realizada',idioma:'pt'}},
    {hora:'10:00',estado:'ocupado',marcacao:{pacienteNome:'Carlos Ramos',servico:'Ortodontia',status:'em_curso',idioma:'pt'}},
    {hora:'10:30',estado:'livre',marcacao:null},
    {hora:'11:00',estado:'ocupado',marcacao:{pacienteNome:'Sarah Connor',servico:'Check-up',status:'pendente',idioma:'en'}},
    {hora:'11:30',estado:'ocupado',marcacao:{pacienteNome:'Rita P.',servico:'Branqueamento',status:'pendente',idioma:'pt'}},
    {hora:'14:00',estado:'ocupado',marcacao:{pacienteNome:'Tiago N.',servico:'Extração',status:'pendente',idioma:'pt'}},
    {hora:'14:30',estado:'livre',marcacao:null},
  ];
  renderSlots(demo);
}

async function renderProximosSlots() {
  const el = document.getElementById('ag-proximos');
  if (!el) return;
  try {
    const semana = await API.get(`/medicos/${MEU_MEDICO.id}/agenda/semana`);
    const diasComSlots = semana.filter(d => d.slots && d.slots.some(s => s.estado === 'livre')).slice(0,3);
    if (diasComSlots.length) {
      el.innerHTML = diasComSlots.map(d => {
        const livres = d.slots.filter(s => s.estado === 'livre');
        const dataFmt = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-PT', { weekday:'short', day:'numeric', month:'short' });
        return `<div style="margin-bottom:10px">
          <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:5px;text-transform:uppercase">${dataFmt}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${livres.slice(0,6).map(s=>`<span class="badge badge-info">${s.hora}</span>`).join('')}</div>
        </div>`;
      }).join('');
      return;
    }
  } catch {}
  // Fallback demo
  el.innerHTML = [
    {label:'Amanhã', horas:['09:00','10:30','14:00','15:30']},
    {label:'Depois de amanhã', horas:['09:30','11:00']},
  ].map(d => `<div style="margin-bottom:10px">
    <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:5px;text-transform:uppercase">${d.label}</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">${d.horas.map(h=>`<span class="badge badge-info">${h}</span>`).join('')}</div>
  </div>`).join('');
}

let notasTimer;
function autoSaveNotas() {
  clearTimeout(notasTimer);
  notasTimer = setTimeout(async () => {
    const conteudo = document.getElementById('notas-dia')?.value;
    try { await API.post(`/medicos/${MEU_MEDICO.id}/notas`, { data: DATA_ATUAL, conteudo }); } catch {}
  }, 1500);
}

// ── ESTADO CONSULTA ───────────────────────────────────────────────────────────
function abrirEstadoConsulta(slot) {
  MARCACAO_ATUAL = slot;
  const m = slot.marcacao;
  const ini = m.pacienteNome?.split(' ').map(x=>x[0]).join('').slice(0,2) || '??';
  document.getElementById('estado-av').textContent = ini;
  document.getElementById('estado-nome').textContent = m.pacienteNome;
  document.getElementById('estado-hora-serv').textContent = `${slot.hora} · ${m.servico}`;
  ESTADO_ATUAL = m.status || null;
  ['realizada','falta','atrasado','cancelada'].forEach(s => document.getElementById(`sb-${s}`).className = 'status-btn');
  if (ESTADO_ATUAL) document.getElementById(`sb-${ESTADO_ATUAL}`)?.classList.add(`selected-${ESTADO_ATUAL}`);
  document.getElementById('atraso-wrap').style.display = 'none';
  document.getElementById('estado-notas').value = m.notas || '';
  openModal('modal-estado-consulta');
}

function selecionarStatus(s) {
  ESTADO_ATUAL = s;
  ['realizada','falta','atrasado','cancelada'].forEach(st => {
    const el = document.getElementById(`sb-${st}`);
    if (el) el.className = 'status-btn' + (st === s ? ` selected-${s}` : '');
  });
  document.getElementById('atraso-wrap').style.display = s === 'atrasado' ? 'block' : 'none';
}

async function guardarEstado() {
  if (!ESTADO_ATUAL) return toast('Seleciona o estado da consulta.','warning');
  const notas = document.getElementById('estado-notas').value;
  const atraso = ESTADO_ATUAL === 'atrasado' ? parseInt(document.getElementById('atraso-min').value) : 0;

  try {
    await API.patch(`/medicos/${MEU_MEDICO.id}/marcacoes/${MARCACAO_ATUAL.marcacao?.id||'demo'}`, {
      status: ESTADO_ATUAL, notas, minutosAtraso: atraso,
    });
    toast('Estado guardado. Administração notificada.','success');
    closeModal('modal-estado-consulta');
    carregarAgendaData();
  } catch {
    // Demo: update local
    toast('Estado guardado (demo). Administração notificada.','success');
    closeModal('modal-estado-consulta');
  }
}

// ── NOVA MARCAÇÃO ─────────────────────────────────────────────────────────────
async function criarMarcacao() {
  const dados = {
    pacienteNome: document.getElementById('nm-pac-nome').value,
    telefone: document.getElementById('nm-pac-tel').value,
    data: document.getElementById('nm-data').value,
    hora: document.getElementById('nm-hora').value,
    servico: document.getElementById('nm-servico').value,
    idioma: document.getElementById('nm-idioma').value,
    notas: document.getElementById('nm-notas').value,
  };
  if (!dados.pacienteNome || !dados.data || !dados.hora) return toast('Preenche nome, data e hora.','warning');
  try {
    await API.post(`/medicos/${MEU_MEDICO.id}/marcacoes`, dados);
    toast('Marcação criada!','success');
    closeModal('modal-nova-marcacao');
    carregarAgendaData();
  } catch(e) { toast(e.message,'error'); }
}

// Preenche select de horas ao escolher data
document.getElementById('nm-data')?.addEventListener('change', async function() {
  const sel = document.getElementById('nm-hora');
  try {
    const ag = await API.get(`/medicos/${MEU_MEDICO.id}/agenda?data=${this.value}`);
    const livres = (ag.slots||[]).filter(s=>s.estado==='livre');
    sel.innerHTML = livres.map(s=>`<option>${s.hora}</option>`).join('');
    if (!livres.length) sel.innerHTML = '<option>Sem vagas neste dia</option>';
  } catch {
    sel.innerHTML = ['09:00','09:30','10:00','10:30','11:00','14:00','14:30','15:00'].map(h=>`<option>${h}</option>`).join('');
  }
});

// ── FOLGA ─────────────────────────────────────────────────────────────────────
async function registarFolga() {
  const inicio = document.getElementById('folga-inicio').value;
  const fim = document.getElementById('folga-fim').value || inicio;
  const motivo = document.getElementById('folga-motivo').value;
  const notas = document.getElementById('folga-notas').value;
  if (!inicio) return toast('Seleciona pelo menos a data de início.','warning');
  try {
    await API.post(`/medicos/${MEU_MEDICO.id}/folgas`, { inicio, fim, motivo, notas });
    toast('Folga registada. Administração notificada e agenda bloqueada.','success');
    closeModal('modal-folga');
  } catch { toast('Folga registada (demo). Administração notificada.','success'); closeModal('modal-folga'); }
}

// ── PACIENTES ─────────────────────────────────────────────────────────────────
async function renderPacientes(el) {
  el.innerHTML = `
  <div class="card">
    <div class="card-hd"><span class="card-title">Os meus pacientes</span></div>
    <div style="margin-bottom:1rem"><input class="form-input" id="pac-search" placeholder="Pesquisar nome, telemóvel..." oninput="filtrarPacs()" style="max-width:340px"></div>
    <div id="pacs-lista"></div>
  </div>`;
  await carregarPacientes();
}

async function carregarPacientes() {
  try {
    const pacs = await API.get(`/medicos/${MEU_MEDICO.id}/pacientes`);
    renderListaPacs(pacs);
  } catch { renderListaPacs(DEMO_PACS); }
}

function renderListaPacs(pacs) {
  const el = document.getElementById('pacs-lista');
  if (!el) return;
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Nome</th><th>Telefone</th><th>Última consulta</th><th>Visitas</th><th>Idioma</th><th></th></tr></thead>
    <tbody>${pacs.map(p => `
    <tr onclick="abrirFichaPaciente('${p.id}','${p.nome}')">
      <td><div style="display:flex;align-items:center;gap:8px">
        <div class="avatar" style="background:${MEU_MEDICO.cor?.bg||'#E6F1FB'};color:${MEU_MEDICO.cor?.text||'#0C447C'};width:28px;height:28px;font-size:10px">${p.nome.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
        <span style="font-weight:500">${p.nome}</span>
      </div></td>
      <td style="font-family:var(--font-mono);font-size:12px">${p.telefone||'—'}</td>
      <td>${fmtData(p.ultimaConsulta)}</td>
      <td style="font-weight:600">${p.visitas||0}</td>
      <td><span class="badge badge-gray">${{pt:'PT',en:'EN',es:'ES',fr:'FR',it:'IT'}[p.idioma]||'PT'}</span></td>
      <td><button class="btn btn-sm" onclick="event.stopPropagation();abrirFichaPaciente('${p.id}','${p.nome}')">Ficha</button></td>
    </tr>`).join('')}
    </tbody></table>`;
}

async function filtrarPacs() {
  const q = document.getElementById('pac-search').value.toLowerCase();
  try {
    const pacs = await API.get(`/medicos/${MEU_MEDICO.id}/pacientes?pesquisa=${encodeURIComponent(q)}`);
    renderListaPacs(pacs);
  } catch { renderListaPacs(DEMO_PACS.filter(p => p.nome.toLowerCase().includes(q) || p.telefone?.includes(q))); }
}

async function abrirFichaPaciente(id, nome) {
  document.getElementById('pac-modal-title').textContent = nome || 'Ficha do paciente';
  document.getElementById('pac-modal-body').innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary)">A carregar...</div>';
  openModal('modal-paciente');

  try {
    const p = await API.get(`/medicos/${MEU_MEDICO.id}/pacientes/${id}`);
    renderFichaPac(p);
  } catch { renderFichaPac(DEMO_PACS.find(x=>x.id===id) || {id, nome, telefone:'—', idioma:'pt', visitas:0, historico:[], chamadas:[]}); }
}

function renderFichaPac(p) {
  const ini = p.nome?.split(' ').map(x=>x[0]).join('').slice(0,2) || '??';
  document.getElementById('pac-modal-body').innerHTML = `
  <div style="display:flex;gap:12px;align-items:center;padding:12px;background:var(--bg-secondary);border-radius:var(--radius-md);margin-bottom:1.25rem">
    <div class="avatar xl" style="background:${MEU_MEDICO.cor?.bg||'#E6F1FB'};color:${MEU_MEDICO.cor?.text||'#0C447C'}">${ini}</div>
    <div style="flex:1">
      <div style="font-size:16px;font-weight:600">${p.nome}</div>
      <div style="font-size:12px;color:var(--text-secondary)">${p.telefone||'—'} · ${p.email||'—'}</div>
    </div>
    <span class="badge badge-success">Ativo</span>
  </div>
  <div class="form-grid-2" style="margin-bottom:1rem">
    <div><div style="font-size:11px;color:var(--text-secondary)">Data de nascimento</div><div style="font-size:13px;font-weight:500">${fmtData(p.dataNascimento)||'—'}</div></div>
    <div><div style="font-size:11px;color:var(--text-secondary)">NIF</div><div style="font-size:13px;font-weight:500">${p.nif||'—'}</div></div>
    <div><div style="font-size:11px;color:var(--text-secondary)">Subsistema</div><div style="font-size:13px;font-weight:500">${p.subsistema||'Privado'}</div></div>
    <div><div style="font-size:11px;color:var(--text-secondary)">Idioma</div><div style="font-size:13px;font-weight:500">${{pt:'Português',en:'Inglês',es:'Espanhol',fr:'Francês',it:'Italiano'}[p.idioma]||p.idioma||'Português'}</div></div>
  </div>
  ${p.obs ? `<div style="background:var(--bg-warning);border-radius:var(--radius-md);padding:10px 12px;font-size:12px;color:var(--text-warning);margin-bottom:1rem">${p.obs}</div>` : ''}
  <div style="font-size:13px;font-weight:600;margin-bottom:.5rem">Histórico de consultas</div>
  ${(p.historico||[]).slice(0,5).map(h=>`
  <div style="display:flex;gap:10px;padding:7px 0;border-bottom:0.5px solid var(--border);font-size:12px">
    <span style="font-family:var(--font-mono);color:var(--text-secondary);min-width:80px">${fmtData(h.data)||h.data||'—'}</span>
    <div><div style="font-weight:500;color:var(--text-primary)">${h.servico||h.serv||'Consulta'}</div><div style="color:var(--text-secondary);margin-top:1px">${h.notas||h.obs||''}</div></div>
  </div>`).join('')||'<div style="font-size:12px;color:var(--text-secondary);padding:8px 0">Sem histórico registado.</div>'}
  ${(p.chamadas||[]).length>0?`<div style="font-size:13px;font-weight:600;margin-top:1rem;margin-bottom:.5rem">Chamadas IA</div>${p.chamadas.slice(0,3).map(c=>`<div style="font-size:12px;color:var(--text-secondary);padding:6px 0;border-bottom:0.5px solid var(--border)">${fmtData(c.inicio)||'—'} · ${c.duracao||'—'}s · ${c.status||'—'}</div>`).join('')}`:''}`;
}

// ── HISTÓRICO ─────────────────────────────────────────────────────────────────
async function renderHistorico(el) {
  el.innerHTML = `<div class="card"><div class="card-hd"><span class="card-title">Histórico de consultas realizadas</span></div><div id="hist-lista"></div></div>`;
  try {
    const marc = await API.get(`/medicos/${MEU_MEDICO.id}/marcacoes?limite=50`);
    document.getElementById('hist-lista').innerHTML = `<table class="data-table">
      <thead><tr><th>Data</th><th>Hora</th><th>Paciente</th><th>Serviço</th><th>Estado</th><th>Origem</th></tr></thead>
      <tbody>${marc.map(m=>`<tr>
        <td>${fmtData(m.data)||'—'}</td><td style="font-family:var(--font-mono)">${m.hora||'—'}</td>
        <td style="font-weight:500">${m.pacienteNome||'—'}</td><td>${m.servico||'—'}</td>
        <td><span class="badge badge-${m.status==='realizada'?'success':m.status==='falta'?'danger':m.status==='atrasado'?'warning':'gray'}">${m.status||'pendente'}</span></td>
        <td><span class="badge badge-${m.origem==='ia'?'info':'gray'}">${m.origem==='ia'?'IA':'Manual'}</span></td>
      </tr>`).join('')}</tbody></table>`;
  } catch { document.getElementById('hist-lista').innerHTML = '<div style="font-size:13px;color:var(--text-secondary);padding:1rem">Sem dados em modo demo.</div>'; }
}

// ── AS MINHAS FOLGAS ──────────────────────────────────────────────────────────
function renderMinhasFolgas(el) {
  el.innerHTML = `
  <div class="card">
    <div class="card-hd"><span class="card-title">As minhas folgas</span><button class="btn btn-sm btn-primary" onclick="openModal('modal-folga')">+ Registar folga</button></div>
    <table class="data-table">
      <thead><tr><th>Início</th><th>Fim</th><th>Motivo</th><th>Notas</th><th>Estado</th></tr></thead>
      <tbody id="folgas-med"></tbody>
    </table>
  </div>`;
  carregarMinhasFolgas();
}

async function carregarMinhasFolgas() {
  try {
    const folgas = await API.get(`/medicos/${MEU_MEDICO.id}/folgas`);
    document.getElementById('folgas-med').innerHTML = folgas.map(f=>`<tr>
      <td>${fmtData(f.inicio)}</td><td>${fmtData(f.fim)||fmtData(f.inicio)}</td>
      <td>${f.motivo||'—'}</td><td style="color:var(--text-secondary)">${f.notas||'—'}</td>
      <td><span class="badge badge-${new Date(f.inicio)>new Date()?'warning':'gray'}">${new Date(f.inicio)>new Date()?'Futura':'Passada'}</span></td>
    </tr>`).join('');
  } catch {
    document.getElementById('folgas-med').innerHTML = `<tr><td>26/03/2026</td><td>26/03/2026</td><td>Formação</td><td>Congresso Lisboa</td><td><span class="badge badge-warning">Futura</span></td></tr>`;
  }
}

// ── Demo data ─────────────────────────────────────────────────────────────────
const DEMO_PACS = [
  {id:'p1',nome:'Maria Silva',telefone:'+351912345678',email:'maria@email.pt',idioma:'pt',visitas:7,dataNascimento:'1985-04-12',nif:'234567890',subsistema:'ADSE',obs:'Alergia a anestesia com epinefrina.',historico:[{data:'2026-03-24',serv:'Higiene oral',obs:'Sem cáries.'},{data:'2026-03-10',serv:'Consulta rotina',obs:'Radiografia ok.'}]},
  {id:'p2',nome:'João Matos',telefone:'+351963456789',email:'joao@email.pt',idioma:'pt',visitas:3,historico:[]},
  {id:'p3',nome:'Carlos Ramos',telefone:'+351934567890',email:'carlos@email.pt',idioma:'pt',visitas:12,obs:'Ansiedade dentária. Prefer sedação consciente.',historico:[]},
  {id:'p4',nome:'Sarah Connor',telefone:'+447700900000',email:'sarah@email.co.uk',idioma:'en',visitas:2,historico:[]},
];

/**
 * database.js — Camada de dados VozClinic
 * JSON persistido em ficheiro local. Substituível por PostgreSQL.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data.json");

// ─── Cores dos médicos ────────────────────────────────────────────────────────
const CORES = {
  blue:  { bg:"#E6F1FB", text:"#0C447C" },
  green: { bg:"#E1F5EE", text:"#085041" },
  amber: { bg:"#FAEEDA", text:"#633806" },
  pink:  { bg:"#FBEAF0", text:"#72243E" },
};

// ─── Estado em memória ────────────────────────────────────────────────────────
let state = {
  medicos:       [],
  pacientes:     [],
  chamadas:      [],
  marcacoes:     [],
  campanhas:     [],
  folgas:        [],
  notificacoes:  [],
  notas:         {},
  agenda:        {},
  sessoes:       {},  // não persistido
};

// ─── Persistência ─────────────────────────────────────────────────────────────
function salvar() {
  const { sessoes, ...persistivel } = state;
  fs.writeFileSync(DB_PATH, JSON.stringify(persistivel, null, 2));
}

function carregar() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
      state = { ...state, ...data, sessoes: {} };
      return true;
    } catch { return false; }
  }
  return false;
}

// ─── Geração de agenda ────────────────────────────────────────────────────────
const HORAS_MANHA = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30"];
const HORAS_TARDE = ["14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"];
const TODOS_SLOTS  = [...HORAS_MANHA, ...HORAS_TARDE];

function gerarAgendaMedico(medicoId, data) {
  const chave = `${medicoId}_${data}`;
  if (!state.agenda[chave]) {
    const slots = {};
    TODOS_SLOTS.forEach(h => { slots[h] = "livre"; });
    state.agenda[chave] = slots;
  }
  return state.agenda[chave];
}

function gerarAgendaProximos60Dias() {
  const hoje = new Date();
  for (let i = 0; i <= 60; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    const diaSemana = d.getDay();
    if (diaSemana === 0 || diaSemana === 6) continue; // fim de semana
    const data = d.toISOString().split("T")[0];
    state.medicos.forEach(m => gerarAgendaMedico(m.id, data));
  }
}

// ─── Seed de demonstração ─────────────────────────────────────────────────────
async function seed() {
  const hash = await bcrypt.hash("demo1234", 10);
  const hoje = new Date().toISOString().split("T")[0];
  const amanha = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  state.medicos = [
    { id:"med_fonseca", nome:"Dra. Ana Fonseca", especialidade:"Ortodontia & Geral",
      email:"fonseca@dentalstar.pt", senhaHash:hash, iniciais:"AF", cor:CORES.blue,
      horario:"Segunda a Sexta, 09:00–18:00", ativo:true, criadoEm:"2026-01-01T00:00:00Z" },
    { id:"med_ramos", nome:"Dr. Pedro Ramos", especialidade:"Implantologia",
      email:"ramos@dentalstar.pt", senhaHash:hash, iniciais:"PR", cor:CORES.green,
      horario:"Segunda a Sexta, 09:00–18:00", ativo:true, criadoEm:"2026-01-01T00:00:00Z" },
    { id:"med_costa", nome:"Dra. Marta Costa", especialidade:"Estética & Branqueamento",
      email:"costa@dentalstar.pt", senhaHash:hash, iniciais:"MC", cor:CORES.amber,
      horario:"Segunda a Sexta, 09:00–18:00", ativo:true, criadoEm:"2026-01-01T00:00:00Z" },
    { id:"med_silva", nome:"Dr. Rui Silva", especialidade:"Pediatria Dentária",
      email:"silva@dentalstar.pt", senhaHash:hash, iniciais:"RS", cor:CORES.pink,
      horario:"Segunda a Sexta, 09:00–18:00", ativo:true, criadoEm:"2026-01-01T00:00:00Z" },
  ];

  state.pacientes = [
    { id:"pac_001", nome:"Maria Silva", telefone:"+351912345678", email:"maria@email.pt",
      idioma:"pt", medicoId:"med_fonseca", dataNascimento:"1985-04-12", nif:"234567890",
      subsistema:"ADSE", visitas:7, ultimaConsulta:"2026-03-01T09:00:00Z",
      obs:"Alergia a anestesia com epinefrina.", criadoEm:"2026-01-01T00:00:00Z" },
    { id:"pac_002", nome:"João Matos", telefone:"+351963456789", email:"joao@email.pt",
      idioma:"pt", medicoId:"med_fonseca", dataNascimento:"1990-08-22", nif:"",
      subsistema:"Privado", visitas:3, ultimaConsulta:"2026-02-15T10:00:00Z",
      obs:"", criadoEm:"2026-01-15T00:00:00Z" },
    { id:"pac_003", nome:"Carlos Ramos", telefone:"+351934567890", email:"carlos@email.pt",
      idioma:"pt", medicoId:"med_ramos", dataNascimento:"1978-11-05", nif:"345678901",
      subsistema:"SNS", visitas:12, ultimaConsulta:"2026-03-10T14:00:00Z",
      obs:"Ansiedade dentária. Prefer sedação consciente.", criadoEm:"2025-12-01T00:00:00Z" },
    { id:"pac_004", nome:"Sarah Connor", telefone:"+447700900000", email:"sarah@email.co.uk",
      idioma:"en", medicoId:"med_ramos", dataNascimento:"1988-06-18", nif:"",
      subsistema:"Privado", visitas:2, ultimaConsulta:"2026-03-05T11:00:00Z",
      obs:"", criadoEm:"2026-02-01T00:00:00Z" },
    { id:"pac_005", nome:"Sophie Laurent", telefone:"+33612345678", email:"sophie@email.fr",
      idioma:"fr", medicoId:"med_costa", dataNascimento:"1992-03-30", nif:"",
      subsistema:"Privado", visitas:4, ultimaConsulta:"2026-03-08T09:30:00Z",
      obs:"", criadoEm:"2026-01-20T00:00:00Z" },
    { id:"pac_006", nome:"Ana Ferreira", telefone:"+351965432100", email:"ana@email.pt",
      idioma:"pt", medicoId:"med_costa", dataNascimento:"1995-07-14", nif:"456789012",
      subsistema:"Médis", visitas:5, ultimaConsulta:"2026-03-12T15:00:00Z",
      obs:"", criadoEm:"2026-01-10T00:00:00Z" },
    { id:"pac_007", nome:"Tiago Nunes", telefone:"+351911222333", email:"tiago@email.pt",
      idioma:"pt", medicoId:"med_costa", dataNascimento:"1982-09-25", nif:"567890123",
      subsistema:"ADSE", visitas:8, ultimaConsulta:"2026-03-18T10:00:00Z",
      obs:"", criadoEm:"2025-11-01T00:00:00Z" },
    { id:"pac_008", nome:"Rita Pinto", telefone:"+351966778899", email:"rita@email.pt",
      idioma:"pt", medicoId:"med_silva", dataNascimento:"2010-01-08", nif:"",
      subsistema:"SNS", visitas:6, ultimaConsulta:"2026-02-28T09:00:00Z",
      obs:"Paciente pediátrico.", criadoEm:"2025-12-15T00:00:00Z" },
    { id:"pac_009", nome:"Marco Rossi", telefone:"+393331234567", email:"marco@email.it",
      idioma:"it", medicoId:"med_silva", dataNascimento:"2008-05-12", nif:"",
      subsistema:"Privado", visitas:1, ultimaConsulta:null,
      obs:"", criadoEm:"2026-03-01T00:00:00Z" },
    { id:"pac_010", nome:"Pedro Gomes", telefone:"+351988776655", email:"pedro@email.pt",
      idioma:"pt", medicoId:"med_fonseca", dataNascimento:"1975-12-03", nif:"678901234",
      subsistema:"AdvanceCare", visitas:10, ultimaConsulta:"2026-03-20T14:30:00Z",
      obs:"", criadoEm:"2025-10-01T00:00:00Z" },
  ];

  // Gera agenda
  gerarAgendaProximos60Dias();

  // Marcações de hoje com estados variados
  const marcacoesHoje = [
    { id:"marc_001", medicoId:"med_fonseca", pacienteId:"pac_001", pacienteNome:"Maria Silva",
      telefone:"+351912345678", data:hoje, hora:"09:00", servico:"Higiene oral",
      status:"realizada", idioma:"pt", origem:"manual", notas:"Sem cáries. Higiene excelente.",
      smsEnviado:[], criadoEm:hoje+"T08:00:00Z" },
    { id:"marc_002", medicoId:"med_fonseca", pacienteId:"pac_002", pacienteNome:"João Matos",
      telefone:"+351963456789", data:hoje, hora:"09:30", servico:"Consulta rotina",
      status:"realizada", idioma:"pt", origem:"ia", notas:"",
      smsEnviado:[], criadoEm:hoje+"T08:00:00Z" },
    { id:"marc_003", medicoId:"med_fonseca", pacienteId:"pac_010", pacienteNome:"Pedro Gomes",
      telefone:"+351988776655", data:hoje, hora:"10:00", servico:"Ortodontia",
      status:"em_curso", idioma:"pt", origem:"ia", notas:"",
      smsEnviado:[], criadoEm:hoje+"T08:00:00Z" },
    { id:"marc_004", medicoId:"med_ramos", pacienteId:"pac_003", pacienteNome:"Carlos Ramos",
      telefone:"+351934567890", data:hoje, hora:"09:00", servico:"Implante — consulta",
      status:"realizada", idioma:"pt", origem:"manual", notas:"",
      smsEnviado:[], criadoEm:hoje+"T08:00:00Z" },
    { id:"marc_005", medicoId:"med_ramos", pacienteId:"pac_004", pacienteNome:"Sarah Connor",
      telefone:"+447700900000", data:hoje, hora:"10:00", servico:"Check-up",
      status:"pendente", idioma:"en", origem:"ia", notas:"",
      smsEnviado:[], criadoEm:hoje+"T08:00:00Z" },
    { id:"marc_006", medicoId:"med_costa", pacienteId:"pac_005", pacienteNome:"Sophie Laurent",
      telefone:"+33612345678", data:hoje, hora:"09:00", servico:"Branqueamento",
      status:"realizada", idioma:"fr", origem:"ia", notas:"",
      smsEnviado:[], criadoEm:hoje+"T08:00:00Z" },
    { id:"marc_007", medicoId:"med_costa", pacienteId:"pac_006", pacienteNome:"Ana Ferreira",
      telefone:"+351965432100", data:hoje, hora:"10:30", servico:"Higiene oral",
      status:"pendente", idioma:"pt", origem:"manual", notas:"",
      smsEnviado:[], criadoEm:hoje+"T08:00:00Z" },
    { id:"marc_008", medicoId:"med_silva", pacienteId:"pac_008", pacienteNome:"Rita Pinto",
      telefone:"+351966778899", data:hoje, hora:"09:00", servico:"Selantes",
      status:"realizada", idioma:"pt", origem:"manual", notas:"Selantes aplicados em molares.",
      smsEnviado:[], criadoEm:hoje+"T08:00:00Z" },
    { id:"marc_009", medicoId:"med_silva", pacienteId:"pac_009", pacienteNome:"Marco Rossi",
      telefone:"+393331234567", data:hoje, hora:"10:00", servico:"Consulta rotina",
      status:"falta", idioma:"it", origem:"ia", notas:"",
      smsEnviado:[], criadoEm:hoje+"T08:00:00Z" },
  ];

  state.marcacoes = marcacoesHoje;

  // Ocupar slots na agenda
  for (const m of marcacoesHoje) {
    const chave = `${m.medicoId}_${m.data}`;
    if (state.agenda[chave]) state.agenda[chave][m.hora] = m.status === "cancelada" ? "livre" : "ocupado";
  }

  // Folga demo: Dr. Ramos amanhã
  state.folgas = [{
    id:"folga_001", medicoId:"med_ramos",
    inicio: amanha, fim: amanha, motivo:"Formação", notas:"Congresso Lisboa",
    criadoEm: hoje+"T07:00:00Z",
  }];
  // Bloquear agenda da folga
  const chaveRamosAmanha = `med_ramos_${amanha}`;
  if (!state.agenda[chaveRamosAmanha]) gerarAgendaMedico("med_ramos", amanha);
  TODOS_SLOTS.forEach(h => { state.agenda[chaveRamosAmanha][h] = "folga"; });

  // Notificações demo
  state.notificacoes = [
    { id:"notif_001", tipo:"falta", urgencia:"alta", medicoNome:"Dr. Pedro Ramos",
      msg:"Marco Rossi não compareceu à consulta das 10:00 com Dr. Silva.", lida:false,
      criadoEm: new Date().toISOString() },
    { id:"notif_002", tipo:"ia", urgencia:"baixa", medicoNome:"Vários",
      msg:"Sofia (IA) marcou 3 consultas via chamada nas últimas 2h.", lida:false,
      criadoEm: new Date(Date.now()-7200000).toISOString() },
    { id:"notif_003", tipo:"folga", urgencia:"media", medicoNome:"Dr. Pedro Ramos",
      msg:`Dr. Pedro Ramos registou folga para ${amanha} (Formação). Agenda bloqueada.`, lida:true,
      criadoEm: new Date(Date.now()-86400000).toISOString() },
  ];

  salvar();
  console.log("✅ Seed de demonstração criado.");
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const carregou = carregar();
  if (!carregou || state.medicos.length === 0) {
    console.log("📦 DB vazio — a criar seed de demonstração...");
    await seed();
  } else {
    // Garantir que agenda tem os próximos 60 dias
    gerarAgendaProximos60Dias();
    // Sincronizar marcações existentes com agenda
    for (const m of state.marcacoes) {
      if (m.status !== "cancelada") {
        const chave = `${m.medicoId}_${m.data}`;
        if (state.agenda[chave] && state.agenda[chave][m.hora] === "livre") {
          state.agenda[chave][m.hora] = "ocupado";
        }
      }
    }
    // Sincronizar folgas existentes
    for (const f of state.folgas) {
      const inicio = new Date(f.inicio+"T00:00:00");
      const fim    = new Date((f.fim||f.inicio)+"T00:00:00");
      for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate()+1)) {
        const data = d.toISOString().split("T")[0];
        const chave = `${f.medicoId}_${data}`;
        if (!state.agenda[chave]) gerarAgendaMedico(f.medicoId, data);
        TODOS_SLOTS.forEach(h => { state.agenda[chave][h] = "folga"; });
      }
    }
    console.log("✅ DB carregado.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers internos
// ─────────────────────────────────────────────────────────────────────────────
function uid(prefixo = "id") { return `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

function dataFormatada(data) {
  return new Date(data+"T00:00:00").toLocaleDateString("pt-PT", { weekday:"long", day:"numeric", month:"long" });
}

// ─────────────────────────────────────────────────────────────────────────────
//  API pública — db.*
// ─────────────────────────────────────────────────────────────────────────────
export const db = {

  // ── Médicos ──────────────────────────────────────────────────────────────
  getMedicos() { return state.medicos.filter(m => m.ativo !== false); },
  getMedico(id) { return state.medicos.find(m => m.id === id); },
  getMedicoPorEmail(email) { return state.medicos.find(m => m.email === email?.toLowerCase()); },

  criarMedico(dados) {
    const m = { id: uid("med"), ativo:true, criadoEm: new Date().toISOString(), ...dados };
    state.medicos.push(m);
    gerarAgendaProximos60Dias();
    salvar();
    return m;
  },

  atualizarMedico(id, dados) {
    const i = state.medicos.findIndex(m => m.id === id);
    if (i === -1) return null;
    state.medicos[i] = { ...state.medicos[i], ...dados };
    salvar();
    return state.medicos[i];
  },

  getMedicosComStats(data) {
    return db.getMedicos().map(m => {
      const marcacoesHoje = state.marcacoes.filter(x => x.medicoId === m.id && x.data === data);
      const agenda = state.agenda[`${m.id}_${data}`] || {};
      const totalSlots = Object.keys(agenda).length;
      const livres = Object.values(agenda).filter(v => v === "livre").length;
      const ocupados = totalSlots - livres;
      return {
        ...m,
        stats: {
          consultasHoje: ocupados,
          slotsLivres: livres,
          pacientesTotal: state.pacientes.filter(p => p.medicoId === m.id).length,
          ocupacao: totalSlots > 0 ? Math.round((ocupados / totalSlots) * 100) : 0,
        },
      };
    });
  },

  // ── Pacientes ─────────────────────────────────────────────────────────────
  getPacientes(medicoId, pesquisa) {
    let pacs = state.pacientes;
    if (medicoId) pacs = pacs.filter(p => p.medicoId === medicoId);
    if (pesquisa) {
      const q = pesquisa.toLowerCase();
      pacs = pacs.filter(p =>
        p.nome.toLowerCase().includes(q) ||
        (p.telefone||"").includes(q) ||
        (p.email||"").toLowerCase().includes(q)
      );
    }
    return pacs;
  },

  getPaciente(id) { return state.pacientes.find(p => p.id === id); },
  getPacientePorTelefone(tel) { return state.pacientes.find(p => p.telefone === tel); },

  getPacienteCompleto(medicoId, pacienteId) {
    const pac = state.pacientes.find(p => p.id === pacienteId && p.medicoId === medicoId);
    if (!pac) return null;
    const historico = state.marcacoes
      .filter(m => m.pacienteId === pacienteId && (m.status === "realizada" || m.status === "falta"))
      .sort((a, b) => b.data.localeCompare(a.data))
      .map(m => ({ data: m.data, servico: m.servico, status: m.status, notas: m.notas }));
    const chamadas = state.chamadas
      .filter(c => c.from === pac.telefone)
      .slice(0, 5)
      .map(c => ({ inicio: c.inicio, duracao: c.duracao, status: c.status }));
    return { ...pac, historico, chamadas };
  },

  criarPaciente(dados) {
    const p = { id: uid("pac"), visitas:0, criadoEm: new Date().toISOString(), ...dados };
    state.pacientes.push(p);
    salvar();
    return p;
  },

  atualizarPaciente(id, dados) {
    const i = state.pacientes.findIndex(p => p.id === id);
    if (i === -1) return null;
    state.pacientes[i] = { ...state.pacientes[i], ...dados };
    salvar();
    return state.pacientes[i];
  },

  // ── Agenda ────────────────────────────────────────────────────────────────
  getAgendaMedico(medicoId, data) {
    return state.agenda[`${medicoId}_${data}`] || gerarAgendaMedico(medicoId, data);
  },

  getAgendaEnriquecida(medicoId, data) {
    const slots = db.getAgendaMedico(medicoId, data);
    return TODOS_SLOTS.map(hora => {
      const estado = slots[hora] || "livre";
      const marcacao = estado === "ocupado"
        ? state.marcacoes.find(m => m.medicoId === medicoId && m.data === data && m.hora === hora && m.status !== "cancelada")
        : null;
      return { hora, estado: marcacao?.status === "cancelada" ? "livre" : estado, marcacao: marcacao || null };
    });
  },

  getAgendaSemana(medicoId) {
    const result = [];
    for (let i = 1; i <= 10; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const data = d.toISOString().split("T")[0];
      const slots = db.getAgendaMedico(medicoId, data);
      const horasLivres = TODOS_SLOTS.filter(h => slots[h] === "livre");
      if (horasLivres.length > 0) {
        result.push({ data, dataFormatada: dataFormatada(data), horasLivres });
      }
      if (result.length >= 7) break;
    }
    return result;
  },

  getVagasProximos7Dias(medicoId) {
    return db.getAgendaSemana(medicoId);
  },

  // ── Marcações ─────────────────────────────────────────────────────────────
  getMarcacoes(data, limite) {
    let m = state.marcacoes;
    if (data) m = m.filter(x => x.data === data);
    m = m.sort((a, b) => b.data.localeCompare(a.data) || b.hora.localeCompare(a.hora));
    if (limite) m = m.slice(0, parseInt(limite));
    return m;
  },

  getMarcacoesMedico(medicoId, data, limite) {
    let m = state.marcacoes.filter(x => x.medicoId === medicoId);
    if (data) m = m.filter(x => x.data === data);
    m = m.sort((a, b) => b.data.localeCompare(a.data) || a.hora.localeCompare(b.hora));
    if (limite) m = m.slice(0, parseInt(limite));
    return m;
  },

  getMarcacao(id) { return state.marcacoes.find(m => m.id === id); },

  getMarcacoesParaSMS(diasAntes) {
    const alvo = new Date();
    alvo.setDate(alvo.getDate() + diasAntes);
    const dataAlvo = alvo.toISOString().split("T")[0];
    const tag = `${diasAntes}d`;
    return state.marcacoes.filter(m =>
      m.data === dataAlvo &&
      m.status === "pendente" &&
      !(m.smsEnviado||[]).includes(tag)
    );
  },

  criarMarcacao(dados) {
    const marc = {
      id: uid("marc"),
      status: "pendente",
      smsEnviado: [],
      origem: "manual",
      criadoEm: new Date().toISOString(),
      ...dados,
    };
    // Remove id se for undefined
    if (!marc.id || marc.id === "marc_undefined") marc.id = uid("marc");

    state.marcacoes.push(marc);

    // Ocupar slot na agenda
    const chave = `${marc.medicoId}_${marc.data}`;
    if (!state.agenda[chave]) gerarAgendaMedico(marc.medicoId, marc.data);
    state.agenda[chave][marc.hora] = "ocupado";

    // Atualizar última consulta do paciente
    if (marc.pacienteId) {
      const i = state.pacientes.findIndex(p => p.id === marc.pacienteId);
      if (i !== -1) state.pacientes[i].visitas = (state.pacientes[i].visitas || 0) + 1;
    }

    salvar();
    return marc;
  },

  atualizarMarcacao(id, dados) {
    const i = state.marcacoes.findIndex(m => m.id === id);
    if (i === -1) return null;
    const anterior = state.marcacoes[i];
    state.marcacoes[i] = { ...anterior, ...dados };

    // Libertar slot se cancelada
    if (dados.status === "cancelada") {
      const chave = `${anterior.medicoId}_${anterior.data}`;
      if (state.agenda[chave]) state.agenda[chave][anterior.hora] = "livre";
    }

    salvar();
    return state.marcacoes[i];
  },

  marcarSMSEnviado(id, tag) {
    const m = state.marcacoes.find(x => x.id === id);
    if (m) { m.smsEnviado = [...(m.smsEnviado||[]), tag]; salvar(); }
  },

  // ── Folgas ────────────────────────────────────────────────────────────────
  getFolgas(medicoId) {
    let f = state.folgas;
    if (medicoId) f = f.filter(x => x.medicoId === medicoId);
    return f.sort((a, b) => b.inicio.localeCompare(a.inicio));
  },

  criarFolga(dados) {
    const folga = { id: uid("folga"), criadoEm: new Date().toISOString(), ...dados };
    state.folgas.push(folga);

    // Bloquear agenda nos dias da folga
    const inicio = new Date(folga.inicio+"T00:00:00");
    const fim    = new Date((folga.fim||folga.inicio)+"T00:00:00");
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate()+1)) {
      const data = d.toISOString().split("T")[0];
      const chave = `${folga.medicoId}_${data}`;
      if (!state.agenda[chave]) gerarAgendaMedico(folga.medicoId, data);
      TODOS_SLOTS.forEach(h => { state.agenda[chave][h] = "folga"; });
    }

    salvar();
    return folga;
  },

  cancelarFolga(id) {
    const i = state.folgas.findIndex(f => f.id === id);
    if (i === -1) return false;
    const folga = state.folgas[i];
    state.folgas.splice(i, 1);

    // Restaurar agenda
    const inicio = new Date(folga.inicio+"T00:00:00");
    const fim    = new Date((folga.fim||folga.inicio)+"T00:00:00");
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate()+1)) {
      const data = d.toISOString().split("T")[0];
      const chave = `${folga.medicoId}_${data}`;
      if (state.agenda[chave]) {
        TODOS_SLOTS.forEach(h => {
          if (state.agenda[chave][h] === "folga") state.agenda[chave][h] = "livre";
        });
        // Re-ocupar marcações existentes
        state.marcacoes
          .filter(m => m.medicoId === folga.medicoId && m.data === data && m.status !== "cancelada")
          .forEach(m => { if (state.agenda[chave][m.hora] !== undefined) state.agenda[chave][m.hora] = "ocupado"; });
      }
    }

    salvar();
    return true;
  },

  // ── Notas ─────────────────────────────────────────────────────────────────
  getNotaMedico(medicoId, data) {
    return state.notas[`${medicoId}_${data}`] || "";
  },

  guardarNotaMedico(medicoId, data, conteudo) {
    state.notas[`${medicoId}_${data}`] = conteudo;
    salvar();
  },

  // Para uso interno do SMS (vagas temporárias)
  getNotasMedico(chave, campo) {
    return state.notas[`${chave}_${campo}`] || "";
  },

  // ── Stats ─────────────────────────────────────────────────────────────────
  getStats() {
    const hoje = new Date().toISOString().split("T")[0];
    const chamadasHoje = state.chamadas.filter(c => c.inicio?.startsWith(hoje)).length;
    const marcacoesHoje = state.marcacoes.filter(m => m.data === hoje && m.origem === "ia").length;
    const totalHoje = state.marcacoes.filter(m => m.data === hoje).length;
    const taxa = totalHoje > 0 ? Math.round((marcacoesHoje / Math.max(chamadasHoje,1)) * 100) : 0;
    return {
      chamadasHoje,
      marcacoesHoje,
      taxaConversao: Math.min(taxa, 100),
      medicosAtivos: db.getMedicos().length,
    };
  },

  getStatsMedico(medicoId, periodo="dia") {
    const hoje = new Date().toISOString().split("T")[0];
    const marc = state.marcacoes.filter(m => m.medicoId === medicoId);
    const hojeMarc = marc.filter(m => m.data === hoje);
    return {
      consultasHoje: hojeMarc.filter(m => m.status !== "cancelada").length,
      realizadas: hojeMarc.filter(m => m.status === "realizada").length,
      pendentes: hojeMarc.filter(m => m.status === "pendente").length,
      slotsLivres: Object.values(state.agenda[`${medicoId}_${hoje}`]||{}).filter(v=>v==="livre").length,
      pacientesTotal: state.pacientes.filter(p => p.medicoId === medicoId).length,
      marcacoesIA: marc.filter(m => m.origem === "ia").length,
    };
  },

  // ── Notificações ──────────────────────────────────────────────────────────
  getNotificacoes() {
    return [...state.notificacoes]
      .sort((a, b) => Number(!a.lida) - Number(!b.lida) || b.criadoEm?.localeCompare(a.criadoEm||""));
  },

  criarNotificacao(dados) {
    const n = { id: uid("notif"), lida:false, criadoEm: new Date().toISOString(), ...dados };
    state.notificacoes.unshift(n);
    // Mantém max 200 notificações
    if (state.notificacoes.length > 200) state.notificacoes = state.notificacoes.slice(0, 200);
    salvar();
    return n;
  },

  marcarNotificacaoLida(id) {
    const n = state.notificacoes.find(x => x.id === id);
    if (n) { n.lida = true; salvar(); }
    return n;
  },

  marcarTodasLidas() {
    state.notificacoes.forEach(n => { n.lida = true; });
    salvar();
  },

  // ── Chamadas ──────────────────────────────────────────────────────────────
  getChamadas() { return [...state.chamadas].reverse(); },

  registarChamada(dados) {
    const c = { id: uid("call"), status:"iniciada", duracao:0, ...dados };
    state.chamadas.unshift(c);
    if (state.chamadas.length > 1000) state.chamadas = state.chamadas.slice(0, 1000);
    salvar();
    return c;
  },

  atualizarStatusChamada(callSid, status, duracao) {
    const c = state.chamadas.find(x => x.callSid === callSid);
    if (c) { c.status = status; c.duracao = duracao; c.fim = new Date().toISOString(); salvar(); }
  },

  encerrarChamada(callSid) {
    db.atualizarStatusChamada(callSid, "concluida", 0);
  },

  // ── Sessões (em memória, não persistido) ──────────────────────────────────
  getSessao(callSid) { return state.sessoes[callSid] || null; },
  setSessao(callSid, dados) { state.sessoes[callSid] = dados; },
  limparSessao(callSid) { delete state.sessoes[callSid]; },

  // ── Campanhas ─────────────────────────────────────────────────────────────
  criarCampanha(dados) {
    const c = { criadoEm: new Date().toISOString(), contatados:0, ...dados };
    state.campanhas.push(c);
    salvar();
    return c;
  },
};

// Init automático ao importar
await init();

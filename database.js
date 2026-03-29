/**
 * database.js — Camada de dados VozClinic com PostgreSQL
 * Usa a variável DATABASE_URL do Railway
 */
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway.internal")
    ? false
    : { rejectUnauthorized: false },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid(prefixo = "id") {
  return `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function dataFormatada(data) {
  return new Date(data + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "long", day: "numeric", month: "long",
  });
}

const HORAS_MANHA = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30"];
const HORAS_TARDE = ["14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"];
const TODOS_SLOTS = [...HORAS_MANHA, ...HORAS_TARDE];

const CORES = {
  blue:  { bg:"#E6F1FB", text:"#0C447C" },
  green: { bg:"#E1F5EE", text:"#085041" },
  amber: { bg:"#FAEEDA", text:"#633806" },
  pink:  { bg:"#FBEAF0", text:"#72243E" },
};

// Sessões em memória (não persistidas)
const sessoes = {};

// ─── Criação de tabelas ───────────────────────────────────────────────────────
async function criarTabelas() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medicos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      especialidade TEXT,
      email TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      iniciais TEXT,
      cor JSONB,
      horario TEXT,
      ativo BOOLEAN DEFAULT true,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pacientes (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      telefone TEXT,
      email TEXT,
      idioma TEXT DEFAULT 'pt',
      medico_id TEXT,
      data_nascimento TEXT,
      nif TEXT,
      subsistema TEXT,
      visitas INTEGER DEFAULT 0,
      ultima_consulta TIMESTAMPTZ,
      obs TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS marcacoes (
      id TEXT PRIMARY KEY,
      medico_id TEXT,
      paciente_id TEXT,
      paciente_nome TEXT,
      telefone TEXT,
      data TEXT,
      hora TEXT,
      servico TEXT,
      status TEXT DEFAULT 'pendente',
      idioma TEXT DEFAULT 'pt',
      origem TEXT DEFAULT 'manual',
      notas TEXT,
      minutos_atraso INTEGER DEFAULT 0,
      sms_enviado TEXT[] DEFAULT '{}',
      call_sid TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS folgas (
      id TEXT PRIMARY KEY,
      medico_id TEXT,
      inicio TEXT,
      fim TEXT,
      motivo TEXT,
      notas TEXT,
      registada_por TEXT DEFAULT 'medico',
      criado_em TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notificacoes (
      id TEXT PRIMARY KEY,
      tipo TEXT,
      urgencia TEXT DEFAULT 'baixa',
      medico_nome TEXT,
      para_medico_id TEXT,
      msg TEXT,
      lida BOOLEAN DEFAULT false,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chamadas (
      id TEXT PRIMARY KEY,
      call_sid TEXT UNIQUE,
      "from" TEXT,
      tipo TEXT,
      status TEXT DEFAULT 'iniciada',
      duracao INTEGER DEFAULT 0,
      inicio TIMESTAMPTZ,
      fim TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS notas (
      medico_id TEXT,
      data TEXT,
      conteudo TEXT,
      PRIMARY KEY (medico_id, data)
    );

    CREATE TABLE IF NOT EXISTS campanhas (
      id TEXT PRIMARY KEY,
      promocao TEXT,
      total INTEGER,
      idioma TEXT,
      medico_id TEXT,
      tipo TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agenda (
      medico_id TEXT,
      data TEXT,
      hora TEXT,
      estado TEXT DEFAULT 'livre',
      PRIMARY KEY (medico_id, data, hora)
    );
  `);
}

// ─── Seed de demonstração ─────────────────────────────────────────────────────
async function seed() {
  const hash = await bcrypt.hash("demo1234", 10);
  const hoje = new Date().toISOString().split("T")[0];
  const amanha = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const medicos = [
    { id:"med_fonseca", nome:"Dra. Ana Fonseca", especialidade:"Ortodontia & Geral", email:"fonseca@dentalstar.pt", cor: CORES.blue, iniciais:"AF" },
    { id:"med_ramos",   nome:"Dr. Pedro Ramos",  especialidade:"Implantologia",       email:"ramos@dentalstar.pt",   cor: CORES.green, iniciais:"PR" },
    { id:"med_costa",   nome:"Dra. Marta Costa", especialidade:"Estética & Branqueamento", email:"costa@dentalstar.pt", cor: CORES.amber, iniciais:"MC" },
    { id:"med_silva",   nome:"Dr. Rui Silva",    especialidade:"Pediatria Dentária",  email:"silva@dentalstar.pt",   cor: CORES.pink, iniciais:"RS" },
  ];

  for (const m of medicos) {
    await pool.query(`
      INSERT INTO medicos (id, nome, especialidade, email, senha_hash, iniciais, cor, horario, ativo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.nome, m.especialidade, m.email, hash, m.iniciais, JSON.stringify(m.cor), "Segunda a Sexta, 09:00–18:00"]
    );
  }

  const pacientes = [
    { id:"pac_001", nome:"Maria Silva",   telefone:"+351912345678", email:"maria@email.pt",   idioma:"pt", medicoId:"med_fonseca", obs:"Alergia a anestesia com epinefrina." },
    { id:"pac_002", nome:"João Matos",    telefone:"+351963456789", email:"joao@email.pt",    idioma:"pt", medicoId:"med_fonseca", obs:"" },
    { id:"pac_003", nome:"Carlos Ramos",  telefone:"+351934567890", email:"carlos@email.pt",  idioma:"pt", medicoId:"med_ramos",   obs:"Ansiedade dentária." },
    { id:"pac_004", nome:"Sarah Connor",  telefone:"+447700900000", email:"sarah@email.co.uk", idioma:"en", medicoId:"med_ramos",  obs:"" },
    { id:"pac_005", nome:"Sophie Laurent",telefone:"+33612345678",  email:"sophie@email.fr",  idioma:"fr", medicoId:"med_costa",  obs:"" },
    { id:"pac_006", nome:"Ana Ferreira",  telefone:"+351965432100", email:"ana@email.pt",     idioma:"pt", medicoId:"med_costa",  obs:"" },
    { id:"pac_007", nome:"Tiago Nunes",   telefone:"+351911222333", email:"tiago@email.pt",   idioma:"pt", medicoId:"med_costa",  obs:"" },
    { id:"pac_008", nome:"Rita Pinto",    telefone:"+351966778899", email:"rita@email.pt",    idioma:"pt", medicoId:"med_silva",  obs:"Paciente pediátrico." },
    { id:"pac_009", nome:"Marco Rossi",   telefone:"+393331234567", email:"marco@email.it",   idioma:"it", medicoId:"med_silva",  obs:"" },
    { id:"pac_010", nome:"Pedro Gomes",   telefone:"+351988776655", email:"pedro@email.pt",   idioma:"pt", medicoId:"med_fonseca", obs:"" },
  ];

  for (const p of pacientes) {
    await pool.query(`
      INSERT INTO pacientes (id, nome, telefone, email, idioma, medico_id, obs, visitas)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.nome, p.telefone, p.email, p.idioma, p.medicoId, p.obs, Math.floor(Math.random()*10)+1]
    );
  }

  // Agenda dos próximos 60 dias
  await gerarAgendaBD(medicos.map(m => m.id));

  // Marcações de hoje
  const marcacoes = [
    { id:"marc_001", medicoId:"med_fonseca", pacienteId:"pac_001", pacienteNome:"Maria Silva",   telefone:"+351912345678", hora:"09:00", servico:"Higiene oral",       status:"realizada", idioma:"pt", origem:"manual" },
    { id:"marc_002", medicoId:"med_fonseca", pacienteId:"pac_002", pacienteNome:"João Matos",    telefone:"+351963456789", hora:"09:30", servico:"Consulta rotina",     status:"realizada", idioma:"pt", origem:"ia" },
    { id:"marc_003", medicoId:"med_fonseca", pacienteId:"pac_010", pacienteNome:"Pedro Gomes",   telefone:"+351988776655", hora:"10:00", servico:"Ortodontia",          status:"em_curso",  idioma:"pt", origem:"ia" },
    { id:"marc_004", medicoId:"med_ramos",   pacienteId:"pac_003", pacienteNome:"Carlos Ramos",  telefone:"+351934567890", hora:"09:00", servico:"Implante — consulta", status:"realizada", idioma:"pt", origem:"manual" },
    { id:"marc_005", medicoId:"med_ramos",   pacienteId:"pac_004", pacienteNome:"Sarah Connor",  telefone:"+447700900000", hora:"10:00", servico:"Check-up",           status:"pendente",  idioma:"en", origem:"ia" },
    { id:"marc_006", medicoId:"med_costa",   pacienteId:"pac_005", pacienteNome:"Sophie Laurent",telefone:"+33612345678",  hora:"09:00", servico:"Branqueamento",      status:"realizada", idioma:"fr", origem:"ia" },
    { id:"marc_007", medicoId:"med_costa",   pacienteId:"pac_006", pacienteNome:"Ana Ferreira",  telefone:"+351965432100", hora:"10:30", servico:"Higiene oral",       status:"pendente",  idioma:"pt", origem:"manual" },
    { id:"marc_008", medicoId:"med_silva",   pacienteId:"pac_008", pacienteNome:"Rita Pinto",    telefone:"+351966778899", hora:"09:00", servico:"Selantes",           status:"realizada", idioma:"pt", origem:"manual" },
    { id:"marc_009", medicoId:"med_silva",   pacienteId:"pac_009", pacienteNome:"Marco Rossi",   telefone:"+393331234567", hora:"10:00", servico:"Consulta rotina",    status:"falta",     idioma:"it", origem:"ia" },
  ];

  for (const m of marcacoes) {
    await pool.query(`
      INSERT INTO marcacoes (id, medico_id, paciente_id, paciente_nome, telefone, data, hora, servico, status, idioma, origem)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.medicoId, m.pacienteId, m.pacienteNome, m.telefone, hoje, m.hora, m.servico, m.status, m.idioma, m.origem]
    );
    // Ocupar slot
    await pool.query(
      `UPDATE agenda SET estado='ocupado' WHERE medico_id=$1 AND data=$2 AND hora=$3`,
      [m.medicoId, hoje, m.hora]
    );
  }

  // Folga demo
  await pool.query(`
    INSERT INTO folgas (id, medico_id, inicio, fim, motivo, notas)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
    ["folga_001", "med_ramos", amanha, amanha, "Formação", "Congresso Lisboa"]
  );
  await pool.query(
    `UPDATE agenda SET estado='folga' WHERE medico_id='med_ramos' AND data=$1`,
    [amanha]
  );

  // Notificações demo
  await pool.query(`
    INSERT INTO notificacoes (id, tipo, urgencia, medico_nome, msg)
    VALUES
      ('notif_001','falta','alta','Dr. Rui Silva','Marco Rossi não compareceu à consulta das 10:00 com Dr. Silva.'),
      ('notif_002','ia','baixa','Vários','Sofia (IA) marcou 3 consultas via chamada nas últimas 2h.')
    ON CONFLICT (id) DO NOTHING`
  );

  console.log("✅ Seed PostgreSQL criado.");
}

async function gerarAgendaBD(medicoIds) {
  const valores = [];
  const hoje = new Date();
  for (let i = 0; i <= 60; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const data = d.toISOString().split("T")[0];
    for (const medicoId of medicoIds) {
      for (const hora of TODOS_SLOTS) {
        valores.push(`('${medicoId}','${data}','${hora}','livre')`);
      }
    }
  }
  if (valores.length) {
    // Inserir em lotes de 500
    for (let i = 0; i < valores.length; i += 500) {
      const lote = valores.slice(i, i + 500).join(",");
      await pool.query(
        `INSERT INTO agenda (medico_id, data, hora, estado) VALUES ${lote} ON CONFLICT DO NOTHING`
      );
    }
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await criarTabelas();
  const { rows } = await pool.query("SELECT COUNT(*) FROM medicos");
  if (parseInt(rows[0].count) === 0) {
    console.log("📦 DB vazio — a criar seed...");
    await seed();
  } else {
    // Garantir agenda para os próximos 60 dias
    const { rows: meds } = await pool.query("SELECT id FROM medicos WHERE ativo=true");
    await gerarAgendaBD(meds.map(m => m.id));
    console.log("✅ PostgreSQL carregado.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  API pública — db.*
// ─────────────────────────────────────────────────────────────────────────────
export const db = {

  // ── Médicos ──────────────────────────────────────────────────────────────
  async getMedicos() {
    const { rows } = await pool.query("SELECT * FROM medicos WHERE ativo=true ORDER BY criado_em");
    return rows.map(r => ({ ...r, id: r.id, nome: r.nome, especialidade: r.especialidade, email: r.email, iniciais: r.iniciais, cor: r.cor, horario: r.horario, ativo: r.ativo }));
  },

  async getMedico(id) {
    const { rows } = await pool.query("SELECT * FROM medicos WHERE id=$1", [id]);
    return rows[0] || null;
  },

  async getMedicoPorEmail(email) {
    const { rows } = await pool.query("SELECT * FROM medicos WHERE email=$1", [email?.toLowerCase()]);
    return rows[0] || null;
  },

  async criarMedico(dados) {
    const id = uid("med");
    const { rows } = await pool.query(`
      INSERT INTO medicos (id, nome, especialidade, email, senha_hash, iniciais, cor, horario, ativo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`,
      [id, dados.nome, dados.especialidade, dados.email?.toLowerCase(), dados.senhaHash, dados.iniciais, JSON.stringify(dados.cor), dados.horario]
    );
    await gerarAgendaBD([id]);
    return rows[0];
  },

  async atualizarMedico(id, dados) {
    const sets = [];
    const vals = [];
    let i = 1;
    if (dados.nome)       { sets.push(`nome=$${i++}`);        vals.push(dados.nome); }
    if (dados.especialidade) { sets.push(`especialidade=$${i++}`); vals.push(dados.especialidade); }
    if (dados.horario)    { sets.push(`horario=$${i++}`);     vals.push(dados.horario); }
    if (dados.ativo !== undefined) { sets.push(`ativo=$${i++}`); vals.push(dados.ativo); }
    if (dados.cor)        { sets.push(`cor=$${i++}`);         vals.push(JSON.stringify(dados.cor)); }
    if (dados.senhaHash)  { sets.push(`senha_hash=$${i++}`);  vals.push(dados.senhaHash); }
    if (!sets.length) return null;
    vals.push(id);
    const { rows } = await pool.query(`UPDATE medicos SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
    return rows[0] || null;
  },

  async getMedicosComStats(data) {
    const medicos = await db.getMedicos();
    return Promise.all(medicos.map(async m => {
      const { rows: ag } = await pool.query(
        "SELECT estado, COUNT(*) FROM agenda WHERE medico_id=$1 AND data=$2 GROUP BY estado",
        [m.id, data]
      );
      const livres   = parseInt(ag.find(r => r.estado === "livre")?.count || 0);
      const ocupados = parseInt(ag.find(r => r.estado === "ocupado")?.count || 0);
      const total    = livres + ocupados;
      const { rows: pacs } = await pool.query("SELECT COUNT(*) FROM pacientes WHERE medico_id=$1", [m.id]);
      return {
        ...m, senhaHash: undefined,
        stats: {
          consultasHoje: ocupados,
          slotsLivres: livres,
          pacientesTotal: parseInt(pacs[0].count),
          ocupacao: total > 0 ? Math.round((ocupados / total) * 100) : 0,
        },
      };
    }));
  },

  // ── Pacientes ─────────────────────────────────────────────────────────────
  async getPacientes(medicoId, pesquisa) {
    let q = "SELECT * FROM pacientes WHERE 1=1";
    const vals = [];
    if (medicoId) { q += ` AND medico_id=$${vals.length+1}`; vals.push(medicoId); }
    if (pesquisa) { q += ` AND (nome ILIKE $${vals.length+1} OR telefone ILIKE $${vals.length+1})`; vals.push(`%${pesquisa}%`); }
    q += " ORDER BY nome";
    const { rows } = await pool.query(q, vals);
    return rows;
  },

  async getPaciente(id) {
    const { rows } = await pool.query("SELECT * FROM pacientes WHERE id=$1", [id]);
    return rows[0] || null;
  },

  async getPacientePorTelefone(tel) {
    const { rows } = await pool.query("SELECT * FROM pacientes WHERE telefone=$1", [tel]);
    return rows[0] || null;
  },

  async getPacienteCompleto(medicoId, pacienteId) {
    const { rows } = await pool.query("SELECT * FROM pacientes WHERE id=$1 AND medico_id=$2", [pacienteId, medicoId]);
    if (!rows[0]) return null;
    const pac = rows[0];
    const { rows: hist } = await pool.query(
      "SELECT data, servico, status, notas FROM marcacoes WHERE paciente_id=$1 ORDER BY data DESC LIMIT 10", [pacienteId]
    );
    const { rows: calls } = await pool.query(
      `SELECT inicio, duracao, status FROM chamadas WHERE "from"=$1 ORDER BY inicio DESC LIMIT 5`, [pac.telefone]
    );
    return { ...pac, historico: hist, chamadas: calls };
  },

  async criarPaciente(dados) {
    const id = uid("pac");
    const { rows } = await pool.query(`
      INSERT INTO pacientes (id, nome, telefone, email, idioma, medico_id, data_nascimento, nif, subsistema, obs)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, dados.nome, dados.telefone, dados.email, dados.idioma||"pt", dados.medicoId, dados.dataNascimento, dados.nif, dados.subsistema, dados.obs]
    );
    return rows[0];
  },

  async atualizarPaciente(id, dados) {
    const sets = []; const vals = []; let i = 1;
    const campos = { nome:"nome", telefone:"telefone", email:"email", idioma:"idioma", obs:"obs", subsistema:"subsistema", nif:"nif" };
    for (const [k, col] of Object.entries(campos)) {
      if (dados[k] !== undefined) { sets.push(`${col}=$${i++}`); vals.push(dados[k]); }
    }
    if (!sets.length) return null;
    vals.push(id);
    const { rows } = await pool.query(`UPDATE pacientes SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
    return rows[0] || null;
  },

  // ── Agenda ────────────────────────────────────────────────────────────────
  async getAgendaMedico(medicoId, data) {
    const { rows } = await pool.query(
      "SELECT hora, estado FROM agenda WHERE medico_id=$1 AND data=$2 ORDER BY hora",
      [medicoId, data]
    );
    if (!rows.length) {
      await gerarAgendaBD([medicoId]);
      const { rows: r2 } = await pool.query(
        "SELECT hora, estado FROM agenda WHERE medico_id=$1 AND data=$2 ORDER BY hora",
        [medicoId, data]
      );
      return Object.fromEntries(r2.map(r => [r.hora, r.estado]));
    }
    return Object.fromEntries(rows.map(r => [r.hora, r.estado]));
  },

  async getAgendaEnriquecida(medicoId, data) {
    await gerarAgendaBD([medicoId]);
    const { rows: slots } = await pool.query(
      "SELECT hora, estado FROM agenda WHERE medico_id=$1 AND data=$2 ORDER BY hora",
      [medicoId, data]
    );
    const { rows: marcacoes } = await pool.query(
      "SELECT * FROM marcacoes WHERE medico_id=$1 AND data=$2 AND status != 'cancelada'",
      [medicoId, data]
    );
    return slots.map(s => {
      const marcacao = marcacoes.find(m => m.hora === s.hora) || null;
      return {
        hora: s.hora,
        estado: s.estado,
        marcacao: marcacao ? {
          id: marcacao.id, pacienteId: marcacao.paciente_id, pacienteNome: marcacao.paciente_nome,
          servico: marcacao.servico, status: marcacao.status, idioma: marcacao.idioma,
          notas: marcacao.notas, origem: marcacao.origem,
        } : null,
      };
    });
  },

  async getAgendaSemana(medicoId) {
    const result = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const data = d.toISOString().split("T")[0];
      const { rows } = await pool.query(
        "SELECT hora FROM agenda WHERE medico_id=$1 AND data=$2 AND estado='livre' ORDER BY hora",
        [medicoId, data]
      );
      if (rows.length) {
        result.push({ data, dataFormatada: dataFormatada(data), horasLivres: rows.map(r => r.hora) });
      }
      if (result.length >= 7) break;
    }
    return result;
  },

  async getVagasProximos7Dias(medicoId) {
    return db.getAgendaSemana(medicoId);
  },

  // ── Marcações ─────────────────────────────────────────────────────────────
  async getMarcacoes(data, limite) {
    let q = "SELECT * FROM marcacoes WHERE 1=1";
    const vals = [];
    if (data) { q += ` AND data=$${vals.length+1}`; vals.push(data); }
    q += " ORDER BY data DESC, hora DESC";
    if (limite) { q += ` LIMIT $${vals.length+1}`; vals.push(parseInt(limite)); }
    const { rows } = await pool.query(q, vals);
    return rows;
  },

  async getMarcacoesMedico(medicoId, data, limite) {
    let q = "SELECT * FROM marcacoes WHERE medico_id=$1";
    const vals = [medicoId];
    if (data) { q += ` AND data=$${vals.length+1}`; vals.push(data); }
    q += " ORDER BY data DESC, hora ASC";
    if (limite) { q += ` LIMIT $${vals.length+1}`; vals.push(parseInt(limite)); }
    const { rows } = await pool.query(q, vals);
    return rows.map(r => ({ ...r, pacienteId: r.paciente_id, pacienteNome: r.paciente_nome, medicoId: r.medico_id, smsEnviado: r.sms_enviado, minutosAtraso: r.minutos_atraso }));
  },

  async getMarcacao(id) {
    const { rows } = await pool.query("SELECT * FROM marcacoes WHERE id=$1", [id]);
    if (!rows[0]) return null;
    const r = rows[0];
    return { ...r, pacienteId: r.paciente_id, pacienteNome: r.paciente_nome, medicoId: r.medico_id, smsEnviado: r.sms_enviado };
  },

  async getMarcacoesParaSMS(diasAntes) {
    const alvo = new Date(); alvo.setDate(alvo.getDate() + diasAntes);
    const data = alvo.toISOString().split("T")[0];
    const tag = `${diasAntes}d`;
    const { rows } = await pool.query(
      "SELECT * FROM marcacoes WHERE data=$1 AND status='pendente' AND NOT ($2 = ANY(sms_enviado))",
      [data, tag]
    );
    return rows.map(r => ({ ...r, pacienteId: r.paciente_id, pacienteNome: r.paciente_nome, medicoId: r.medico_id }));
  },

  async criarMarcacao(dados) {
    const id = uid("marc");
    const { rows } = await pool.query(`
      INSERT INTO marcacoes (id, medico_id, paciente_id, paciente_nome, telefone, data, hora, servico, status, idioma, origem, notas, call_sid)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [id, dados.medicoId, dados.pacienteId||null, dados.pacienteNome, dados.telefone||null,
       dados.data, dados.hora, dados.servico||"Consulta rotina",
       dados.status||"pendente", dados.idioma||"pt", dados.origem||"manual", dados.notas||"", dados.callSid||null]
    );
    await pool.query(
      "UPDATE agenda SET estado='ocupado' WHERE medico_id=$1 AND data=$2 AND hora=$3",
      [dados.medicoId, dados.data, dados.hora]
    );
    if (dados.pacienteId) {
      await pool.query("UPDATE pacientes SET visitas=visitas+1 WHERE id=$1", [dados.pacienteId]);
    }
    const r = rows[0];
    return { ...r, pacienteId: r.paciente_id, pacienteNome: r.paciente_nome, medicoId: r.medico_id };
  },

  async atualizarMarcacao(id, dados) {
    const sets = []; const vals = []; let i = 1;
    if (dados.status)      { sets.push(`status=$${i++}`);       vals.push(dados.status); }
    if (dados.notas !== undefined) { sets.push(`notas=$${i++}`); vals.push(dados.notas); }
    if (dados.minutosAtraso) { sets.push(`minutos_atraso=$${i++}`); vals.push(dados.minutosAtraso); }
    if (!sets.length) return null;
    vals.push(id);
    const { rows } = await pool.query(`UPDATE marcacoes SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
    if (dados.status === "cancelada" && rows[0]) {
      await pool.query(
        "UPDATE agenda SET estado='livre' WHERE medico_id=$1 AND data=$2 AND hora=$3",
        [rows[0].medico_id, rows[0].data, rows[0].hora]
      );
    }
    const r = rows[0];
    return r ? { ...r, pacienteId: r.paciente_id, pacienteNome: r.paciente_nome, medicoId: r.medico_id } : null;
  },

  async marcarSMSEnviado(id, tag) {
    await pool.query(
      "UPDATE marcacoes SET sms_enviado=array_append(sms_enviado,$1) WHERE id=$2",
      [tag, id]
    );
  },

  // ── Folgas ────────────────────────────────────────────────────────────────
  async getFolgas(medicoId) {
    let q = "SELECT * FROM folgas WHERE 1=1";
    const vals = [];
    if (medicoId) { q += ` AND medico_id=$${vals.length+1}`; vals.push(medicoId); }
    q += " ORDER BY inicio DESC";
    const { rows } = await pool.query(q, vals);
    return rows.map(r => ({ ...r, medicoId: r.medico_id }));
  },

  async criarFolga(dados) {
    const id = uid("folga");
    const { rows } = await pool.query(`
      INSERT INTO folgas (id, medico_id, inicio, fim, motivo, notas, registada_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, dados.medicoId, dados.inicio, dados.fim||dados.inicio, dados.motivo, dados.notas||"", dados.registadaPor||"medico"]
    );
    // Bloquear agenda
    const ini = new Date(dados.inicio + "T00:00:00");
    const fim = new Date((dados.fim||dados.inicio) + "T00:00:00");
    for (let d = new Date(ini); d <= fim; d.setDate(d.getDate()+1)) {
      const data = d.toISOString().split("T")[0];
      await pool.query(
        "UPDATE agenda SET estado='folga' WHERE medico_id=$1 AND data=$2",
        [dados.medicoId, data]
      );
    }
    return { ...rows[0], medicoId: rows[0].medico_id };
  },

  async cancelarFolga(id) {
    const { rows } = await pool.query("SELECT * FROM folgas WHERE id=$1", [id]);
    if (!rows[0]) return false;
    const f = rows[0];
    await pool.query("DELETE FROM folgas WHERE id=$1", [id]);
    const ini = new Date(f.inicio + "T00:00:00");
    const fim = new Date((f.fim||f.inicio) + "T00:00:00");
    for (let d = new Date(ini); d <= fim; d.setDate(d.getDate()+1)) {
      const data = d.toISOString().split("T")[0];
      await pool.query("UPDATE agenda SET estado='livre' WHERE medico_id=$1 AND data=$2 AND estado='folga'", [f.medico_id, data]);
      const { rows: marcs } = await pool.query("SELECT hora FROM marcacoes WHERE medico_id=$1 AND data=$2 AND status!='cancelada'", [f.medico_id, data]);
      for (const m of marcs) {
        await pool.query("UPDATE agenda SET estado='ocupado' WHERE medico_id=$1 AND data=$2 AND hora=$3", [f.medico_id, data, m.hora]);
      }
    }
    return true;
  },

  // ── Notas ─────────────────────────────────────────────────────────────────
  async getNotaMedico(medicoId, data) {
    const { rows } = await pool.query("SELECT conteudo FROM notas WHERE medico_id=$1 AND data=$2", [medicoId, data]);
    return rows[0]?.conteudo || "";
  },

  async guardarNotaMedico(medicoId, data, conteudo) {
    await pool.query(
      "INSERT INTO notas (medico_id, data, conteudo) VALUES ($1,$2,$3) ON CONFLICT (medico_id, data) DO UPDATE SET conteudo=$3",
      [medicoId, data, conteudo]
    );
  },

  getNotasMedico(chave, campo) { return ""; },

  // ── Stats ─────────────────────────────────────────────────────────────────
  async getStats() {
    const hoje = new Date().toISOString().split("T")[0];
    const { rows: ch } = await pool.query("SELECT COUNT(*) FROM chamadas WHERE DATE(inicio)=CURRENT_DATE");
    const { rows: mi } = await pool.query("SELECT COUNT(*) FROM marcacoes WHERE data=$1 AND origem='ia'", [hoje]);
    const { rows: mt } = await pool.query("SELECT COUNT(*) FROM marcacoes WHERE data=$1", [hoje]);
    const { rows: med } = await pool.query("SELECT COUNT(*) FROM medicos WHERE ativo=true");
    const chamadasHoje = parseInt(ch[0].count);
    const marcacoesIA = parseInt(mi[0].count);
    const totalMarc   = parseInt(mt[0].count);
    return {
      chamadasHoje,
      marcacoesHoje: marcacoesIA,
      taxaConversao: chamadasHoje > 0 ? Math.min(Math.round((marcacoesIA/chamadasHoje)*100),100) : 0,
      medicosAtivos: parseInt(med[0].count),
    };
  },

  async getStatsMedico(medicoId) {
    const hoje = new Date().toISOString().split("T")[0];
    const { rows: ag } = await pool.query(
      "SELECT estado, COUNT(*) FROM agenda WHERE medico_id=$1 AND data=$2 GROUP BY estado", [medicoId, hoje]
    );
    const { rows: pacs } = await pool.query("SELECT COUNT(*) FROM pacientes WHERE medico_id=$1", [medicoId]);
    const { rows: ia }   = await pool.query("SELECT COUNT(*) FROM marcacoes WHERE medico_id=$1 AND origem='ia'", [medicoId]);
    const livres   = parseInt(ag.find(r=>r.estado==="livre")?.count||0);
    const ocupados = parseInt(ag.find(r=>r.estado==="ocupado")?.count||0);
    return {
      consultasHoje: ocupados,
      realizadas: 0,
      pendentes: ocupados,
      slotsLivres: livres,
      pacientesTotal: parseInt(pacs[0].count),
      marcacoesIA: parseInt(ia[0].count),
    };
  },

  // ── Notificações ──────────────────────────────────────────────────────────
  async getNotificacoes() {
    const { rows } = await pool.query(
      "SELECT * FROM notificacoes ORDER BY lida ASC, criado_em DESC LIMIT 100"
    );
    return rows.map(r => ({ ...r, medicoNome: r.medico_nome, paraMediacoId: r.para_medico_id }));
  },

  async criarNotificacao(dados) {
    const id = uid("notif");
    const { rows } = await pool.query(`
      INSERT INTO notificacoes (id, tipo, urgencia, medico_nome, para_medico_id, msg)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, dados.tipo, dados.urgencia||"baixa", dados.medicoNome||null, dados.paraMediacoId||null, dados.msg]
    );
    return rows[0];
  },

  async marcarNotificacaoLida(id) {
    const { rows } = await pool.query("UPDATE notificacoes SET lida=true WHERE id=$1 RETURNING *", [id]);
    return rows[0] || null;
  },

  async marcarTodasLidas() {
    await pool.query("UPDATE notificacoes SET lida=true");
  },

  // ── Chamadas ──────────────────────────────────────────────────────────────
  async getChamadas() {
    const { rows } = await pool.query("SELECT * FROM chamadas ORDER BY inicio DESC LIMIT 100");
    return rows;
  },

  async registarChamada(dados) {
    const id = uid("call");
    await pool.query(`
      INSERT INTO chamadas (id, call_sid, "from", tipo, status, inicio)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (call_sid) DO NOTHING`,
      [id, dados.callSid, dados.from, dados.tipo, "iniciada", dados.inicio]
    );
    return { id, ...dados };
  },

  async atualizarStatusChamada(callSid, status, duracao) {
    await pool.query(
      `UPDATE chamadas SET status=$1, duracao=$2, fim=NOW() WHERE call_sid=$3`,
      [status, duracao, callSid]
    );
  },

  encerrarChamada(callSid) { return db.atualizarStatusChamada(callSid, "concluida", 0); },

  // ── Sessões (memória) ─────────────────────────────────────────────────────
  getSessao(callSid)        { return sessoes[callSid] || null; },
  setSessao(callSid, dados) { sessoes[callSid] = dados; },
  limparSessao(callSid)     { delete sessoes[callSid]; },

  // ── Campanhas ─────────────────────────────────────────────────────────────
  async criarCampanha(dados) {
    const { rows } = await pool.query(`
      INSERT INTO campanhas (id, promocao, total, idioma, medico_id, tipo)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [dados.id, dados.promocao, dados.total, dados.idioma, dados.medicoId||null, dados.tipo]
    );
    return rows[0];
  },
};

await init();

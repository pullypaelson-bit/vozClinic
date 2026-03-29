/**
 * medicos.js — Router /api/medicos (versão async/await para PostgreSQL)
 */
import express from "express";
import bcrypt from "bcryptjs";
import { db } from "./database.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

const CORES_MAP = {
  blue:  { bg:"#E6F1FB", text:"#0C447C" },
  green: { bg:"#E1F5EE", text:"#085041" },
  amber: { bg:"#FAEEDA", text:"#633806" },
  pink:  { bg:"#FBEAF0", text:"#72243E" },
};

// ── GET /api/medicos ──────────────────────────────────────────────────────────
router.get("/", requireAuth(), async (req, res) => {
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const medicos = await db.getMedicosComStats(hoje);
    res.json(medicos.map(({ senha_hash, senhaHash, ...m }) => m));
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /api/medicos ─────────────────────────────────────────────────────────
router.post("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const { nome, especialidade, email, senha, iniciais, corNome, horario } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: "Nome, email e senha são obrigatórios." });
    if (senha.length < 8) return res.status(400).json({ erro: "Senha deve ter mínimo 8 caracteres." });
    const existe = await db.getMedicoPorEmail(email);
    if (existe) return res.status(409).json({ erro: "Email já registado." });
    const senhaHash = await bcrypt.hash(senha, 10);
    const cor = CORES_MAP[corNome] || CORES_MAP.blue;
    const m = await db.criarMedico({ nome, especialidade, email: email.toLowerCase(), senhaHash, iniciais: (iniciais||nome.slice(0,2)).toUpperCase(), cor, horario: horario || "Segunda a Sexta, 09:00–18:00" });
    const { senha_hash, ...mSemHash } = m;
    res.status(201).json(mSemHash);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /api/medicos/:id ──────────────────────────────────────────────────────
router.get("/:id", requireAuth(), async (req, res) => {
  try {
    const m = await db.getMedico(req.params.id);
    if (!m) return res.status(404).json({ erro: "Médico não encontrado." });
    const { senha_hash, ...mSemHash } = m;
    res.json(mSemHash);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── PATCH /api/medicos/:id ────────────────────────────────────────────────────
router.patch("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const { nome, especialidade, horario, ativo, corNome } = req.body;
    const dados = {};
    if (nome) dados.nome = nome;
    if (especialidade) dados.especialidade = especialidade;
    if (horario) dados.horario = horario;
    if (ativo !== undefined) dados.ativo = ativo;
    if (corNome && CORES_MAP[corNome]) dados.cor = CORES_MAP[corNome];
    const m = await db.atualizarMedico(req.params.id, dados);
    if (!m) return res.status(404).json({ erro: "Médico não encontrado." });
    const { senha_hash, ...mSemHash } = m;
    res.json(mSemHash);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /api/medicos/:id/agenda ───────────────────────────────────────────────
router.get("/:id/agenda", requireAuth(), async (req, res) => {
  try {
    const data = req.query.data || new Date().toISOString().split("T")[0];
    const slots = await db.getAgendaEnriquecida(req.params.id, data);
    res.json({ medicoId: req.params.id, data, slots });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /api/medicos/:id/agenda/semana ────────────────────────────────────────
router.get("/:id/agenda/semana", requireAuth(), async (req, res) => {
  try {
    res.json(await db.getAgendaSemana(req.params.id));
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /api/medicos/:id/marcacoes ────────────────────────────────────────────
router.get("/:id/marcacoes", requireAuth(), async (req, res) => {
  try {
    res.json(await db.getMarcacoesMedico(req.params.id, req.query.data, req.query.limite));
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /api/medicos/:id/marcacoes ───────────────────────────────────────────
router.post("/:id/marcacoes", requireAuth(), async (req, res) => {
  try {
    const { pacienteNome, telefone, data, hora, servico, idioma, notas, pacienteId } = req.body;
    if (!pacienteNome || !data || !hora) return res.status(400).json({ erro: "Nome, data e hora são obrigatórios." });
    const agenda = await db.getAgendaMedico(req.params.id, data);
    if (!agenda[hora] || agenda[hora] !== "livre") return res.status(409).json({ erro: "Slot não disponível." });
    const marc = await db.criarMarcacao({ medicoId: req.params.id, pacienteId: pacienteId||null, pacienteNome, telefone, data, hora, servico: servico||"Consulta rotina", idioma: idioma||"pt", notas: notas||"", origem: "manual" });
    res.status(201).json(marc);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── PATCH /api/medicos/:id/marcacoes/:mid ─────────────────────────────────────
router.patch("/:id/marcacoes/:mid", requireAuth(), async (req, res) => {
  try {
    const { status, notas, minutosAtraso } = req.body;
    const marc = await db.getMarcacao(req.params.mid);
    if (!marc || marc.medico_id !== req.params.id) return res.status(404).json({ erro: "Marcação não encontrada." });
    const dados = {};
    if (status) dados.status = status;
    if (notas !== undefined) dados.notas = notas;
    if (minutosAtraso) dados.minutosAtraso = minutosAtraso;
    const atualizada = await db.atualizarMarcacao(req.params.mid, dados);
    const medico = await db.getMedico(req.params.id);
    if (status) {
      const msgs = {
        falta:     { tipo:"falta",        urgencia:"alta",  msg:`${marc.paciente_nome} não compareceu à consulta das ${marc.hora} com ${medico?.nome}.` },
        atrasado:  { tipo:"atraso",       urgencia:"media", msg:`${marc.paciente_nome} chegou ${minutosAtraso||"?"} min atrasado com ${medico?.nome}.` },
        cancelada: { tipo:"cancelamento", urgencia:"media", msg:`${medico?.nome} cancelou consulta de ${marc.paciente_nome} às ${marc.hora}. Slot libertado.` },
        realizada: { tipo:"info",         urgencia:"baixa", msg:`Consulta de ${marc.paciente_nome} com ${medico?.nome} realizada com sucesso.` },
      };
      if (msgs[status]) await db.criarNotificacao({ ...msgs[status], medicoNome: medico?.nome });
    }
    res.json(atualizada);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── DELETE /api/medicos/:id/marcacoes/:mid ────────────────────────────────────
router.delete("/:id/marcacoes/:mid", requireAuth(), async (req, res) => {
  try {
    await db.atualizarMarcacao(req.params.mid, { status:"cancelada" });
    res.json({ mensagem: "Marcação cancelada e slot libertado." });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /api/medicos/:id/pacientes ────────────────────────────────────────────
router.get("/:id/pacientes", requireAuth(), async (req, res) => {
  try {
    res.json(await db.getPacientes(req.params.id, req.query.pesquisa));
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /api/medicos/:id/pacientes/:pid ───────────────────────────────────────
router.get("/:id/pacientes/:pid", requireAuth(), async (req, res) => {
  try {
    const pac = await db.getPacienteCompleto(req.params.id, req.params.pid);
    if (!pac) return res.status(404).json({ erro: "Paciente não encontrado." });
    res.json(pac);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /api/medicos/:id/pacientes ───────────────────────────────────────────
router.post("/:id/pacientes", requireAuth(), async (req, res) => {
  try {
    const { nome, telefone, email, dataNascimento, nif, subsistema, idioma, obs } = req.body;
    if (!nome) return res.status(400).json({ erro: "Nome é obrigatório." });
    const p = await db.criarPaciente({ nome, telefone, email, dataNascimento, nif, subsistema, idioma: idioma||"pt", obs, medicoId: req.params.id });
    res.status(201).json(p);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── PATCH /api/medicos/:id/pacientes/:pid ─────────────────────────────────────
router.patch("/:id/pacientes/:pid", requireAuth(), async (req, res) => {
  try {
    const atualizado = await db.atualizarPaciente(req.params.pid, req.body);
    res.json(atualizado);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /api/medicos/:id/stats ────────────────────────────────────────────────
router.get("/:id/stats", requireAuth(), async (req, res) => {
  try {
    res.json(await db.getStatsMedico(req.params.id));
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET/POST /api/medicos/:id/notas ──────────────────────────────────────────
router.get("/:id/notas", requireAuth(), async (req, res) => {
  try {
    const data = req.query.data || new Date().toISOString().split("T")[0];
    res.json(await db.getNotaMedico(req.params.id, data));
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post("/:id/notas", requireAuth(), async (req, res) => {
  try {
    const { data, conteudo } = req.body;
    if (!data) return res.status(400).json({ erro: "Data é obrigatória." });
    await db.guardarNotaMedico(req.params.id, data, conteudo||"");
    res.json({ mensagem: "Nota guardada." });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /api/medicos/:id/folgas ───────────────────────────────────────────────
router.get("/:id/folgas", requireAuth(), async (req, res) => {
  try {
    res.json(await db.getFolgas(req.params.id));
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /api/medicos/:id/folgas ──────────────────────────────────────────────
router.post("/:id/folgas", requireAuth(), async (req, res) => {
  try {
    const { inicio, fim, motivo, notas } = req.body;
    if (!inicio) return res.status(400).json({ erro: "Data de início é obrigatória." });
    const medico = await db.getMedico(req.params.id);
    if (!medico) return res.status(404).json({ erro: "Médico não encontrado." });
    const folga = await db.criarFolga({ medicoId: req.params.id, inicio, fim: fim||inicio, motivo, notas, registadaPor: req.user.role });
    const periodo = `${inicio}${fim&&fim!==inicio?" a "+fim:""}`;
    await db.criarNotificacao({
      tipo: "folga", urgencia: "media", medicoNome: medico.nome,
      msg: req.user.role === "admin"
        ? `Administração registou folga para ${medico.nome}: ${periodo} (${motivo||"sem motivo"}). Agenda bloqueada.`
        : `${medico.nome} registou folga: ${periodo} (${motivo||"sem motivo"}). Agenda bloqueada.`,
    });
    if (req.user.role === "admin") {
      await db.criarNotificacao({
        tipo: "info", urgencia: "media", medicoNome: medico.nome, paraMediacoId: medico.id,
        msg: `A administração registou uma folga para si: ${periodo} (${motivo||"sem motivo especificado"}). A sua agenda foi bloqueada nesses dias.`,
      });
    }
    res.status(201).json(folga);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── DELETE /api/medicos/:id/folgas/:fid ───────────────────────────────────────
router.delete("/:id/folgas/:fid", requireAuth(["admin"]), async (req, res) => {
  try {
    const ok = await db.cancelarFolga(req.params.fid);
    if (!ok) return res.status(404).json({ erro: "Folga não encontrada." });
    res.json({ mensagem: "Folga cancelada e agenda restaurada." });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

export default router;

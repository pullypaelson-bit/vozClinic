/**
 * medicos.js — Router /api/medicos
 * CRUD médicos, agenda, marcações, pacientes, notas, folgas, stats
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
router.get("/", requireAuth(), (req, res) => {
  const hoje = new Date().toISOString().split("T")[0];
  const medicos = db.getMedicosComStats(hoje);
  // Remove hash de senha antes de enviar
  res.json(medicos.map(({ senhaHash, ...m }) => m));
});

// ── POST /api/medicos ─────────────────────────────────────────────────────────
router.post("/", requireAuth(["admin"]), async (req, res) => {
  const { nome, especialidade, email, senha, iniciais, corNome, horario } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: "Nome, email e senha são obrigatórios." });
  if (senha.length < 8) return res.status(400).json({ erro: "Senha deve ter mínimo 8 caracteres." });
  if (db.getMedicoPorEmail(email)) return res.status(409).json({ erro: "Email já registado." });

  const senhaHash = await bcrypt.hash(senha, 10);
  const cor = CORES_MAP[corNome] || CORES_MAP.blue;
  const m = db.criarMedico({ nome, especialidade, email: email.toLowerCase(), senhaHash, iniciais: (iniciais||nome.slice(0,2)).toUpperCase(), cor, horario: horario || "Segunda a Sexta, 09:00–18:00", ativo:true });

  const { senhaHash: _, ...mSemHash } = m;
  res.status(201).json(mSemHash);
});

// ── GET /api/medicos/:id ──────────────────────────────────────────────────────
router.get("/:id", requireAuth(), (req, res) => {
  const m = db.getMedico(req.params.id);
  if (!m) return res.status(404).json({ erro: "Médico não encontrado." });
  const { senhaHash, ...mSemHash } = m;
  res.json(mSemHash);
});

// ── PATCH /api/medicos/:id ────────────────────────────────────────────────────
router.patch("/:id", requireAuth(["admin"]), async (req, res) => {
  const { nome, especialidade, horario, ativo, corNome } = req.body;
  const dados = {};
  if (nome) dados.nome = nome;
  if (especialidade) dados.especialidade = especialidade;
  if (horario) dados.horario = horario;
  if (ativo !== undefined) dados.ativo = ativo;
  if (corNome && CORES_MAP[corNome]) dados.cor = CORES_MAP[corNome];

  const m = db.atualizarMedico(req.params.id, dados);
  if (!m) return res.status(404).json({ erro: "Médico não encontrado." });
  const { senhaHash, ...mSemHash } = m;
  res.json(mSemHash);
});

// ─────────────────────────────────────────────────────────────────────────────
//  AGENDA
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/medicos/:id/agenda?data=YYYY-MM-DD ───────────────────────────────
router.get("/:id/agenda", requireAuth(), (req, res) => {
  const data = req.query.data || new Date().toISOString().split("T")[0];
  const m = db.getMedico(req.params.id);
  if (!m) return res.status(404).json({ erro: "Médico não encontrado." });
  const slots = db.getAgendaEnriquecida(req.params.id, data);
  res.json({ medicoId: req.params.id, data, slots });
});

// ── GET /api/medicos/:id/agenda/semana ────────────────────────────────────────
router.get("/:id/agenda/semana", requireAuth(), (req, res) => {
  const m = db.getMedico(req.params.id);
  if (!m) return res.status(404).json({ erro: "Médico não encontrado." });
  res.json(db.getAgendaSemana(req.params.id));
});

// ─────────────────────────────────────────────────────────────────────────────
//  MARCAÇÕES
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/medicos/:id/marcacoes ────────────────────────────────────────────
router.get("/:id/marcacoes", requireAuth(), (req, res) => {
  const { data, limite } = req.query;
  res.json(db.getMarcacoesMedico(req.params.id, data, limite));
});

// ── POST /api/medicos/:id/marcacoes ───────────────────────────────────────────
router.post("/:id/marcacoes", requireAuth(), (req, res) => {
  const { pacienteNome, telefone, data, hora, servico, idioma, notas, pacienteId } = req.body;
  if (!pacienteNome || !data || !hora) return res.status(400).json({ erro: "Nome, data e hora são obrigatórios." });

  // Verificar disponibilidade
  const agenda = db.getAgendaMedico(req.params.id, data);
  if (!agenda[hora] || agenda[hora] !== "livre") return res.status(409).json({ erro: "Slot não disponível." });

  const marc = db.criarMarcacao({
    medicoId: req.params.id, pacienteId: pacienteId || null, pacienteNome,
    telefone, data, hora, servico: servico || "Consulta rotina",
    idioma: idioma || "pt", notas: notas || "", origem: "manual",
  });
  res.status(201).json(marc);
});

// ── PATCH /api/medicos/:id/marcacoes/:mid ─────────────────────────────────────
router.patch("/:id/marcacoes/:mid", requireAuth(), (req, res) => {
  const { status, notas, minutosAtraso } = req.body;
  const marc = db.getMarcacao(req.params.mid);
  if (!marc || marc.medicoId !== req.params.id) return res.status(404).json({ erro: "Marcação não encontrada." });

  const dados = {};
  if (status) dados.status = status;
  if (notas !== undefined) dados.notas = notas;
  if (minutosAtraso) dados.minutosAtraso = minutosAtraso;

  const atualizada = db.atualizarMarcacao(req.params.mid, dados);
  const medico = db.getMedico(req.params.id);

  // Criar notificação automática
  if (status) {
    const msgs = {
      falta:     { tipo:"falta",       urgencia:"alta",  msg:`${marc.pacienteNome} não compareceu à consulta das ${marc.hora} com ${medico?.nome}.` },
      atrasado:  { tipo:"atraso",      urgencia:"media", msg:`${marc.pacienteNome} chegou ${minutosAtraso||"?"} min atrasado à consulta com ${medico?.nome}.` },
      cancelada: { tipo:"cancelamento",urgencia:"media", msg:`${medico?.nome} cancelou consulta de ${marc.pacienteNome} às ${marc.hora}. Slot libertado.` },
      realizada: { tipo:"info",        urgencia:"baixa", msg:`Consulta de ${marc.pacienteNome} com ${medico?.nome} realizada com sucesso.` },
    };
    if (msgs[status]) db.criarNotificacao({ ...msgs[status], medicoNome: medico?.nome });
  }

  res.json(atualizada);
});

// ── DELETE /api/medicos/:id/marcacoes/:mid ────────────────────────────────────
router.delete("/:id/marcacoes/:mid", requireAuth(), (req, res) => {
  const marc = db.getMarcacao(req.params.mid);
  if (!marc || marc.medicoId !== req.params.id) return res.status(404).json({ erro: "Marcação não encontrada." });
  db.atualizarMarcacao(req.params.mid, { status:"cancelada" });
  res.json({ mensagem: "Marcação cancelada e slot libertado." });
});

// ─────────────────────────────────────────────────────────────────────────────
//  PACIENTES
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/medicos/:id/pacientes ────────────────────────────────────────────
router.get("/:id/pacientes", requireAuth(), (req, res) => {
  res.json(db.getPacientes(req.params.id, req.query.pesquisa));
});

// ── GET /api/medicos/:id/pacientes/:pid ───────────────────────────────────────
router.get("/:id/pacientes/:pid", requireAuth(), (req, res) => {
  const pac = db.getPacienteCompleto(req.params.id, req.params.pid);
  if (!pac) return res.status(404).json({ erro: "Paciente não encontrado." });
  res.json(pac);
});

// ── POST /api/medicos/:id/pacientes ───────────────────────────────────────────
router.post("/:id/pacientes", requireAuth(), (req, res) => {
  const { nome, telefone, email, dataNascimento, nif, subsistema, idioma, obs } = req.body;
  if (!nome) return res.status(400).json({ erro: "Nome é obrigatório." });
  const p = db.criarPaciente({ nome, telefone, email, dataNascimento, nif, subsistema, idioma: idioma||"pt", obs, medicoId: req.params.id });
  res.status(201).json(p);
});

// ── PATCH /api/medicos/:id/pacientes/:pid ─────────────────────────────────────
router.patch("/:id/pacientes/:pid", requireAuth(), (req, res) => {
  const p = db.getPaciente(req.params.pid);
  if (!p || p.medicoId !== req.params.id) return res.status(404).json({ erro: "Paciente não encontrado." });
  const atualizado = db.atualizarPaciente(req.params.pid, req.body);
  res.json(atualizado);
});

// ─────────────────────────────────────────────────────────────────────────────
//  STATS
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/stats", requireAuth(), (req, res) => {
  const m = db.getMedico(req.params.id);
  if (!m) return res.status(404).json({ erro: "Médico não encontrado." });
  res.json(db.getStatsMedico(req.params.id, req.query.periodo));
});

// ─────────────────────────────────────────────────────────────────────────────
//  NOTAS CLÍNICAS
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/notas", requireAuth(), (req, res) => {
  const data = req.query.data || new Date().toISOString().split("T")[0];
  res.json(db.getNotaMedico(req.params.id, data));
});

router.post("/:id/notas", requireAuth(), (req, res) => {
  const { data, conteudo } = req.body;
  if (!data) return res.status(400).json({ erro: "Data é obrigatória." });
  db.guardarNotaMedico(req.params.id, data, conteudo || "");
  res.json({ mensagem: "Nota guardada." });
});

// ─────────────────────────────────────────────────────────────────────────────
//  FOLGAS
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/medicos/:id/folgas ───────────────────────────────────────────────
router.get("/:id/folgas", requireAuth(), (req, res) => {
  res.json(db.getFolgas(req.params.id));
});

// ── POST /api/medicos/:id/folgas ──────────────────────────────────────────────
router.post("/:id/folgas", requireAuth(), (req, res) => {
  const { inicio, fim, motivo, notas } = req.body;
  if (!inicio) return res.status(400).json({ erro: "Data de início é obrigatória." });

  const medico = db.getMedico(req.params.id);
  if (!medico) return res.status(404).json({ erro: "Médico não encontrado." });

  const folga = db.criarFolga({ medicoId: req.params.id, inicio, fim: fim||inicio, motivo, notas, registadaPor: req.user.role });

  const periodo = `${inicio}${fim&&fim!==inicio?" a "+fim:""}`;
  const motivoStr = motivo || "sem motivo especificado";

  // Notificação para admin (sempre)
  db.criarNotificacao({
    tipo: "folga",
    urgencia: "media",
    medicoNome: medico.nome,
    msg: req.user.role === "admin"
      ? `Administração registou folga para ${medico.nome}: ${periodo} (${motivoStr}). Agenda bloqueada.`
      : `${medico.nome} registou folga: ${periodo} (${motivoStr}). Agenda bloqueada.`,
  });

  // Se foi o admin a registar, cria notificação para o médico ver no seu painel
  if (req.user.role === "admin") {
    db.criarNotificacao({
      tipo: "info",
      urgencia: "media",
      medicoNome: medico.nome,
      paraMediacoId: medico.id,
      msg: `A administração registou uma folga para si: ${periodo} (${motivoStr}). A sua agenda foi bloqueada nesses dias.`,
    });
  }

  res.status(201).json(folga);
});

// ── DELETE /api/medicos/:id/folgas/:fid ───────────────────────────────────────
router.delete("/:id/folgas/:fid", requireAuth(["admin"]), (req, res) => {
  const ok = db.cancelarFolga(req.params.fid);
  if (!ok) return res.status(404).json({ erro: "Folga não encontrada." });
  res.json({ mensagem: "Folga cancelada e agenda restaurada." });
});

export default router;

/**
 * auth.js — Autenticação JWT para VozClinic
 * POST /api/auth/login
 * POST /api/auth/alterar-senha
 * Middleware requireAuth(roles[])
 */
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "./database.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "vozClinic_dev_secret_muda_em_producao";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@dentalstar.pt";
const ADMIN_SENHA = process.env.ADMIN_SENHA || "demo1234";

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, senha, role } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: "Email e senha são obrigatórios." });

  // Admin hardcoded
  if (email.toLowerCase() === ADMIN_EMAIL && role === "admin") {
    const ok = await bcrypt.compare(senha, await bcrypt.hash(ADMIN_SENHA, 10)).catch(() => false)
      || senha === ADMIN_SENHA;
    if (!ok) return res.status(401).json({ erro: "Credenciais inválidas." });

    const user = { id:"admin", nome:"Administração", role:"admin", iniciais:"AD", cor:{ bg:"var(--bg-secondary)", text:"var(--text-secondary)" }, especialidade:"DentalStar" };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn:"8h" });
    return res.json({ token, user });
  }

  // Médico
  const medico = db.getMedicoPorEmail(email);
  if (!medico || medico.ativo === false) return res.status(401).json({ erro: "Credenciais inválidas." });

  const senhaCorreta = await bcrypt.compare(senha, medico.senhaHash);
  if (!senhaCorreta) return res.status(401).json({ erro: "Credenciais inválidas." });

  const user = {
    id: medico.id,
    nome: medico.nome,
    role: "medico",
    iniciais: medico.iniciais,
    cor: medico.cor,
    especialidade: medico.especialidade,
  };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn:"8h" });
  res.json({ token, user });
});

// ── POST /api/auth/alterar-senha ─────────────────────────────────────────────
router.post("/alterar-senha", requireAuth(), async (req, res) => {
  const { senhaAtual, novaSenha } = req.body;
  if (!senhaAtual || !novaSenha) return res.status(400).json({ erro: "Campos em falta." });
  if (novaSenha.length < 8) return res.status(400).json({ erro: "Nova senha deve ter mínimo 8 caracteres." });

  const medico = db.getMedico(req.user.id);
  if (!medico) return res.status(403).json({ erro: "Admin não pode alterar senha por aqui." });

  const ok = await bcrypt.compare(senhaAtual, medico.senhaHash);
  if (!ok) return res.status(401).json({ erro: "Senha atual incorreta." });

  const novoHash = await bcrypt.hash(novaSenha, 10);
  db.atualizarMedico(medico.id, { senhaHash: novoHash });
  res.json({ mensagem: "Senha alterada com sucesso." });
});

// ── Middleware requireAuth ────────────────────────────────────────────────────
export function requireAuth(roles) {
  return (req, res, next) => {
    const header = req.headers["authorization"];
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ erro: "Token em falta." });

    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET);
      req.user = payload;

      // Admin tem acesso a tudo
      if (payload.role === "admin") return next();

      // Verificar roles permitidos
      if (roles && roles.length > 0) {
        if (!roles.includes(payload.role)) return res.status(403).json({ erro: "Sem permissão." });
      }

      // Médico só acede ao próprio ID em rotas /api/medicos/:id/*
      if (payload.role === "medico") {
        const medicoId = req.params.id;
        if (medicoId && medicoId !== payload.id) return res.status(403).json({ erro: "Sem permissão para este médico." });
      }

      next();
    } catch (e) {
      res.status(401).json({ erro: "Token inválido ou expirado." });
    }
  };
}

export default router;

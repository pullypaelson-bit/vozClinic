/**
 * auth.js — Autenticação JWT para VozClinic (PostgreSQL)
 */
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "./database.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "vozClinic_dev_secret";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@dentalstar.pt";
const ADMIN_SENHA = process.env.ADMIN_SENHA || "demo1234";

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, senha, role } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: "Email e senha são obrigatórios." });

    // Admin
    if (email.toLowerCase() === ADMIN_EMAIL && role === "admin") {
      if (senha !== ADMIN_SENHA) return res.status(401).json({ erro: "Credenciais inválidas." });
      const user = { id:"admin", nome:"Administração", role:"admin", iniciais:"AD", cor:{ bg:"#f5f5f3", text:"#6b6b67" }, especialidade:"DentalStar" };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn:"8h" });
      return res.json({ token, user });
    }

    // Médico
    const medico = await db.getMedicoPorEmail(email);
    if (!medico || medico.ativo === false) return res.status(401).json({ erro: "Credenciais inválidas." });

    // senha_hash é o nome da coluna no PostgreSQL
    const hash = medico.senha_hash || medico.senhaHash;
    if (!hash) return res.status(401).json({ erro: "Credenciais inválidas." });

    const ok = await bcrypt.compare(senha, hash);
    if (!ok) return res.status(401).json({ erro: "Credenciais inválidas." });

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
  } catch(e) {
    console.error("Login erro:", e.message);
    res.status(500).json({ erro: "Erro interno." });
  }
});

// ── POST /api/auth/alterar-senha ─────────────────────────────────────────────
router.post("/alterar-senha", requireAuth(), async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    if (!senhaAtual || !novaSenha) return res.status(400).json({ erro: "Campos em falta." });
    if (novaSenha.length < 8) return res.status(400).json({ erro: "Mínimo 8 caracteres." });
    const medico = await db.getMedico(req.user.id);
    if (!medico) return res.status(403).json({ erro: "Admin não pode alterar senha por aqui." });
    const hash = medico.senha_hash || medico.senhaHash;
    const ok = await bcrypt.compare(senhaAtual, hash);
    if (!ok) return res.status(401).json({ erro: "Senha atual incorreta." });
    const novoHash = await bcrypt.hash(novaSenha, 10);
    await db.atualizarMedico(medico.id, { senhaHash: novoHash });
    res.json({ mensagem: "Senha alterada com sucesso." });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── Middleware requireAuth ────────────────────────────────────────────────────
export function requireAuth(roles) {
  return (req, res, next) => {
    const header = req.headers["authorization"];
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ erro: "Token em falta." });
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET);
      req.user = payload;
      if (payload.role === "admin") return next();
      if (roles && roles.length > 0 && !roles.includes(payload.role)) {
        return res.status(403).json({ erro: "Sem permissão." });
      }
      if (payload.role === "medico") {
        const medicoId = req.params.id;
        if (medicoId && medicoId !== payload.id) {
          return res.status(403).json({ erro: "Sem permissão para este médico." });
        }
      }
      next();
    } catch(e) {
      res.status(401).json({ erro: "Token inválido ou expirado." });
    }
  };
}

export default router;

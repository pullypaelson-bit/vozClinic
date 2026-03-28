/**
 * notificacoes.js — Router /api/notificacoes
 * Sistema de alertas para admin
 */
import express from "express";
import { db } from "./database.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// ── GET /api/notificacoes ─────────────────────────────────────────────────────
router.get("/", requireAuth(), (req, res) => {
  res.json(db.getNotificacoes());
});

// ── PATCH /api/notificacoes/:id/lida ─────────────────────────────────────────
router.patch("/:id/lida", requireAuth(), (req, res) => {
  const n = db.marcarNotificacaoLida(req.params.id);
  if (!n) return res.status(404).json({ erro: "Notificação não encontrada." });
  res.json(n);
});

// ── POST /api/notificacoes/marcar-todas ───────────────────────────────────────
router.post("/marcar-todas", requireAuth(), (req, res) => {
  db.marcarTodasLidas();
  res.json({ mensagem: "Todas as notificações marcadas como lidas." });
});

export default router;

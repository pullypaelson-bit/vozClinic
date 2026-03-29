/**
 * notificacoes.js — Router /api/notificacoes (async PostgreSQL)
 */
import express from "express";
import { db } from "./database.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

router.get("/", requireAuth(), async (req, res) => {
  try { res.json(await db.getNotificacoes()); }
  catch(e) { res.status(500).json({ erro: e.message }); }
});

router.patch("/:id/lida", requireAuth(), async (req, res) => {
  try {
    const n = await db.marcarNotificacaoLida(req.params.id);
    if (!n) return res.status(404).json({ erro: "Não encontrada." });
    res.json(n);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post("/marcar-todas", requireAuth(), async (req, res) => {
  try {
    await db.marcarTodasLidas();
    res.json({ mensagem: "Todas marcadas como lidas." });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

export default router;

/**
 * server.js — VozClinic: servidor principal
 * Liga tudo: Express, Twilio webhooks, Anthropic IA, ElevenLabs TTS, routers
 */
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import twilio from "twilio";
import Anthropic from "@anthropic-ai/sdk";
import fetch from "node-fetch";

import authRouter, { requireAuth } from "./auth.js";
import medicosRouter from "./medicos.js";
import smsRouter, { enviarSMS, smsInboundHandler } from "./sms.js";
import notificacoesRouter from "./notificacoes.js";
import { iniciarScheduler } from "./scheduler.js";
import { db } from "./database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ── Servir áudio gerado ───────────────────────────────────────────────────────
const AUDIO_DIR = path.join(__dirname, "audio_cache");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);
app.use("/audio", express.static(AUDIO_DIR));

// ── Clientes externos ─────────────────────────────────────────────────────────
const twilioClient = () => twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CLINICA = {
  nome: process.env.CLINICA_NOME || "Clínica DentalStar",
  morada: process.env.CLINICA_MORADA || "Rua do Comércio, 42, Felgueiras",
  telefone: process.env.CLINICA_TELEFONE || "255000000",
  assistente: process.env.ASSISTENTE_NOME || "Sofia",
  numeroTwilio: process.env.TWILIO_PHONE_NUMBER,
  baseUrl: process.env.BASE_URL || `http://localhost:${PORT}`,
};

const VOZES = {
  pt: process.env.ELEVENLABS_VOICE_PT || "21m00Tcm4TlvDq8ikWAM",
  en: process.env.ELEVENLABS_VOICE_EN || "AZnzlk1XvdvUeBnXmlld",
  es: process.env.ELEVENLABS_VOICE_ES || "ErXwobaYiN019PkySvjV",
  fr: process.env.ELEVENLABS_VOICE_FR || "MF3mGyEYCl7XYWbV9V6O",
  it: process.env.ELEVENLABS_VOICE_IT || "bVMeCyTHy58xNoL34h3p",
};

const TWILIO_LANGS = { pt:"pt-PT", en:"en-GB", es:"es-ES", fr:"fr-FR", it:"it-IT" };

// ── System prompt multilingue ─────────────────────────────────────────────────
function buildSystemPrompt(idioma, ctx = {}) {
  const hoje = new Date().toLocaleDateString("pt-PT", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  const vagasStr = ctx.vagas?.length
    ? ctx.vagas.map(v => `${v.dataFormatada}: ${v.horasLivres.join(", ")}`).join(" | ")
    : "Sem vagas nos próximos 7 dias";
  const folgasStr = ctx.folgas?.length
    ? `Atenção: os seguintes médicos estão de folga próximamente: ${ctx.folgas.join("; ")}.`
    : "";

  const base = { nome: CLINICA.assistente, clinica: CLINICA.nome, hoje, vagas: vagasStr, medico: ctx.medicoNome || "", folgas: folgasStr, paciente: ctx.nomePaciente || "" };

  const prompts = {
    pt: `És a ${base.nome}, secretária virtual da ${base.clinica}.
Data de hoje: ${base.hoje}.
${base.folgas}
Serviços: Consulta rotina (30€), Higiene oral (45€, promoção 30€ esta semana), Branqueamento (180€, promoção 140€), Ortodontia, Implantologia, Pediatria.
Horário: Segunda a Sexta, 09:00–13:00 e 14:00–18:00.
Vagas disponíveis: ${base.vagas}.
Paciente: ${base.paciente || "desconhecido"}.
${base.medico ? `Médico solicitado: ${base.medico}.` : ""}
Regras: Fala de forma natural, calorosa e concisa. Máximo 2-3 frases por resposta.
Se o dia pedido não tiver vaga, propõe alternativas dos próximos dias. Negoceia até chegar a acordo.
Quando confirmares marcação: MARCACAO_CONFIRMADA:[YYYY-MM-DD]:[HH:MM]:[servico]:[medicoId]`,

    en: `You are ${base.nome}, virtual receptionist at ${base.clinica} dental clinic in Portugal.
Today: ${base.hoje}. ${base.folgas}
Services: Check-up (€30), Cleaning (€45, special €30 this week), Whitening (€180, special €140), Orthodontics, Implants.
Available slots: ${base.vagas}.
Patient: ${base.paciente || "unknown"}.
Be warm, professional and concise. Max 2-3 sentences per reply.
When confirming: MARCACAO_CONFIRMADA:[YYYY-MM-DD]:[HH:MM]:[service]:[doctorId]`,

    es: `Eres ${base.nome}, recepcionista virtual de ${base.clinica} en Portugal.
Hoy: ${base.hoje}. ${base.folgas}
Servicios: Consulta (€30), Limpieza (€45, especial €30 esta semana), Blanqueamiento (€180, especial €140).
Citas disponibles: ${base.vagas}.
Paciente: ${base.paciente || "desconocido"}.
Sé amable, profesional y concisa. Máximo 2-3 frases por respuesta.
Al confirmar: MARCACAO_CONFIRMADA:[YYYY-MM-DD]:[HH:MM]:[servicio]:[medicoId]`,

    fr: `Tu es ${base.nome}, réceptionniste virtuelle de ${base.clinica} au Portugal.
Aujourd'hui: ${base.hoje}. ${base.folgas}
Services: Consultation (€30), Détartrage (€45, offre €30 cette semaine), Blanchiment (€180, offre €140).
Créneaux disponibles: ${base.vagas}.
Patient: ${base.paciente || "inconnu"}.
Sois chaleureuse et professionnelle. Maximum 2-3 phrases par réponse.
Pour confirmer: MARCACAO_CONFIRMADA:[YYYY-MM-DD]:[HH:MM]:[service]:[medicoId]`,
  };
  return prompts[idioma] || prompts.pt;
}

// ── Deteção de idioma ─────────────────────────────────────────────────────────
function detectarIdioma(texto) {
  const lower = texto.toLowerCase();
  const kw = {
    pt:["olá","bom dia","boa tarde","boa noite","queria","gostaria","marcar","consulta","obrigad","quero"],
    en:["hello","hi","good morning","good afternoon","appointment","booking","please","thank","i want","i'd like"],
    es:["hola","buenos","quisiera","cita","reservar","gracias","quiero","por favor"],
    fr:["bonjour","bonsoir","voudrais","rendez","merci","je veux","s'il vous"],
    it:["ciao","buongiorno","buonasera","vorrei","appuntamento","grazie","per favore"],
  };
  for (const [lang, words] of Object.entries(kw)) {
    if (words.some(w => lower.includes(w))) return lang;
  }
  return "pt";
}

// ── Síntese de voz (ElevenLabs) ───────────────────────────────────────────────
async function textToSpeech(texto, idioma = "pt") {
  const voiceId = VOZES[idioma] || VOZES.pt;
  const filename = `${Date.now()}_${idioma}.mp3`;
  const filepath = path.join(AUDIO_DIR, filename);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text:texto, model_id:"eleven_multilingual_v2", voice_settings:{ stability:0.5, similarity_boost:0.75, style:0.2 } }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
  const buf = await res.buffer();
  fs.writeFileSync(filepath, buf);
  setTimeout(() => { try { fs.unlinkSync(filepath); } catch {} }, 600_000);
  return `${CLINICA.baseUrl}/audio/${filename}`;
}

// ── Resposta da IA ────────────────────────────────────────────────────────────
async function gerarResposta(callSid, textoUtente, idioma) {
  const sessao = db.getSessao(callSid) || { historico:[], idioma, contexto:{} };
  const medicoId = sessao.contexto.medicoId || null;

  // Obtém vagas e folgas
  let vagas;
  if (medicoId) {
    vagas = db.getVagasProximos7Dias(medicoId);
  } else {
    const medicosAtivos = db.getMedicos();
    vagas = medicosAtivos.flatMap(m => db.getVagasProximos7Dias(m.id).slice(0,2));
  }
  const folgasInfo = db.getFolgas().filter(f => {
    const m = db.getMedico(f.medicoId);
    return m && f.inicio >= new Date().toISOString().split("T")[0];
  }).map(f => `${db.getMedico(f.medicoId)?.nome} (${f.inicio}${f.fim!==f.inicio?" a "+f.fim:""})`);

  sessao.historico.push({ role:"user", content:textoUtente });

  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: buildSystemPrompt(idioma, { vagas, folgas:folgasInfo, nomePaciente:sessao.contexto.nome, medicoNome:medicoId?db.getMedico(medicoId)?.nome:null }),
    messages: sessao.historico,
  });

  const texto = resp.content[0].text;
  sessao.historico.push({ role:"assistant", content:texto });
  db.setSessao(callSid, sessao);

  // Detetar marcação confirmada
  const match = texto.match(/MARCACAO_CONFIRMADA:([^:]+):([^:]+):([^:]+):([^\s]+)/);
  if (match) {
    const [, data, hora, servico, mId] = match;
    let medicoEscolhido = mId || medicoId;
    if (!medicoEscolhido) {
      const comVaga = db.getMedicos().find(m => db.getAgendaMedico(m.id, data)[hora] === "livre");
      medicoEscolhido = comVaga?.id;
    }
    if (medicoEscolhido) {
      const marc = db.criarMarcacao({ medicoId:medicoEscolhido, callSid, data, hora, servico, pacienteNome:sessao.contexto.nome||"Paciente", telefone:sessao.contexto.telefone, idioma, origem:"ia" });
      const medico = db.getMedico(medicoEscolhido);
      db.criarNotificacao({ tipo:"ia", urgencia:"baixa", medicoNome:medico?.nome, msg:`IA marcou: ${sessao.contexto.nome||"Paciente"} — ${data} às ${hora} (${servico}) com ${medico?.nome||"médico"}.` });
      console.log(`✅ Marcação IA: ${medicoEscolhido} | ${data} ${hora} | ${servico}`);
    }
  }

  // Extrair nome do paciente
  const nomeMatch = textoUtente.match(/(?:chamo|sou|nome[- ]é|me llamo|je m'appelle|my name is)\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌÒÙÇ][a-záéíóúâêîôûãõàèìòùç]+)/i);
  if (nomeMatch && !sessao.contexto.nome) { sessao.contexto.nome = nomeMatch[1]; db.setSessao(callSid, sessao); }

  return texto.replace(/MARCACAO_CONFIRMADA:[^\s]+/g, "").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  WEBHOOKS TWILIO — CHAMADAS
// ─────────────────────────────────────────────────────────────────────────────

app.post("/webhook/incoming-call", async (req, res) => {
  const { CallSid, From } = req.body;
  const twiml = new twilio.twiml.VoiceResponse();
  db.registarChamada({ callSid:CallSid, from:From, tipo:"inbound", inicio:new Date().toISOString() });
  console.log(`📞 Chamada inbound: ${From}`);

  const saudacao = "Boa tarde! Clínica DentalStar, fala a Sofia. Em que posso ajudar?";
  try {
    const url = await textToSpeech(saudacao, "pt");
    twiml.play(url);
  } catch {
    twiml.say({ language:"pt-PT", voice:"Polly.Ines-Neural" }, saudacao);
  }
  twiml.redirect("/webhook/gather");
  res.type("text/xml").send(twiml.toString());
});

app.post("/webhook/gather", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const sessao = db.getSessao(req.body.CallSid) || {};
  const lang = TWILIO_LANGS[sessao.idioma||"pt"] || "pt-PT";

  const gather = twiml.gather({ input:"speech", language:lang, speechTimeout:"auto", action:"/webhook/process-speech", timeout:5 });
  gather.say({ language:lang }, ".");
  twiml.redirect("/webhook/gather");
  res.type("text/xml").send(twiml.toString());
});

app.post("/webhook/process-speech", async (req, res) => {
  const { CallSid, SpeechResult, Confidence } = req.body;
  const twiml = new twilio.twiml.VoiceResponse();
  const texto = SpeechResult || "";
  const conf = parseFloat(Confidence || "0");

  console.log(`🗣️  [${CallSid}] "${texto}" (${Math.round(conf*100)}%)`);

  if (!texto || conf < 0.35) {
    twiml.say({ language:"pt-PT" }, "Não percebi bem. Pode repetir?");
    twiml.redirect("/webhook/gather");
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    const idioma = detectarIdioma(texto);
    const sessao = db.getSessao(CallSid) || {};
    if (idioma !== sessao.idioma) db.setSessao(CallSid, { ...sessao, idioma });

    const resposta = await gerarResposta(CallSid, texto, idioma);
    const lang = TWILIO_LANGS[idioma] || "pt-PT";

    try {
      const url = await textToSpeech(resposta, idioma);
      twiml.play(url);
    } catch {
      twiml.say({ language:lang }, resposta);
    }

    const despedidas = ["obrigado tchau","adeus","até logo","goodbye","bye","adios","au revoir","arrivederci"];
    if (despedidas.some(d => texto.toLowerCase().includes(d))) {
      db.encerrarChamada(CallSid); db.limparSessao(CallSid);
      twiml.hangup();
    } else {
      twiml.redirect("/webhook/gather");
    }
  } catch (e) {
    console.error("Erro gerarResposta:", e.message);
    twiml.say({ language:"pt-PT" }, "Ocorreu um erro. Por favor ligue de novo.");
    twiml.hangup();
  }
  res.type("text/xml").send(twiml.toString());
});

app.post("/webhook/call-status", (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  db.atualizarStatusChamada(CallSid, CallStatus, parseInt(CallDuration||"0"));
  console.log(`📊 [${CallSid}] ${CallStatus} — ${CallDuration}s`);
  res.sendStatus(200);
});

// ── Chamada outbound ──────────────────────────────────────────────────────────
app.post("/webhook/outbound-call", async (req, res) => {
  const { CallSid } = req.body;
  const { campanhaId, nome, promocao, idioma="pt", medicoId } = req.query;
  const twiml = new twilio.twiml.VoiceResponse();

  db.setSessao(CallSid, { idioma, contexto:{ nome, campanhaId, promocao, medicoId, tipo:"outbound" }, historico:[] });

  const guioes = {
    pt: `Olá ${nome||""}! Fala a Sofia da ${CLINICA.nome}. Ligo porque temos uma promoção especial em ${promocao}. Tem um momento?`,
    en: `Hello ${nome||""}! This is Sofia from ${CLINICA.nome}. I'm calling about a special offer on ${promocao}. Do you have a moment?`,
    es: `¡Hola ${nome||""}! Soy Sofia de ${CLINICA.nome}. Le llamo por una oferta especial en ${promocao}. ¿Tiene un momento?`,
    fr: `Bonjour ${nome||""} ! Je suis Sofia de ${CLINICA.nome}. Je vous appelle pour une offre spéciale: ${promocao}. Avez-vous un moment ?`,
  };
  const texto = guioes[idioma] || guioes.pt;

  try {
    twiml.play(await textToSpeech(texto, idioma));
  } catch {
    twiml.say({ language:TWILIO_LANGS[idioma]||"pt-PT" }, texto);
  }
  twiml.redirect("/webhook/gather");
  res.type("text/xml").send(twiml.toString());
});

// ── SMS inbound ───────────────────────────────────────────────────────────────
app.post("/webhook/sms-inbound", smsInboundHandler);

// ─────────────────────────────────────────────────────────────────────────────
//  API REST
// ─────────────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/medicos", medicosRouter);
app.use("/api/sms", smsRouter);
app.use("/api/notificacoes", notificacoesRouter);

app.get("/api/stats", requireAuth(), (req, res) => res.json(db.getStats()));
app.get("/api/chamadas", requireAuth(), (req, res) => res.json(db.getChamadas()));
app.get("/api/marcacoes", requireAuth(["admin"]), (req, res) => res.json(db.getMarcacoes(req.query.data)));

// Campanha outbound
app.post("/api/campanha/iniciar", requireAuth(["admin"]), async (req, res) => {
  const { contactos, promocao, idioma="pt", medicoId, tipo="chamada" } = req.body;
  if (!Array.isArray(contactos)||!contactos.length) return res.status(400).json({ erro:"Lista de contactos inválida" });
  if (!promocao) return res.status(400).json({ erro:"promocao é obrigatório" });

  const campanhaId = `camp_${Date.now()}`;
  db.criarCampanha({ id:campanhaId, promocao, total:contactos.length, idioma, medicoId, tipo });

  for (let i = 0; i < contactos.length; i++) {
    const c = contactos[i];
    setTimeout(async () => {
      try {
        if (tipo === "sms" || tipo === "ambos") {
          const pac = { nome:c.nome||"Cliente", idioma };
          await enviarSMS(c.telefone, `${CLINICA.nome}: Olá ${c.nome||""}! Temos uma promoção especial em ${promocao}. Para marcar consulta, responda MARCAR ou ligue ${CLINICA.telefone}.`);
        }
        if (tipo === "chamada" || tipo === "ambos") {
          if (!process.env.TWILIO_ACCOUNT_SID) { console.log(`📤 [DEMO] Chamada outbound para ${c.telefone}`); return; }
          await twilioClient().calls.create({
            to: c.telefone, from: CLINICA.numeroTwilio,
            url: `${CLINICA.baseUrl}/webhook/outbound-call?campanhaId=${campanhaId}&nome=${encodeURIComponent(c.nome||"")}&promocao=${encodeURIComponent(promocao)}&idioma=${idioma}&medicoId=${medicoId||""}`,
            statusCallback: `${CLINICA.baseUrl}/webhook/call-status`, statusCallbackMethod:"POST",
          });
        }
      } catch (e) { console.error(`❌ Campanha ${c.telefone}:`, e.message); }
    }, i * 30_000);
  }
  res.json({ campanhaId, mensagem:`${contactos.length} contactos agendados (${tipo})` });
});

// ── Frontend estático ─────────────────────────────────────────────────────────
const FRONTEND = __dirname;
app.use(express.static(FRONTEND));
app.get("/medico", (req, res) => res.sendFile(path.join(FRONTEND, "medico.html")));
app.get("/login", (req, res) => res.sendFile(path.join(FRONTEND, "login.html")));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")||req.path.startsWith("/webhook")) return res.status(404).json({ erro:"Não encontrado" });
  res.sendFile(path.join(FRONTEND, "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  iniciarScheduler();
  console.log(`
╔══════════════════════════════════════════════════╗
║  VozClinic — Secretária Virtual IA               ║
║  http://localhost:${PORT}                           ║
║                                                  ║
║  Login admin: admin@dentalstar.pt / demo1234     ║
║  Login médico: fonseca@dentalstar.pt / demo1234  ║
╚══════════════════════════════════════════════════╝
  `);
});

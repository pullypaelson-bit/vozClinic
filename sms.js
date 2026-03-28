/**
 * sms.js — SMS automáticos + resposta bidirecional (Twilio)
 * Webhook de resposta: POST /webhook/sms-inbound
 */
import express from "express";
import twilio from "twilio";
import { db } from "./database.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

function twilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// ── Enviar SMS ────────────────────────────────────────────────────────────────
export async function enviarSMS(para, mensagem) {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.log(`📱 [SMS DEMO] Para: ${para}\n${mensagem}\n`);
    return { sid: `demo_${Date.now()}` };
  }
  const msg = await twilioClient().messages.create({ to:para, from:process.env.TWILIO_PHONE_NUMBER, body:mensagem });
  return msg;
}

// ── Templates de SMS por idioma ───────────────────────────────────────────────
function templateLembrete7dias(pac, marc, medico, idioma) {
  const dia = new Date(marc.data + "T00:00:00").toLocaleDateString("pt-PT", { weekday:"long", day:"numeric", month:"long" });
  const templates = {
    pt: `DentalStar: Olá ${pac.nome.split(" ")[0]}! Consulta de ${marc.servico} marcada para ${dia} às ${marc.hora} com ${medico?.nome||"o médico"}.\nConfirma? Responda:\nSIM — confirmar\nNÃO — cancelar\nREMARCAR — mudar data`,
    en: `DentalStar: Hello ${pac.nome.split(" ")[0]}! Your ${marc.servico} appointment is on ${dia} at ${marc.hora} with ${medico?.nome||"the doctor"}.\nReply: YES to confirm, NO to cancel, RESCHEDULE to change.`,
    es: `DentalStar: Hola ${pac.nome.split(" ")[0]}! Su cita de ${marc.servico} es el ${dia} a las ${marc.hora} con ${medico?.nome||"el médico"}.\nResponda: SI confirmar, NO cancelar, REMARCAR cambiar.`,
    fr: `DentalStar: Bonjour ${pac.nome.split(" ")[0]}! Votre rendez-vous de ${marc.servico} est le ${dia} à ${marc.hora} avec ${medico?.nome||"le médecin"}.\nRépondez: OUI confirmer, NON annuler, REMARQUER changer.`,
  };
  return templates[idioma] || templates.pt;
}

function templateLembrete4dias(pac, marc, medico, idioma) {
  const dia = new Date(marc.data + "T00:00:00").toLocaleDateString("pt-PT", { day:"numeric", month:"long" });
  const templates = {
    pt: `DentalStar: Olá ${pac.nome.split(" ")[0]}! A sua consulta é daqui a 4 dias — ${dia} às ${marc.hora} com ${medico?.nome||"o médico"}.\nConfirma presença? SIM / NÃO / REMARCAR`,
    en: `DentalStar: Hello ${pac.nome.split(" ")[0]}! Your appointment is in 4 days — ${dia} at ${marc.hora}.\nReply YES, NO or RESCHEDULE.`,
    es: `DentalStar: Hola ${pac.nome.split(" ")[0]}! Su cita es en 4 días — ${dia} a las ${marc.hora}.\nResponda SI, NO o REMARCAR.`,
    fr: `DentalStar: Bonjour ${pac.nome.split(" ")[0]}! Votre rendez-vous est dans 4 jours — ${dia} à ${marc.hora}.\nRépondez OUI, NON ou REMARQUER.`,
  };
  return templates[idioma] || templates.pt;
}

function templateConfirmacao(pac, marc, idioma) {
  const templates = {
    pt: `DentalStar: Consulta confirmada! ${new Date(marc.data+"T00:00:00").toLocaleDateString("pt-PT",{weekday:"short",day:"numeric",month:"short"})} às ${marc.hora}. Até lá! 😊`,
    en: `DentalStar: Appointment confirmed! ${new Date(marc.data+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})} at ${marc.hora}. See you then! 😊`,
    es: `DentalStar: ¡Cita confirmada! ${new Date(marc.data+"T00:00:00").toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"})} a las ${marc.hora}. ¡Hasta entonces! 😊`,
    fr: `DentalStar: Rendez-vous confirmé! Le ${new Date(marc.data+"T00:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})} à ${marc.hora}. À bientôt! 😊`,
  };
  return templates[idioma] || templates.pt;
}

function templateCancelamento(pac, idioma) {
  const templates = {
    pt: `DentalStar: Consulta cancelada. Se quiser marcar novamente, ligue-nos ou responda NOVA MARCACAO. Obrigado!`,
    en: `DentalStar: Your appointment has been cancelled. To rebook, call us or reply NEW BOOKING. Thank you!`,
    es: `DentalStar: Su cita ha sido cancelada. Para volver a reservar, llámenos o responda NUEVA CITA.`,
    fr: `DentalStar: Votre rendez-vous a été annulé. Pour reprendre rendez-vous, appelez-nous. Merci!`,
  };
  return templates[idioma] || templates.pt;
}

function templateOpcoes(vagas, idioma) {
  const lista = vagas.slice(0,3).map((v,i) => `${i+1}. ${v.dataFormatada} às ${v.horasLivres[0]}`).join("\n");
  const templates = {
    pt: `DentalStar: Próximas vagas disponíveis:\n${lista}\nResponda com 1, 2 ou 3 para escolher.`,
    en: `DentalStar: Available slots:\n${lista}\nReply 1, 2 or 3 to choose.`,
    es: `DentalStar: Próximas citas disponibles:\n${lista}\nResponda 1, 2 o 3 para elegir.`,
    fr: `DentalStar: Prochains créneaux disponibles:\n${lista}\nRépondez 1, 2 ou 3 pour choisir.`,
  };
  return templates[idioma] || templates.pt;
}

// ── Envio agendado (chamado pelo scheduler) ───────────────────────────────────
export async function enviarLembretes(diasAntes) {
  const tag = `${diasAntes}d`;
  const marcacoes = db.getMarcacoesParaSMS(diasAntes);
  console.log(`📅 SMS ${diasAntes}d: ${marcacoes.length} marcações a notificar`);

  for (const marc of marcacoes) {
    const pac = db.getPaciente(marc.pacienteId) || db.getPacientePorTelefone(marc.telefone);
    const medico = db.getMedico(marc.medicoId);
    if (!pac?.telefone) continue;

    const idioma = pac.idioma || marc.idioma || "pt";
    const texto = diasAntes === 7
      ? templateLembrete7dias(pac, marc, medico, idioma)
      : templateLembrete4dias(pac, marc, medico, idioma);

    try {
      await enviarSMS(pac.telefone, texto);
      db.marcarSMSEnviado(marc.id, tag);
      console.log(`✅ SMS ${tag} enviado: ${pac.nome} (${pac.telefone})`);
    } catch (e) {
      console.error(`❌ SMS falhou para ${pac.telefone}:`, e.message);
    }
  }
}

// ── WEBHOOK: SMS inbound (resposta do paciente) ───────────────────────────────
export function smsInboundHandler(req, res) {
  const from = req.body.From;
  const body = (req.body.Body || "").trim().toUpperCase();

  // Encontra marcação futura deste número
  const pac = db.getPacientePorTelefone(from);
  const todasMarcacoes = db.getMarcacoes();
  const hoje = new Date().toISOString().split("T")[0];
  const marcacao = todasMarcacoes.find(m => m.telefone === from && m.data >= hoje && m.status === "pendente");

  const twiml = new twilio.twiml.MessagingResponse();

  if (!marcacao) {
    twiml.message(pac ? `DentalStar: Olá ${pac.nome.split(" ")[0]}! Não encontrámos nenhuma consulta pendente. Ligue-nos para marcar: ${process.env.CLINICA_TELEFONE||"255000000"}.` : "DentalStar: Não encontrámos nenhuma consulta associada a este número. Ligue-nos para ajuda.");
    return res.type("text/xml").send(twiml.toString());
  }

  const idioma = pac?.idioma || marcacao.idioma || "pt";
  const sim = ["SIM","YES","OUI","SI","1","S"];
  const nao = ["NÃO","NAO","NO","NON","N"];
  const remarcar = ["REMARCAR","RESCHEDULE","REMARQUER","MUDAR","CHANGE","R"];
  const cancelar = ["CANCELAR","CANCEL","ANNULER","C"];

  if (sim.some(w => body.includes(w))) {
    db.atualizarMarcacao(marcacao.id, { status:"confirmada" });
    const medico = db.getMedico(marcacao.medicoId);
    db.criarNotificacao({ tipo:"confirmacao", urgencia:"baixa", medicoNome:medico?.nome, msg:`${marcacao.pacienteNome} confirmou a consulta de ${marcacao.data} às ${marcacao.hora} via SMS.` });
    twiml.message(templateConfirmacao(pac||{nome:marcacao.pacienteNome}, marcacao, idioma));

  } else if (nao.some(w => body.includes(w)) || cancelar.some(w => body.includes(w))) {
    db.atualizarMarcacao(marcacao.id, { status:"cancelada" });
    const medico = db.getMedico(marcacao.medicoId);
    db.criarNotificacao({ tipo:"cancelamento", urgencia:"media", medicoNome:medico?.nome, msg:`${marcacao.pacienteNome} cancelou a consulta de ${marcacao.data} às ${marcacao.hora} via SMS.` });
    twiml.message(templateCancelamento(pac||{nome:marcacao.pacienteNome}, idioma));

  } else if (remarcar.some(w => body.includes(w))) {
    const vagas = db.getVagasProximos7Dias(marcacao.medicoId);
    if (!vagas.length) {
      twiml.message("DentalStar: Sem vagas disponíveis nos próximos dias. Por favor ligue-nos.");
    } else {
      // Guarda vagas na sessão SMS (usamos notas temporárias)
      db.guardarNotaMedico(`sms_${from}`, "vagas", JSON.stringify(vagas.slice(0,3)));
      db.guardarNotaMedico(`sms_${from}`, "marcacaoId", marcacao.id);
      twiml.message(templateOpcoes(vagas, idioma));
    }

  } else if (["1","2","3"].includes(body)) {
    // Paciente escolheu opção de remarcação
    const vagasStr = db.getNotasMedico(`sms_${from}`, "vagas");
    const marcacaoId = db.getNotasMedico(`sms_${from}`, "marcacaoId");
    try {
      const vagas = JSON.parse(vagasStr);
      const escolha = parseInt(body) - 1;
      const vaga = vagas[escolha];
      const marcOriginal = db.getMarcacao(marcacaoId || marcacao.id);

      if (vaga && marcOriginal) {
        db.atualizarMarcacao(marcOriginal.id, { status:"cancelada" }); // liberta slot original
        const nova = db.criarMarcacao({ ...marcOriginal, id:undefined, data:vaga.data, hora:vaga.horasLivres[0], status:"confirmada", origem:"sms_remarcacao", criadoEm:undefined, smsEnviado:[] });
        const medico = db.getMedico(marcOriginal.medicoId);
        db.criarNotificacao({ tipo:"remarcacao", urgencia:"baixa", medicoNome:medico?.nome, msg:`${marcOriginal.pacienteNome} remarcou via SMS: ${marcOriginal.data} ${marcOriginal.hora} → ${vaga.data} ${vaga.horasLivres[0]}.` });
        const novaFormatada = new Date(vaga.data+"T00:00:00").toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long"});
        const msg = { pt:`DentalStar: Remarcação confirmada! Nova consulta: ${novaFormatada} às ${vaga.horasLivres[0]}. Até lá!`, en:`DentalStar: Rescheduled! New appointment: ${novaFormatada} at ${vaga.horasLivres[0]}.`, fr:`DentalStar: Rendez-vous déplacé! Nouveau: ${novaFormatada} à ${vaga.horasLivres[0]}.`, es:`DentalStar: ¡Reprogramado! Nueva cita: ${novaFormatada} a las ${vaga.horasLivres[0]}.` };
        twiml.message(msg[idioma]||msg.pt);
      } else {
        twiml.message("DentalStar: Opção inválida. Por favor responda 1, 2 ou 3.");
      }
    } catch { twiml.message("DentalStar: Erro ao processar. Por favor ligue-nos."); }

  } else {
    const msg = { pt:"DentalStar: Não entendemos a sua resposta. Por favor responda SIM, NÃO ou REMARCAR.", en:"DentalStar: We didn't understand. Please reply YES, NO or RESCHEDULE.", fr:"DentalStar: Nous n'avons pas compris. Répondez OUI, NON ou REMARQUER.", es:"DentalStar: No entendimos. Responda SI, NO o REMARCAR." };
    twiml.message(msg[idioma]||msg.pt);
  }

  res.type("text/xml").send(twiml.toString());
}

// ── GET /api/sms/log ──────────────────────────────────────────────────────────
router.get("/log", requireAuth(), (req, res) => {
  const hoje = new Date().toISOString().split("T")[0];
  const marcacoes = db.getMarcacoes(null, 500);
  const log = marcacoes
    .filter(m => (m.smsEnviado||[]).length > 0)
    .map(m => ({ paciente:m.pacienteNome, telefone:m.telefone, data:m.data, hora:m.hora, smsEnviado:m.smsEnviado, status:m.status }));
  res.json(log);
});

// ── PATCH /api/sms/config ─────────────────────────────────────────────────────
let smsConfig = { dias1: 7, dias2: 4, ativo: true };
router.get("/config", requireAuth(["admin"]), (req, res) => res.json(smsConfig));
router.patch("/config", requireAuth(["admin"]), (req, res) => {
  smsConfig = { ...smsConfig, ...req.body };
  res.json(smsConfig);
});

export default router;

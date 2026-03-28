/**
 * scheduler.js — Cron jobs: lembretes SMS automáticos
 * Corre às 09:00 todos os dias úteis
 */
import cron from "node-cron";
import { enviarLembretes } from "./sms.js";

export function iniciarScheduler() {
  // Todos os dias às 09:00 (Segunda a Sexta)
  cron.schedule("0 9 * * 1-5", async () => {
    console.log("⏰ Scheduler: a enviar lembretes SMS...");
    try {
      await enviarLembretes(7); // SMS 7 dias antes
      await enviarLembretes(4); // SMS 4 dias antes
      console.log("✅ Lembretes SMS enviados com sucesso.");
    } catch (e) {
      console.error("❌ Erro no scheduler:", e.message);
    }
  }, { timezone: "Europe/Lisbon" });

  // SMS de follow-up: segunda às 10:00 para não-respondidos
  cron.schedule("0 10 * * 1-5", async () => {
    console.log("⏰ Scheduler: a verificar sem resposta...");
    // A implementar: enviar follow-up para marcações com smsEnviado mas status ainda "pendente"
  }, { timezone: "Europe/Lisbon" });

  console.log("✅ Scheduler iniciado (lembretes SMS às 09:00, dias úteis, Lisboa)");
}

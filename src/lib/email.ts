import nodemailer from "nodemailer";

function sanitizeEnvValue(value: string | undefined) {
  const sanitized = value
    ?.replace(/\\r\\n|\\n|\\r/g, "")
    .replace(/[\r\n]/g, "")
    .trim();

  if (!sanitized) {
    return sanitized;
  }

  return sanitized.replace(/^["']|["']$/g, "");
}

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export function getSmtpConfig(): SmtpConfig | null {
  const user = sanitizeEnvValue(process.env.SMTP_USER);
  const pass = sanitizeEnvValue(process.env.SMTP_PASS);

  if (!user || !pass) {
    return null;
  }

  const host = sanitizeEnvValue(process.env.SMTP_HOST) || "smtp.gmail.com";
  const port = Number(sanitizeEnvValue(process.env.SMTP_PORT) || "465");
  const from = sanitizeEnvValue(process.env.SMTP_FROM) || user;

  return {
    host,
    port,
    secure: port === 465,
    user,
    pass,
    from,
  };
}

export function isEmailConfigured() {
  return getSmtpConfig() !== null;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail(input: SendEmailInput) {
  const config = getSmtpConfig();

  if (!config) {
    return {
      delivered: false,
      message:
        "Servidor de e-mail (SMTP) não configurado. Defina SMTP_USER e SMTP_PASS.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  try {
    await transporter.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    return { delivered: true, message: "Aviso enviado à contraparte." };
  } catch (error) {
    return {
      delivered: false,
      message:
        error instanceof Error
          ? `Falha no envio de e-mail: ${error.message}`
          : "Falha no envio de e-mail.",
    };
  }
}

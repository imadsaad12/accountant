import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendInvoiceEmail(
  to: string,
  invoiceNumber: string,
  pdfBuffer: Buffer,
  language: string = "en"
) {
  const subjects: Record<string, string> = {
    en: `Invoice ${invoiceNumber}`,
    fr: `Facture ${invoiceNumber}`,
    ar: `فاتورة ${invoiceNumber}`,
  };

  const bodies: Record<string, string> = {
    en: `Dear Customer,\n\nPlease find attached invoice ${invoiceNumber}.\n\nThank you for your business.\n\nBest regards,\nCashent Team`,
    fr: `Cher client,\n\nVeuillez trouver ci-joint la facture ${invoiceNumber}.\n\nMerci pour votre confiance.\n\nCordialement,\nL'équipe Cashent`,
    ar: `عزيزي العميل،\n\nيرجى الاطلاع على الفاتورة المرفقة ${invoiceNumber}.\n\nشكراً لتعاملكم معنا.\n\nمع أطيب التحيات،\nفريق Cashent`,
  };

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: subjects[language] || subjects.en,
    text: bodies[language] || bodies.en,
    attachments: [
      {
        filename: `${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendPasswordResetEmail(to: string, code: string, name: string) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to,
    subject: "Password Reset Code - Cashent",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #1a1a2e; margin: 0;">Cashent</h1>
        </div>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 32px; text-align: center;">
          <p style="color: #374151; font-size: 16px; margin: 0 0 8px;">Hi ${name},</p>
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">Use the code below to reset your password. It expires in 15 minutes.</p>
          <div style="background: #1a1a2e; border-radius: 8px; padding: 16px 24px; display: inline-block; letter-spacing: 8px; font-size: 32px; font-weight: 700; color: #ffffff; font-family: monospace;">
            ${code}
          </div>
          <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  });
}

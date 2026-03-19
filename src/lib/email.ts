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
    en: `Dear Customer,\n\nPlease find attached invoice ${invoiceNumber}.\n\nThank you for your business.\n\nBest regards,\nAccountant Team`,
    fr: `Cher client,\n\nVeuillez trouver ci-joint la facture ${invoiceNumber}.\n\nMerci pour votre confiance.\n\nCordialement,\nL'équipe Accountant`,
    ar: `عزيزي العميل،\n\nيرجى الاطلاع على الفاتورة المرفقة ${invoiceNumber}.\n\nشكراً لتعاملكم معنا.\n\nمع أطيب التحيات،\nفريق Accountant`,
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

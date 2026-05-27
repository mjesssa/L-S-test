import { Resend } from "resend";

let cached: Resend | null = null;

function getResend(): Resend {
  if (!cached) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    cached = new Resend(process.env.RESEND_API_KEY);
  }
  return cached;
}

interface SendProposalEmailOptions {
  to: string;
  clientName: string;
  total: number;
  paymentLink: string;
  pdf: Buffer;
  proposalId: string;
}

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export async function sendProposalEmail({
  to,
  clientName,
  total,
  paymentLink,
  pdf,
  proposalId,
}: SendProposalEmailOptions): Promise<{ id: string }> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  const firstName = clientName.split(/\s+/)[0] || clientName;

  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; color: #0f172a; line-height: 1.5; max-width: 560px;">
      <p>${escapeHtml(firstName)},</p>
      <p>Your proposal is attached. Total: <strong>${money(total)}</strong>.</p>
      <p>50% deposit reserves your start date. You can pay it here:</p>
      <p>
        <a href="${paymentLink}" style="display: inline-block; background: #0f172a; color: white; padding: 12px 18px; border-radius: 6px; text-decoration: none;">
          Pay deposit
        </a>
      </p>
      <p>Reply with any questions. No pressure either way.</p>
      <p>— Greenscape Pro</p>
      <p style="font-size: 12px; color: #64748b; margin-top: 24px;">
        Proposal #${proposalId.slice(0, 8).toUpperCase()}
      </p>
    </div>
  `;

  const text = [
    `${firstName},`,
    "",
    `Your proposal is attached. Total: ${money(total)}.`,
    "",
    `50% deposit reserves your start date. Pay it here:`,
    paymentLink,
    "",
    `Reply with any questions. No pressure either way.`,
    "",
    `— Greenscape Pro`,
    `Proposal #${proposalId.slice(0, 8).toUpperCase()}`,
  ].join("\n");

  const res = await resend.emails.send({
    from,
    to,
    subject: "Your proposal",
    html,
    text,
    attachments: [
      {
        filename: `greenscape-proposal-${proposalId.slice(0, 8)}.pdf`,
        content: pdf,
      },
    ],
  });

  if (res.error) {
    throw new Error(res.error.message);
  }
  if (!res.data?.id) {
    throw new Error("Resend returned no email id");
  }
  return { id: res.data.id };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

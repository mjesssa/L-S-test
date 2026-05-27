import Stripe from "stripe";

let cached: Stripe | null = null;

function getStripe(): Stripe {
  if (!cached) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    cached = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return cached;
}

interface CreateDepositLinkOptions {
  proposalId: string;
  clientName: string;
  totalUsd: number; // proposal total
}

// Creates a one-shot Payment Link for a 50% deposit on the proposal.
// Creates the Product + Price inline so we don't have to manage them
// separately in Stripe.
export async function createDepositPaymentLink({
  proposalId,
  clientName,
  totalUsd,
}: CreateDepositLinkOptions): Promise<string> {
  const stripe = getStripe();
  const depositCents = Math.round(totalUsd * 0.5 * 100);
  if (depositCents < 50) {
    throw new Error("Deposit must be at least $0.50");
  }

  const product = await stripe.products.create({
    name: `Deposit — ${clientName}`,
    description: `50% deposit for Greenscape Pro proposal ${proposalId.slice(0, 8).toUpperCase()}`,
    metadata: { proposal_id: proposalId },
  });

  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: depositCents,
    product: product.id,
  });

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { proposal_id: proposalId },
  });

  return link.url;
}

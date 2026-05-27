/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

export interface PdfLineItem {
  scope_description: string;
  matched_name: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
}

export interface PdfProposalData {
  client_name: string;
  client_address: string | null;
  proposal_id: string;
  created_at: string;
  line_items: PdfLineItem[];
  subtotal: number;
  tax: number;
  total: number;
}

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#0f172a",
    lineHeight: 1.4,
  },
  header: {
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
  },
  brand: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },
  brandTagline: {
    fontSize: 9,
    color: "#475569",
    marginTop: 2,
  },
  proposalNumber: {
    fontSize: 9,
    color: "#475569",
    marginTop: 12,
  },
  h1: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subhead: {
    fontSize: 10,
    color: "#475569",
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
    color: "#334155",
  },
  table: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 6,
  },
  rowHead: {
    flexDirection: "row",
    paddingVertical: 6,
    backgroundColor: "#f1f5f9",
  },
  colItem: { width: "50%", paddingHorizontal: 4 },
  colQty: { width: "12%", paddingHorizontal: 4, textAlign: "right" },
  colUnit: { width: "10%", paddingHorizontal: 4 },
  colPrice: { width: "14%", paddingHorizontal: 4, textAlign: "right" },
  colTotal: { width: "14%", paddingHorizontal: 4, textAlign: "right" },
  totalsBox: {
    marginTop: 16,
    marginLeft: "auto",
    width: 220,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalLabel: { color: "#475569" },
  grandTotal: {
    borderTopWidth: 1,
    borderTopColor: "#0f172a",
    marginTop: 4,
    paddingTop: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
  },
  paragraph: { marginBottom: 6, color: "#1f2937" },
  bold: { fontFamily: "Helvetica-Bold" },
  footer: {
    marginTop: 40,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    fontSize: 9,
    color: "#64748b",
  },
});

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export function ProposalPdf({ data }: { data: PdfProposalData }) {
  const dateStr = new Date(data.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Document
      title={`Proposal — ${data.client_name}`}
      author="Greenscape Pro"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>GREENSCAPE PRO</Text>
          <Text style={styles.brandTagline}>
            Premium outdoor design-build · Phoenix, AZ
          </Text>
          <Text style={styles.proposalNumber}>
            Proposal #{data.proposal_id.slice(0, 8).toUpperCase()} · {dateStr}
          </Text>
        </View>

        <Text style={styles.h1}>Proposal for {data.client_name}</Text>
        {data.client_address ? (
          <Text style={styles.subhead}>{data.client_address}</Text>
        ) : null}

        <Text style={styles.sectionTitle}>Scope of work</Text>
        <View style={styles.table}>
          <View style={styles.rowHead}>
            <Text style={[styles.colItem, styles.bold]}>Item</Text>
            <Text style={[styles.colQty, styles.bold]}>Qty</Text>
            <Text style={[styles.colUnit, styles.bold]}>Unit</Text>
            <Text style={[styles.colPrice, styles.bold]}>Unit price</Text>
            <Text style={[styles.colTotal, styles.bold]}>Total</Text>
          </View>
          {data.line_items.map((l, idx) => (
            <View style={styles.row} key={idx}>
              <Text style={styles.colItem}>
                {l.matched_name ?? l.scope_description}
              </Text>
              <Text style={styles.colQty}>
                {Number(l.quantity).toLocaleString("en-US")}
              </Text>
              <Text style={styles.colUnit}>{l.unit ?? ""}</Text>
              <Text style={styles.colPrice}>{money(l.unit_price)}</Text>
              <Text style={styles.colTotal}>{money(l.line_total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text>{money(data.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text>{money(data.tax)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text>Total</Text>
            <Text>{money(data.total)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Payment terms</Text>
        <Text style={styles.paragraph}>
          50% deposit due to schedule. Remaining 50% on completion.
        </Text>

        <Text style={styles.sectionTitle}>Timeline</Text>
        <Text style={styles.paragraph}>
          Typical builds of this scope run 2 to 6 weeks once crew is scheduled.
          We schedule the crew once the deposit clears and HOA / permit
          approvals are in hand.
        </Text>

        <View style={styles.footer}>
          <Text>
            Greenscape Pro · quotes@greenscapepro.com · Phoenix, AZ. Pricing
            valid for 30 days from issue date.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

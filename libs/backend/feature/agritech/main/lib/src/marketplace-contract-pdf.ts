// @requirements REQ-AGRITECH-STAGE2-017
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
// Keep this runtime asset package visible to Nx's generated deployment manifest.
// The font paths themselves must still be resolved without loading WOFF files as modules.
import type {} from '@fontsource/noto-sans';
import PDFDocument from 'pdfkit';
import {
  marketplaceMockContractWatermark,
  type MarketplaceContractArtifactSnapshot,
} from '@app/backend-feature-agritech-shared';

const runtimeRequire = createRequire(__filename);
const fonts = {
  cyrillic: runtimeRequire.resolve('@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff'),
  cyrillicExt: runtimeRequire.resolve('@fontsource/noto-sans/files/noto-sans-cyrillic-ext-400-normal.woff'),
  latin: runtimeRequire.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'),
  latinExt: runtimeRequire.resolve('@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff'),
} as const;

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 46;
const contentTop = 142;
const contentBottom = 58;
const availableHeight = pageHeight - contentTop - contentBottom;

type LineKind = 'body' | 'heading' | 'spacer' | 'title';

interface DocumentLine {
  height: number;
  kind: LineKind;
  text: string;
}

function money(value: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)} UZS`;
}

function wrapText(value: string, width = 96): string[] {
  const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return [''];
  }
  const output: string[] = [];
  let current = '';
  for (const word of normalized.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if ([...candidate].length <= width) {
      current = candidate;
      continue;
    }
    if (current) {
      output.push(current);
    }
    const characters = [...word];
    while (characters.length > width) {
      output.push(characters.splice(0, width).join(''));
    }
    current = characters.join('');
  }
  if (current) {
    output.push(current);
  }
  return output;
}

function paymentTerms(snapshot: MarketplaceContractArtifactSnapshot): string[] {
  return snapshot.settlementKind === 'direct_payment'
    ? [
        'Payment terms: direct payment tracking. The buyer records payment confirmation; the seller separately confirms receipt.',
        'Mock bank events never move money and are not proof of payment. Parties must reconcile any unknown provider outcome.',
      ]
    : [
        'Payment terms: factoring tracking requires both party consents, provider decision, seller payout, buyer repayment, and close.',
        'Mock factoring approval is simulated, moves no money, creates no debt, and has no bank or legal effect.',
      ];
}

function sourceRows(snapshot: MarketplaceContractArtifactSnapshot, snapshotFingerprint: string): string[] {
  const deliveryPrice =
    snapshot.delivery.priceUzs === undefined ? 'not separately priced' : money(snapshot.delivery.priceUzs);
  const deliveryDays = snapshot.delivery.days === undefined ? 'not specified' : `${snapshot.delivery.days} day(s)`;
  return [
    'SALE AND PURCHASE AGREEMENT / OLDI-SOTDI SHARTNOMASI / ДОГОВОР КУПЛИ-ПРОДАЖИ',
    '',
    'FROZEN CONTRACT SNAPSHOT',
    `Contract ID: ${snapshot.contractId}`,
    `Template: ${snapshot.templateVersion}; snapshot revision: ${snapshot.snapshotRevision}`,
    `Contract created at (UTC): ${snapshot.contractCreatedAt}`,
    `Subject: ${snapshot.subject}`,
    `Total payable amount: ${money(snapshot.amountUzs)}`,
    '',
    'PARTIES',
    `Buyer: ${snapshot.buyer.legalName}; region: ${snapshot.buyer.region}`,
    `Seller: ${snapshot.seller.legalName}; region: ${snapshot.seller.region}`,
    '',
    'FROZEN LINES',
    ...snapshot.lines.flatMap((line, index) => [
      `${index + 1}. ${line.name} — ${line.quantity} ${line.unit} x ${money(line.unitPriceUzs)} = ${money(line.lineTotalUzs)}`,
      `   Source kind: ${line.sourceKind}; public listing reference: ${line.sourcePublicationId}; source revision: ${line.sourceRevision}`,
    ]),
    '',
    'DELIVERY AND PAYMENT',
    `Delivery terms: ${snapshot.delivery.terms}; delivery price: ${deliveryPrice}; delivery period: ${deliveryDays}.`,
    `Delivery note: ${snapshot.delivery.note ?? 'none'}`,
    ...paymentTerms(snapshot),
    '',
    'MOCK LEGAL, PENALTY, AND DISPUTE NOTICE',
    'This generated artifact is a non-production workflow record only. It is not legal advice, a qualified signature, an invoice, or proof of funds.',
    'No contractual penalty, late fee, interest, or damages are created by this mock. Any real penalties require separately approved legal terms.',
    'A delivery, quality, or quantity dispute must be opened through the authenticated DehqonHub dispute workflow and decided by an authorized moderator with retained evidence.',
    'The immutable timeline and provider provenance are audit evidence only; they do not replace applicable law or a live provider receipt.',
    '',
    'SIGNATURE SLOTS',
    'Buyer qualified-signature record: ____________________  UTC: ____________________',
    'Seller qualified-signature record: ___________________  UTC: ____________________',
    'Each slot is valid in this workflow only when its persisted provider record binds this exact snapshot revision and artifact checksum.',
    '',
    'INTEGRITY',
    `Frozen snapshot SHA-256: ${snapshotFingerprint}`,
    `Permanent mock watermark: ${marketplaceMockContractWatermark}`,
  ];
}

const headingNames = new Set([
  'DELIVERY AND PAYMENT',
  'FROZEN CONTRACT SNAPSHOT',
  'FROZEN LINES',
  'INTEGRITY',
  'MOCK LEGAL, PENALTY, AND DISPUTE NOTICE',
  'PARTIES',
  'SIGNATURE SLOTS',
]);

function documentLines(snapshot: MarketplaceContractArtifactSnapshot, snapshotFingerprint: string): DocumentLine[] {
  return sourceRows(snapshot, snapshotFingerprint).flatMap((row, sourceIndex) => {
    const kind = lineKind(row, sourceIndex);
    const height = lineHeight(kind);
    return wrapText(row, kind === 'title' ? 78 : 96).map((text) => ({ height, kind, text }));
  });
}

function lineKind(row: string, sourceIndex: number): LineKind {
  if (sourceIndex === 0) {
    return 'title';
  }
  if (!row) {
    return 'spacer';
  }
  return headingNames.has(row) ? 'heading' : 'body';
}

function lineHeight(kind: LineKind): number {
  if (kind === 'spacer') {
    return 6;
  }
  if (kind === 'title') {
    return 20;
  }
  return kind === 'heading' ? 17 : 13;
}

function lineSize(kind: LineKind): number {
  if (kind === 'title') {
    return 12;
  }
  return kind === 'heading' ? 10 : 8.3;
}

function paginate(lines: DocumentLine[]): DocumentLine[][] {
  const totalHeight = lines.reduce((sum, line) => sum + line.height, 0);
  const pageCount = Math.max(1, Math.ceil(totalHeight / availableHeight));
  const balancedTarget = totalHeight / pageCount;
  const pages: DocumentLine[][] = [];
  let page: DocumentLine[] = [];
  let height = 0;
  for (const line of lines) {
    if (page.length > 0 && pages.length < pageCount - 1 && height + line.height > balancedTarget) {
      pages.push(page);
      page = [];
      height = 0;
    }
    page.push(line);
    height += line.height;
  }
  pages.push(page);
  return pages;
}

function fontFor(character: string): keyof typeof fonts {
  const codePoint = character.codePointAt(0) ?? 0;
  if ((codePoint >= 0x0460 && codePoint <= 0x052f) || (codePoint >= 0xa640 && codePoint <= 0xa69f)) {
    return 'cyrillicExt';
  }
  if (codePoint >= 0x0400 && codePoint <= 0x045f) {
    return 'cyrillic';
  }
  if ((codePoint >= 0x0100 && codePoint <= 0x02ff) || (codePoint >= 0x1e00 && codePoint <= 0x1eff)) {
    return 'latinExt';
  }
  return 'latin';
}

function textRuns(value: string): Array<{ font: keyof typeof fonts; text: string }> {
  const runs: Array<{ font: keyof typeof fonts; text: string }> = [];
  for (const character of value.normalize('NFC')) {
    const font = fontFor(character);
    const previous = runs.at(-1);
    if (previous?.font === font) {
      previous.text += character;
    } else {
      runs.push({ font, text: character });
    }
  }
  return runs;
}

function drawMixedLine(
  document: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  let cursor = x;
  for (const run of textRuns(value)) {
    document.font(run.font).fontSize(size).fillColor(color);
    document.text(run.text, cursor, y, { lineBreak: false });
    cursor += document.widthOfString(run.text);
  }
}

function addPageChrome(
  document: PDFKit.PDFDocument,
  snapshot: MarketplaceContractArtifactSnapshot,
  pageNumber: number,
  pageCount: number,
): void {
  document.save();
  document.rect(0, 0, pageWidth, pageHeight).fill('#fbf5df');
  document.roundedRect(32, 120, pageWidth - 64, pageHeight - 176, 8).fill('#ffffff');
  document.rect(0, 0, pageWidth, 104).fill('#128044');
  document.restore();
  drawMixedLine(document, 'DEHQONHUB — CONTRACT ARTIFACT', margin, 31, 15, '#ffffff');
  drawMixedLine(document, marketplaceMockContractWatermark, margin, 63, 8.5, '#ffffff');
  drawMixedLine(
    document,
    `Contract ${snapshot.contractId} | ${snapshot.templateVersion} r${snapshot.snapshotRevision} | page ${pageNumber}/${pageCount} | MOCK`,
    margin,
    pageHeight - 38,
    7,
    '#356044',
  );
}

function renderDocument(
  document: PDFKit.PDFDocument,
  snapshot: MarketplaceContractArtifactSnapshot,
  pages: DocumentLine[][],
): void {
  pages.forEach((lines, pageIndex) => {
    document.addPage();
    addPageChrome(document, snapshot, pageIndex + 1, pages.length);
    let y = contentTop;
    for (const line of lines) {
      const size = lineSize(line.kind);
      const color = ['title', 'heading'].includes(line.kind) ? '#0b6b39' : '#18221c';
      if (line.text) {
        drawMixedLine(document, line.text, margin, y, size, color);
      }
      y += line.height;
    }
  });
}

async function collectDocument(document: PDFKit.PDFDocument): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    document.end();
  });
}

export interface GeneratedMarketplaceContractPdf {
  checksumSha256: string;
  content: Uint8Array;
  mediaType: 'application/pdf';
}

export async function generateMarketplaceContractPdf(
  snapshot: MarketplaceContractArtifactSnapshot,
  snapshotFingerprint: string,
): Promise<GeneratedMarketplaceContractPdf> {
  const createdAt = new Date(snapshot.contractCreatedAt);
  const document = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
    displayTitle: true,
    info: {
      Author: 'DehqonHub',
      CreationDate: createdAt,
      Keywords: 'DehqonHub, marketplace, mock contract artifact',
      ModDate: createdAt,
      Subject: 'Non-production immutable marketplace contract artifact',
      Title: `DehqonHub Contract ${snapshot.contractId}`,
    },
    lang: 'uz-Cyrl',
    layout: 'portrait',
    margin: 0,
    pdfVersion: '1.7ext3',
    size: 'A4',
    tagged: true,
  });
  for (const [name, path] of Object.entries(fonts)) {
    document.registerFont(name, path);
  }
  const pages = paginate(documentLines(snapshot, snapshotFingerprint));
  renderDocument(document, snapshot, pages);
  const content = await collectDocument(document);
  return {
    checksumSha256: createHash('sha256').update(content).digest('hex'),
    content,
    mediaType: 'application/pdf',
  };
}

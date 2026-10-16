// Mock data for the Pending inventory screen. The first rows are copied from
// the live module (screenshot, 14 Oct 2026); the rest are generated so
// pagination has 371 rows to page through, matching the header stats.

export type ReviewType = 'New record' | 'Similar record' | 'User updated';
export type InventoryType = 'Vendors' | 'Entities' | 'Assets' | 'Processing activities';

export interface PendingRecord {
  id: number;
  name: string;
  reviewType: ReviewType;
  inventoryType: InventoryType;
  sourceType: string | null;
  owner: string;
  lastUpdated: string; // ISO date
  /** Set when the row is a record drafted with Author with AI. */
  aiDraft?: { completeness: number };
}

// Header stats as the API reports them. Not derived from the rows, because the
// generated rows don't model every review type.
export const PENDING_SUMMARY = {
  total: 371,
  newRecords: 166,
  updatedRecords: 1,
  similarRecords: 71,
};

const FROM_SCREENSHOT: PendingRecord[] = [
  { id: 891, name: 'Amul', reviewType: 'New record', inventoryType: 'Vendors', sourceType: 'User Created', owner: 'Kevin Marshall', lastUpdated: '2026-10-12' },
  { id: 820, name: 'Atlassian', reviewType: 'Similar record', inventoryType: 'Vendors', sourceType: null, owner: 'Kevin Marshall', lastUpdated: '2026-10-09' },
  { id: 800, name: 'Amazon.com, Inc', reviewType: 'Similar record', inventoryType: 'Vendors', sourceType: null, owner: 'Kevin Marshall', lastUpdated: '2026-10-09' },
  { id: 804, name: 'MIcrosoft', reviewType: 'Similar record', inventoryType: 'Vendors', sourceType: null, owner: 'Kevin Marshall', lastUpdated: '2026-10-09' },
  { id: 827, name: 'Walmart, Inc.', reviewType: 'New record', inventoryType: 'Vendors', sourceType: null, owner: 'Kevin Marshall', lastUpdated: '2026-10-09' },
  { id: 823, name: 'GitHub', reviewType: 'Similar record', inventoryType: 'Vendors', sourceType: null, owner: 'Kevin Marshall', lastUpdated: '2026-10-02' },
  { id: 788, name: 'AWS', reviewType: 'New record', inventoryType: 'Vendors', sourceType: null, owner: 'Kevin Marshall', lastUpdated: '2026-10-02' },
  { id: 790, name: 'apple', reviewType: 'New record', inventoryType: 'Vendors', sourceType: null, owner: 'Kevin Marshall', lastUpdated: '2026-10-02' },
  { id: 752, name: '1st National Payment Solutions', reviewType: 'User updated', inventoryType: 'Vendors', sourceType: null, owner: 'Kevin Marshall', lastUpdated: '2026-10-02' },
  { id: 9638, name: '#entity-1', reviewType: 'Similar record', inventoryType: 'Entities', sourceType: 'User Created', owner: 'Kevin Marshall', lastUpdated: '2026-09-22' },
  { id: 890, name: 'Test Cloud Partner Vishnu', reviewType: 'New record', inventoryType: 'Vendors', sourceType: 'User Created', owner: 'Kevin Marshall', lastUpdated: '2026-09-17' },
  { id: 889, name: 'Test Cloud Partner', reviewType: 'New record', inventoryType: 'Vendors', sourceType: 'User Created', owner: 'Kevin Marshall', lastUpdated: '2026-09-17' },
  { id: 886, name: 'PENTEST-VALIDATE-VENDOR-9D271196-188C-4935-B187-AE13E23A9F04', reviewType: 'New record', inventoryType: 'Vendors', sourceType: null, owner: 'Kevin Marshall', lastUpdated: '2026-09-03' },
  { id: 885, name: 'DIRECT-XVENDOR-bb2971a3-154a-452f-9a2d-575de139deff', reviewType: 'New record', inventoryType: 'Vendors', sourceType: null, owner: 'Kevin Marshall', lastUpdated: '2026-09-02' },
  { id: 884, name: 'PENTEST-XVENDOR-6acf1e2b-6464-43d5-9dec-385b435ca8dd', reviewType: 'New record', inventoryType: 'Vendors', sourceType: null, owner: 'Kevin Marshall', lastUpdated: '2026-09-02' },
];

const NAMES = [
  'Salesforce', 'Workday', 'Zendesk', 'Slack Technologies', 'Snowflake', 'HubSpot', 'Okta',
  'ServiceNow', 'Adobe', 'Zoom Video Communications', 'Dropbox', 'Box', 'DocuSign', 'Twilio',
  'Stripe', 'Mailchimp', 'Segment', 'Datadog', 'Cloudflare', 'Google Workspace', 'SAP SuccessFactors',
  'Oracle NetSuite', 'Freshworks', 'Intercom', 'Gong', 'Marketo', 'Qualtrics', 'Greenhouse',
  'ADP', 'Concur', 'Coupa', 'Miro', 'Asana', 'Monday.com', 'Notion Labs',
];
const INVENTORY: InventoryType[] = ['Vendors', 'Vendors', 'Vendors', 'Assets', 'Entities', 'Processing activities'];
const REVIEW: ReviewType[] = ['New record', 'Similar record', 'New record'];

function generated(): PendingRecord[] {
  const rows: PendingRecord[] = [];
  const start = Date.UTC(2026, 8, 1); // 1 Sep 2026, older than the screenshot rows
  for (let i = 0; rows.length < PENDING_SUMMARY.total - FROM_SCREENSHOT.length; i++) {
    const base = NAMES[i % NAMES.length];
    const round = Math.floor(i / NAMES.length);
    rows.push({
      id: 883 - i,
      name: round === 0 ? base : `${base} (${round + 1})`,
      reviewType: REVIEW[i % REVIEW.length],
      inventoryType: INVENTORY[i % INVENTORY.length],
      sourceType: i % 4 === 0 ? 'User Created' : null,
      owner: 'Kevin Marshall',
      lastUpdated: new Date(start - Math.floor(i / 3) * 86_400_000).toISOString().slice(0, 10),
    });
  }
  return rows;
}

export const PENDING_RECORDS: PendingRecord[] = [...FROM_SCREENSHOT, ...generated()];

import { getCurrentUser } from "@/lib/auth/session";
import {
  CUSTOMER_SOURCE_META,
  CUSTOMER_STATUS_META,
  isCustomerSource,
  isCustomerStatus,
} from "@/lib/customers";
import { formatDate, getLocale, getTranslations } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings/server";
import { getCustomerPins } from "@/server/queries";

/**
 * The lead list as a spreadsheet.
 *
 * CSV rather than a real .xlsx, and that is a deliberate trade rather than a
 * shortcut. Excel opens this by double-click, so does Sheets and so does
 * Numbers, and the alternative is a dependency that writes a zipped XML format
 * — weight this app would carry forever to gain formatting nobody asked for.
 * If somebody one day needs merged cells and a logo, that is when to add one.
 *
 * The first route handler in the app, and it exists because a download is the
 * one thing a server action cannot do: an action returns a value to React, not
 * a response with a `Content-Disposition` on it.
 *
 * It is a GET a browser follows from a plain link, so it re-derives everything
 * from the request rather than trusting anything in it:
 *
 *   - `getCurrentUser()` and the `customer.enabled` switch, checked here in
 *     full. Being under `(app)/` grants a route handler nothing — the layout
 *     does not run for it, and middleware only ever saw that a cookie existed.
 *   - the two filters, re-parsed through the same guards the page uses, so an
 *     unrecognised value means "no filter" rather than an error.
 *
 * There is nothing to narrow by caller: the board is shared, exactly as
 * `getCustomerPins()` says. Every signed-in employee may read every lead, so
 * every signed-in employee may export them.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const settings = await getSettings();
  if (!settings["customer.enabled"]) {
    return new Response("Not found", { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const sourceParam = params.get("source");
  const statusParam = params.get("status");
  const source =
    sourceParam && isCustomerSource(sourceParam) ? sourceParam : null;
  const status =
    statusParam && isCustomerStatus(statusParam) ? statusParam : null;

  const [t, locale, pins] = await Promise.all([
    getTranslations(),
    getLocale(),
    getCustomerPins(),
  ]);

  // The same flattening and the same arrival-date fallback the page uses. If
  // one of them changes, the export and the screen must change together — a
  // spreadsheet that disagrees with the page it was downloaded from is worse
  // than no spreadsheet.
  const leads = pins
    .flatMap((pin) =>
      pin.customers.map((customer) => ({
        ...customer,
        arrivedAt: customer.firstContactedAt ?? customer.createdAt,
        arrivalAssumed: customer.firstContactedAt === null,
        pin,
      })),
    )
    .filter(
      (lead) =>
        (source === null || lead.source === source) &&
        (status === null || lead.status === status),
    )
    .sort((a, b) => b.arrivedAt.getTime() - a.arrivedAt.getTime());

  const header = [
    t("customers.firstContactedAt"),
    t("customers.recordedOn"),
    t("customers.customerName"),
    t("tasks.status"),
    t("customers.source"),
    t("customers.place"),
    t("customers.address"),
    t("customers.coordinates"),
    t("customers.contactName"),
    t("customers.phone"),
    t("customers.email"),
    t("customers.lineId"),
    t("customers.owner"),
    t("customers.lastContactedAt"),
    t("customers.note"),
  ];

  const rows = leads.map((lead) => [
    formatDate(lead.arrivedAt, locale),
    // A separate column rather than a note appended to the date: a spreadsheet
    // is sorted and filtered, and "2 ก.ย. (วันที่บันทึก)" sorts as text.
    lead.arrivalAssumed ? t("common.yes") : t("common.no"),
    lead.name,
    t(CUSTOMER_STATUS_META[lead.status].label),
    t(CUSTOMER_SOURCE_META[lead.source].label),
    lead.pin.label ?? "",
    lead.pin.address ?? "",
    `${lead.pin.latitude}, ${lead.pin.longitude}`,
    lead.contactName ?? "",
    lead.phone ?? "",
    lead.email ?? "",
    lead.lineId ?? "",
    lead.owner ? `${lead.owner.employeeCode} — ${lead.owner.fullName}` : "",
    lead.lastContactedAt ? formatDate(lead.lastContactedAt, locale) : "",
    lead.note ?? "",
  ]);

  /*
   * A BOM, and CRLF line endings.
   *
   * Without the BOM, Excel on Windows reads the file in the system code page
   * and every Thai character in it becomes mojibake — which is most of this
   * file. Sheets and LibreOffice guess UTF-8 correctly and ignore the BOM, so
   * it costs them nothing. CRLF for the same audience.
   */
  const csv =
    "﻿" +
    [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n";

  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="entech-leads-${today}.csv"`,
      // Contact details for real people. Nothing may keep a copy of this.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * One cell, quoted — and defused.
 *
 * Every value here was typed by a person into a shared board, and a spreadsheet
 * treats a leading `=`, `+`, `-` or `@` as the start of a **formula**. A lead
 * named `=HYPERLINK(...)` would execute on open in the reader's Excel, not
 * ours; prefixing an apostrophe makes the cell text, which is what a name is.
 * The tab and carriage return are in the list because Excel accepts them as
 * leading whitespace before a formula character.
 *
 * Everything is quoted rather than only what needs it: a quoted cell cannot be
 * broken by a comma, a quote or a newline in a note, and deciding per cell is
 * how that bug arrives later.
 */
function csvCell(value: string): string {
  const defused = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${defused.replace(/"/g, '""')}"`;
}

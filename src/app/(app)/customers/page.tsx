import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CustomerMap } from "@/components/customer-map";
import { requireUser } from "@/lib/auth/rbac";
import { serialiseCustomerPin } from "@/lib/serialise";
import { getSettings } from "@/lib/settings/server";
import { getAssignableEmployees, getCustomerPins } from "@/server/queries";

export const metadata: Metadata = { title: "แผนที่ลูกค้า / Customer map" };

/**
 * The customer map, full-bleed.
 *
 * The only page in the app that does not render a `PageShell`: it renders its
 * own `<main>` (inside CustomerMap) and takes the whole viewport under the
 * header. That is why the shared `<main>` moved out of the app layout — see the
 * header of src/components/page-shell.tsx.
 *
 * `customer.enabled` is classified `reads`, and this is what makes that true
 * rather than decorative: the switch is checked before either query runs, so
 * turning the map off stops the app fetching pins at all. The nav link
 * disappears with it, but the link is not what protects anything — this guard
 * is, and `notFound()` rather than a redirect because a switched-off feature
 * genuinely has no page.
 */
export default async function CustomersPage() {
  const user = await requireUser();
  const settings = await getSettings();

  if (!settings["customer.enabled"]) notFound();

  // Two reads, sent together: one round trip's latency for both. The employee
  // list feeds the owner select in every form on the page.
  const [pins, people] = await Promise.all([
    getCustomerPins(),
    getAssignableEmployees(),
  ]);

  return (
    <CustomerMap
      pins={pins.map(serialiseCustomerPin)}
      people={people.map((person) => ({
        id: person.id,
        employeeCode: person.employeeCode,
        fullName: person.fullName,
      }))}
      // Draws the delete controls. It decides nothing about whether the delete
      // is allowed — assertAdmin in the action settles that.
      isAdmin={user.role === "ADMIN"}
    />
  );
}

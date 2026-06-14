import { redirect } from "next/navigation";

/* The standalone Payouts view folded into Financials. Its content is now the
   Commission tab at /financials?tab=commission. This redirect keeps any stale
   bookmark or pasted link landing on the right pane. */

export default function PayoutsRedirect() {
  redirect("/financials?tab=commission");
}

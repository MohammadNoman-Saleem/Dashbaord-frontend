import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardHeader } from "@/components/ui/Card";
import { TITLES } from "@/config/titles";

/* Shared placeholder body for routes whose real panels land in the next
   stage. Renders the page title and subtitle from config/titles plus one
   full-width card carrying a data-focus-id, so ?focus= deep links have a
   real element to scroll to and flash. */

type PlaceholderViewProps = {
  view: keyof typeof TITLES;
  /* The data-focus-id deep links land on. */
  focusId: string;
  note?: string;
};

export function PlaceholderView({ view, focusId, note }: PlaceholderViewProps) {
  const title = TITLES[view];
  return (
    <>
      <div className="mb-4 mt-[10px]">
        <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{title.title}</h2>
        <p className="text-[13.5px] text-ink-2">{title.sub}</p>
      </div>
      <Grid>
        <div className={`${spans.c12} rounded-card`} data-focus-id={focusId}>
          <Card>
            <CardHeader
              title="This view is on its way"
              subtitle={note ?? "The shell, navigation, theme, and deep links already work."}
            />
            <div className="px-[18px] pb-4 pt-2 text-[13px] text-ink-2">
              The panels for this view land in the next stage.
            </div>
          </Card>
        </div>
      </Grid>
    </>
  );
}

/* Greeting block at the top of the home view. Mirrors .greet from the
   approved mockup: 10px top and 16px bottom margin, serif h2 at 26px (22px
   under 880px, per the typography table) with 4px below it, muted 13.5px
   subtitle. The h2 picks up the serif face and title color from the global
   base styles. */

type GreetingBlockProps = {
  greeting: string;
  subtitle: string;
};

export function GreetingBlock({ greeting, subtitle }: GreetingBlockProps) {
  return (
    <div className="mb-4 mt-[10px]">
      <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{greeting}</h2>
      <p className="text-[13.5px] text-ink-2">{subtitle}</p>
    </div>
  );
}

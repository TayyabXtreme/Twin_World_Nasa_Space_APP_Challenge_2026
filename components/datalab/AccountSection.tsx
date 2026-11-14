import { ExternalLink, KeyRound } from "lucide-react";
import { DATASETS, type Dataset } from "@/lib/data/datasets";
import { cn } from "@/lib/utils";
import { WORLD_DOT } from "./parts";

/** What judges (or anyone) could add with a free Earthdata, Copernicus, EODMS or G-Portal login. */
export function AccountSection() {
  const missing = DATASETS.filter((d) => d.status === "needs-account");
  const upgrades = DATASETS.filter((d) => d.status !== "needs-account" && d.account);
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Group title="Not downloaded: a free login unlocks them" items={missing} />
      <Group title="Already downloaded: a login adds more dates or the full product" items={upgrades} />
    </div>
  );
}

function Group({ title, items }: { title: string; items: Dataset[] }) {
  return (
    <div>
      <h3 className="hud text-[11px] tracking-wider text-muted-foreground uppercase">
        {title} <span className="text-foreground">· {items.length}</span>
      </h3>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((d) => (
          <li key={d.id} className="glass rounded-xl p-3.5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.74_0.13_300/0.12)] text-[oklch(0.82_0.1_300)]">
                <KeyRound className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium">
                  <span className={cn("size-1.5 rounded-full", WORLD_DOT[d.world])} aria-hidden />
                  {d.name}
                  <span className="hud text-[11px] font-normal text-muted-foreground">{d.agency}</span>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/85">{d.account!.adds}.</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.account!.how}</p>
                <a
                  href={d.account!.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-[oklch(0.82_0.1_300)] hover:underline"
                >
                  {new URL(d.account!.url).hostname}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

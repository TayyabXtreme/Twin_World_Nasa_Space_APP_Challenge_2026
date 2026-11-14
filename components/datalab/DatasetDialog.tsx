"use client";

import { ArrowUpRight, ExternalLink, KeyRound, TriangleAlert, XIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "radix-ui";
import { FEATURE_INFO, STATUS_INFO, formatBytes, type Dataset } from "@/lib/data/datasets";
import { DatasetBadge, PreviewPlaceholder, StatusBadge, WorldChip } from "./parts";

/** Full record for one dataset: every field, licence, credit, caveats, gallery and the source link. */
export function DatasetDialog({ dataset, onClose }: { dataset: Dataset | null; onClose: () => void }) {
  return (
    <DialogPrimitive.Root open={dataset !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className="fixed inset-x-2 bottom-2 z-50 flex max-h-[88dvh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-popover text-popover-foreground shadow-2xl outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-6 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-6 sm:inset-x-auto sm:start-1/2 sm:top-1/2 sm:bottom-auto sm:max-h-[86dvh] sm:w-[min(48rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:data-open:slide-in-from-bottom-2 sm:data-open:zoom-in-95 rtl:sm:translate-x-1/2"
          aria-describedby={dataset ? "dataset-measures" : undefined}
        >
          {dataset && <Body d={dataset} />}
          <DialogPrimitive.Close className="absolute end-3 top-3 z-10 flex size-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-foreground/90 backdrop-blur-md transition-transform duration-150 hover:bg-black/70 active:scale-95">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Body({ d }: { d: Dataset }) {
  const facts: [string, React.ReactNode][] = [
    ["Agency", d.agency],
    ["Archive", d.archive],
    ["Mission", d.mission],
    ["Instrument", d.instrument],
    ["Product", <span key="p" className="hud text-[12px] break-words">{d.productId}</span>],
    ["Resolution", d.resolution],
    ["Coverage", d.coverage],
    ["Observed", d.period],
    [
      "Size",
      <span key="s">
        <span className="hud">{d.sizeBytes == null ? "Not stored" : formatBytes(d.sizeBytes)}</span>
        {d.sizeNote && <span className="text-muted-foreground"> · {d.sizeNote}</span>}
      </span>,
    ],
    ["Format", d.format],
    ["Licence", d.licence],
    ["Credit", d.credit],
  ];
  if (d.localPath) facts.push(["In the repo", <span key="l" className="hud text-[12px] break-all">{d.localPath}</span>]);

  return (
    <div className="overflow-y-auto overscroll-contain">
      <div className="relative aspect-[2/1] w-full overflow-hidden bg-[oklch(0.14_0.02_262)] sm:aspect-[5/2]">
        {d.preview ? (
          <Image src={d.preview.src} alt={d.preview.alt} fill sizes="(min-width: 640px) 48rem, 100vw" className="object-cover" />
        ) : (
          <PreviewPlaceholder dataset={d} />
        )}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-popover to-transparent" />
        <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
          <StatusBadge status={d.status} />
          <WorldChip world={d.world} />
        </div>
      </div>

      <div className="flex flex-col gap-6 px-4 pt-1 pb-5 sm:px-6 sm:pb-6">
        <header className="flex flex-col gap-2">
          <DatasetBadge dataset={d} />
          <DialogPrimitive.Title className="font-heading text-xl leading-tight font-semibold tracking-tight sm:text-2xl">{d.name}</DialogPrimitive.Title>
          <p id="dataset-measures" className="text-[0.98rem] leading-relaxed text-foreground/85">
            {d.measures}
          </p>
          <p className="text-xs text-muted-foreground">{STATUS_INFO[d.status].hint}</p>
        </header>

        <dl className="grid gap-x-6 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-t border-border py-2.5 text-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 leading-snug">{v}</dd>
            </div>
          ))}
        </dl>

        <section aria-label="Used by">
          <h3 className="hud text-[11px] tracking-wider text-muted-foreground uppercase">Used by</h3>
          {d.usedBy.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {d.usedBy.map((f) => (
                <li key={f}>
                  <Link
                    href={FEATURE_INFO[f].href}
                    title={FEATURE_INFO[f].hint}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                  >
                    {FEATURE_INFO[f].label}
                    <ArrowUpRight className="size-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Reference only: catalogued for future work, not used by a feature yet.</p>
          )}
        </section>

        {d.caveats.length > 0 && (
          <section aria-label="Limits" className="rounded-xl border border-warn/25 bg-warn/[0.06] p-3.5">
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-warn">
              <TriangleAlert className="size-4" aria-hidden />
              Know the limits
            </h3>
            <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-sm leading-relaxed text-foreground/85">
              {d.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
        )}

        {d.gallery && d.gallery.length > 0 && (
          <section aria-label="Gallery">
            <h3 className="hud text-[11px] tracking-wider text-muted-foreground uppercase">
              {d.gallery.length} {d.gallery.length === 1 ? "image" : "images"}
            </h3>
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {d.gallery.map((g) => (
                <li key={g.src} className="min-w-0">
                  <figure>
                    <Image
                      src={g.src}
                      alt={g.alt}
                      width={g.w}
                      height={g.h}
                      sizes="(min-width: 640px) 120px, 30vw"
                      className="aspect-square w-full rounded-lg bg-white/5 object-cover"
                    />
                    <figcaption className="mt-1 line-clamp-2 text-[11px] leading-tight text-muted-foreground">{g.caption}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </section>
        )}

        {d.account && (
          <section aria-label="With a free account" className="rounded-xl border border-[oklch(0.74_0.13_300/0.3)] bg-[oklch(0.74_0.13_300/0.07)] p-3.5 text-sm">
            <h3 className="flex items-center gap-1.5 font-medium text-[oklch(0.82_0.1_300)]">
              <KeyRound className="size-4" aria-hidden />
              With a free account
            </h3>
            <p className="mt-1.5 leading-relaxed">{d.account.adds}.</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">{d.account.how}</p>
            <a href={d.account.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-[oklch(0.82_0.1_300)] hover:underline">
              {new URL(d.account.url).hostname}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </section>
        )}

        <a
          href={d.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform duration-150 hover:bg-primary/90 active:scale-[0.97]"
        >
          Open at the source
          <ExternalLink className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}

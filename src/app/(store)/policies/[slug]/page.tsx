import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { POLICIES, policyBySlug } from "@/lib/policies";

export function generateStaticParams() {
  return POLICIES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/policies/[slug]">): Promise<Metadata> {
  const policy = policyBySlug((await params).slug);
  return policy ? { title: policy.title } : {};
}

/** "## " heading, "- " list item, else a paragraph. Consecutive list items become one list. */
function render(body: string) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`ul${out.length}`} className="my-3 list-disc space-y-1.5 pl-6">{list.map((li) => <li key={li}>{li}</li>)}</ul>);
    list = [];
  };
  for (const line of body.split("\n")) {
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      continue;
    }
    flush();
    if (line.startsWith("## ")) out.push(<h2 key={out.length} className="mt-8 text-[19px] font-bold text-ink">{line.slice(3)}</h2>);
    else if (line.trim()) out.push(<p key={out.length} className="mt-3">{line}</p>);
  }
  flush();
  return out;
}

async function Policy({ params }: { params: PageProps<"/policies/[slug]">["params"] }) {
  const policy = policyBySlug((await params).slug);
  if (!policy) notFound();
  return (
    <>
      <h1 className="text-[30px] font-bold text-ink md:text-[40px]">{policy.title}</h1>
      <div className="mt-4">{render(policy.body)}</div>
    </>
  );
}

export default function PolicyPage(props: PageProps<"/policies/[slug]">) {
  return (
    <article className="mx-auto max-w-[740px] px-4 py-12 text-[15px] leading-relaxed text-ink/85 md:py-16">
      <Suspense fallback={<div className="h-10 w-64 animate-pulse rounded bg-soft" />}>
        <Policy params={props.params} />
      </Suspense>
    </article>
  );
}

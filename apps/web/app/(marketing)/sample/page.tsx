import { redirect } from "next/navigation";
import { TRADES, withBase } from "@216leads/shared";
import { Button, Card, Input, Label, Select } from "@/components/ui";

export const metadata = { title: "See a sample" };

export default async function SampleIndex({ searchParams }: { searchParams: Promise<{ trade?: string; zip?: string }> }) {
  const sp = await searchParams;
  const trade = TRADES.find((t) => t.key === sp.trade)?.key ?? "roofing";
  if (sp.zip && /^\d{5}$/.test(sp.zip.trim())) redirect(`/sample/${trade}/${sp.zip.trim()}`);
  return (
    <section className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">See your sample</h1>
      <p className="mt-2 text-slate">Real counts from this week&apos;s public records for your trade in one ZIP code. House numbers are hidden.</p>
      <Card className="mt-6 p-5">
        <form action={withBase("/sample")} method="get" className="space-y-4">
          <div>
            <Label htmlFor="trade">Your trade</Label>
            <Select id="trade" name="trade" defaultValue={trade}>{TRADES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
          </div>
          <div>
            <Label htmlFor="zip">ZIP code</Label>
            <Input id="zip" name="zip" inputMode="numeric" pattern="\d{5}" placeholder="44107" required defaultValue={sp.zip ?? ""} />
          </div>
          <Button type="submit">Show my sample</Button>
        </form>
      </Card>
    </section>
  );
}

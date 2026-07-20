import { redirect } from "next/navigation";

export default async function WedstrijdanalysesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>;
}) {
  const { match } = await searchParams;
  redirect(match ? `/resultaten?match=${match}` : "/resultaten");
}
